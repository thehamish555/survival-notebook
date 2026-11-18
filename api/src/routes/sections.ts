import { Hono } from 'hono'
import { z } from 'zod'
import { canEdit, getRole } from '../access'
import { requireAuth } from '../middleware'
import { diffRows, logActivity } from '../activity'
import { listOf, newAssignments, newDeaths, newlyBuilt, newlyDone, rowsIn, stampBy, whoAndWhere } from '../push'
import { OWN_RE, SECTIONS } from '../seed'
import type { AppEnv, Ctx } from '../types'

const Rows = z.array(z.object({ id: z.string().min(1).max(64) }).passthrough()).max(5000)
const Notes = z.string().max(100_000)
// baseRev (optional): only write if the section is still at the revision you read — otherwise 409, so clients can re-read and retry.
const Body = z.object({ data: z.unknown(), baseRev: z.number().int().min(0).optional() })
const validName = (n: string) => (SECTIONS as readonly string[]).includes(n) || OWN_RE.test(n)

export const sectionRoutes = (ctx: Ctx) => {
  const { db, bus } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)

  // Drop uploaded files no farm row references any more (10 min grace for uploads still in flight)
  const sweep = (nb: string, rows: { file?: { id?: string } | null }[]) => {
    const keep = new Set(rows.map(x => x?.file?.id).filter(Boolean))
    for (const f of db.prepare('select id from files where nb=? and created<?').all(nb, Date.now() - 600_000) as { id: string }[]) if (!keep.has(f.id)) db.prepare('delete from files where id=?').run(f.id)
  }

  // Push notifications. Never to the person who made the change.
  // To-dos and farms: "Hamish assigned you …" to the new assignee; "Sam finished …" to whoever made the to-do; "Sam built …" to everyone.
  // Deaths: "Sam died …" to everyone else.
  const notifyChanges = (nb: string, by: string, section: string, prev: string | undefined, next: any[]) => {
    const memberIds = (db.prepare('select user from members where nb=?').all(nb) as { user: string }[]).map(m => m.user), members = new Set(memberIds)
    const others = memberIds.filter(m => m !== by), clip = (s: unknown, d: string) => String(s || d).slice(0, 80)
    const who = () => whoAndWhere(db, nb, by)
    if (section === 'todos' || section === 'farms') {
      const farm = section === 'farms', url = `/n/${nb}#${farm ? 'farms' : 'todo'}`
      for (const r of newAssignments(prev, next, by, members)) { const { name, title } = who(); ctx.notify(r.assignee, { title, body: `${name} assigned you ${farm ? `the farm “${clip(r.name, 'Unnamed farm')}”` : `“${clip(r.project, 'Untitled to-do')}”`}`, url }, 'assigned') }
      if (!farm) for (const r of newlyDone(prev, next, by)) if (members.has(r.by)) { const { name, title } = who(); ctx.notify(r.by, { title, body: `${name} finished “${clip(r.project, 'Untitled to-do')}”`, url }, 'finished') }
      if (farm) for (const r of newlyBuilt(prev, next)) { const { name, title } = who(); for (const m of others) ctx.notify(m, { title, body: `${name} built the farm “${clip(r.name, 'Unnamed farm')}”`, url }, 'built') }
    }
    if (section === 'todos' || section === 'coords') {   // gathered for a minute, so a row that's still being typed goes out with its real name
      const prevRows = new Map(rowsIn(prev).map(r => [r?.id, r])), field = section === 'todos' ? 'project' : 'name'
      const fresh = next.filter(r => r && !r.auto && (!prevRows.has(r.id) || !String(prevRows.get(r.id)?.[field] || '').trim())).map(r => String(r.id))
      if (fresh.length) later(nb, by, section, fresh)
    }
    if (section === 'deaths') for (const r of newDeaths(prev, next)) {
      const { title } = who(), dead = whoAndWhere(db, nb, typeof r.uid === 'string' ? r.uid : by).name
      const where = r.nether ? ' in the Nether' : r.end ? ' in the End' : ''
      for (const m of memberIds.filter(m => m !== r.uid && m !== by)) ctx.notify(m, { title, body: r.cause ? clip(r.cause, '') : `${dead} died${where}`, url: `/n/${nb}#deaths` }, 'deaths')
    }
  }

  // New places and to-dos: "Sam added 3 places: Base, Iron farm and Mesa". Sent a minute after the first one, with the names as they are by then.
  const pending = new Map<string, { ids: Set<string>; timer: ReturnType<typeof setTimeout> }>()
  const later = (nb: string, by: string, section: string, ids: string[]) => {
    const key = `${nb}|${by}|${section}`, p = pending.get(key)
    if (p) { ids.forEach(i => p.ids.add(i)); return }
    const timer = setTimeout(() => { const q = pending.get(key); pending.delete(key); if (q) sendAdded(nb, by, section, q.ids) }, ctx.config.NODE_ENV === 'test' ? 20 : 60_000)
    timer.unref?.(); pending.set(key, { ids: new Set(ids), timer })
  }
  const sendAdded = (nb: string, by: string, section: string, ids: Set<string>) => {
    const raw = (db.prepare('select data from sections where nb=? and name=?').get(nb, section) as { data: string } | undefined)?.data
    const places = section === 'coords', names = rowsIn(raw).filter(r => ids.has(String(r?.id))).map(r => String((places ? r.name : r.project) || '').trim().slice(0, 60)).filter(Boolean)
    if (!names.length) return
    const { name, title } = whoAndWhere(db, nb, by)
    const what = names.length === 1 ? `${places ? 'the place' : 'the to-do'} “${names[0]}”` : `${names.length} ${places ? 'places' : 'to-dos'}: ${listOf(names)}`
    for (const { user } of db.prepare('select user from members where nb=? and user<>?').all(nb, by) as { user: string }[])
      ctx.notify(user, { title, body: `${name} added ${what}`, url: `/n/${nb}#${places ? 'coordinates' : 'todo'}` }, places ? 'places' : 'todos')
  }

  r.get('/notebooks/:id/s/:name', auth, c => {
    const id = c.req.param('id'), name = c.req.param('name')
    if (!validName(name)) return c.json({ error: 'bad section' }, 400)
    if (!getRole(db, id, c.get('uid'))) return c.json({ error: 'not found' }, 404)
    const row = db.prepare('select data, rev from sections where nb=? and name=?').get(id, name) as { data: string; rev: number } | undefined
    return c.json(row ? { data: JSON.parse(row.data), rev: row.rev } : { data: name === 'notes' ? '' : [], rev: 0 })
  })

  r.put('/notebooks/:id/s/:name', auth, async c => {
    const id = c.req.param('id'), name = c.req.param('name'), uid = c.get('uid')
    const own = name.match(OWN_RE), ownerOf = own?.[2]
    if (!validName(name)) return c.json({ error: 'bad section' }, 400)
    if (!canEdit(getRole(db, id, uid))) return c.json({ error: 'forbidden' }, 403)
    if (ownerOf && ownerOf !== uid) return c.json({ error: `You can only edit your own ${own![1]}` }, 403)   // gear and prefs are per member
    const body = Body.safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json({ error: 'Invalid request' }, 400)
    const data = (name === 'notes' ? Notes : Rows).safeParse(body.data.data); if (!data.success) return c.json({ error: 'Invalid data for this section' }, 400)
    let raw = JSON.stringify(data.data); if (raw.length > 512_000) return c.json({ error: 'Too large' }, 413)
    const result = db.transaction(() => {
      const prev = db.prepare('select data, rev from sections where nb=? and name=?').get(id, name) as { data: string; rev: number } | undefined
      const cur = prev?.rev ?? 0
      if (body.data.baseRev !== undefined && body.data.baseRev !== cur) return { conflict: cur }
      if (name === 'todos' || name === 'farms') { data.data = stampBy(prev?.data, data.data as any[], uid); raw = JSON.stringify(data.data) }
      const detail = name === 'notes' ? { added: [], changed: [], removed: [], edited: (prev ? JSON.parse(prev.data) : '') !== data.data } : diffRows(prev?.data, data.data as any[])
      if ((own?.[1] === 'gear' || !own) && name !== 'shop') logActivity(db, id, uid, own ? 'gear' : name, detail, c.get('mod') ? 'mod' : '')
      db.prepare('insert into sections values(?,?,?,1) on conflict(nb,name) do update set data=excluded.data, rev=rev+1').run(id, name, raw)
      return { rev: (db.prepare('select rev from sections where nb=? and name=?').get(id, name) as { rev: number }).rev, prev: prev?.data }
    })()
    if ('conflict' in result) return c.json({ error: 'Out of date — someone else changed this just now', rev: result.conflict }, 409)
    if (name === 'farms') sweep(id, data.data as any[])
    if (name === 'todos' || name === 'farms' || name === 'deaths' || name === 'coords') notifyChanges(id, uid, name, result.prev, data.data as any[])
    bus.emit(id, { section: name, rev: result.rev, by: uid, cid: c.req.header('x-client-id') || '' })   // cid lets a browser tab ignore its own echo but see edits from the mod or other tabs
    return c.json({ rev: result.rev })
  })
  return r
}

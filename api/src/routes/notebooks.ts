import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canEdit, getRole } from '../access'
import { describe } from '../activity'
import { requireAuth } from '../middleware'
import { SECTIONS, seed } from '../seed'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Create = z.object({ title: z.string().trim().max(80).optional() })
const Rename = z.object({ title: z.string().trim().min(1, 'Title can’t be empty').max(80) })

export const notebookRoutes = (ctx: Ctx) => {
  const { db, bus } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)
  r.get('/notebooks', auth, c => c.json(db.prepare(`select n.id, n.title, m.role, n.created,
      (select count(*) from members x where x.nb=n.id) as memberCount, (select max(ts) from activity a where a.nb=n.id) as lastActive
    from notebooks n join members m on m.nb=n.id where m.user=? order by coalesce(lastActive, n.created) desc`).all(c.get('uid'))))

  r.get('/notebooks/:id/activity', auth, c => {
    const id = c.req.param('id'); if (!getRole(db, id, c.get('uid'))) return c.json({ error: 'not found' }, 404)
    const rows = db.prepare(`select a.id, a.section, a.detail, a.via, a.ts, coalesce(nullif(m.nick,''), u.name, 'Someone') as name
      from activity a left join users u on u.id=a.user left join members m on m.nb=a.nb and m.user=a.user where a.nb=? order by a.id desc limit 30`).all(id) as any[]
    return c.json(rows.map(x => ({ id: x.id, name: x.name, via: x.via, ts: x.ts, section: x.section, text: describe(x.section, JSON.parse(x.detail)) })))
  })

  r.post('/notebooks', auth, async c => {
    const b = await readBody(c, Create); if (!b.ok) return b.res
    const id = randomUUID(), uid = c.get('uid'), s = seed()
    db.transaction(() => {
      db.prepare('insert into notebooks values(?,?,?,?)').run(id, b.data.title || 'My World', uid, Date.now())
      db.prepare("insert into members(nb,user,role) values(?,?,'owner')").run(id, uid)
      for (const k of SECTIONS) db.prepare('insert into sections values(?,?,?,1)').run(id, k, JSON.stringify(s[k]))
    })()
    return c.json({ id })
  })

  r.get('/notebooks/:id', auth, c => {
    const id = c.req.param('id'), uid = c.get('uid'), role = getRole(db, id, uid)
    if (!role) return c.json({ error: 'not found' }, 404)
    const sections: Record<string, { data: unknown; rev: number }> = {}
    for (const s of db.prepare('select name,data,rev from sections where nb=?').all(id) as { name: string; data: string; rev: number }[]) sections[s.name] = { data: JSON.parse(s.data), rev: s.rev }
    const rows = db.prepare("select u.id, u.name as realName, m.nick, u.email, m.role from members m join users u on u.id=m.user where m.nb=? order by case m.role when 'owner' then 0 else 1 end, lower(u.name)").all(id) as any[]
    // Only the owner (and each person themselves) sees real names and emails; everyone else sees display names/nicknames.
    const members = rows.map(m => { const see = role === 'owner' || m.id === uid; return { id: m.id, name: m.nick || m.realName, nick: m.nick, role: m.role, realName: see ? m.realName : '', email: see ? m.email : '' } })
    return c.json({ notebook: db.prepare('select id,title,owner from notebooks where id=?').get(id), role, sections, members })
  })

  r.patch('/notebooks/:id', auth, async c => {
    const id = c.req.param('id'); if (!canEdit(getRole(db, id, c.get('uid')))) return c.json({ error: 'forbidden' }, 403)
    const b = await readBody(c, Rename); if (!b.ok) return b.res
    db.prepare('update notebooks set title=? where id=?').run(b.data.title, id); bus.emit(id, { title: b.data.title, by: c.get('uid'), cid: c.req.header('x-client-id') || '' })
    return c.json({ ok: true })
  })

  r.delete('/notebooks/:id', auth, c => {
    const id = c.req.param('id'); if (getRole(db, id, c.get('uid')) !== 'owner') return c.json({ error: 'forbidden' }, 403)
    db.transaction(() => { db.prepare('delete from notebooks where id=?').run(id); for (const t of ['sections', 'members', 'files', 'activity']) db.prepare(`delete from ${t} where nb=?`).run(id) })()
    return c.json({ ok: true })
  })
  return r
}

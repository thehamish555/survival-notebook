import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { logActivity } from '../activity'
import { getRole } from '../access'
import { rateLimit, requireAuth } from '../middleware'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Create = z.object({ role: z.enum(['editor', 'viewer']).default('editor'), days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7) })
type Inv = { code: string; nb: string; role: string; by: string; created: number; expires: number; uses: number }

export const inviteRoutes = (ctx: Ctx) => {
  const { db, bus } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx), look = rateLimit(60, 10 * 60_000)
  const owner = (id: string, uid: string) => getRole(db, id, uid) === 'owner'
  const live = (code: string) => { const i = db.prepare('select * from invites where code=?').get(code) as Inv | undefined; return i && i.expires > Date.now() ? i : undefined }

  r.post('/notebooks/:id/invites', auth, async c => {
    const id = c.req.param('id'); if (!owner(id, c.get('uid'))) return c.json({ error: 'Only the owner can make invite links' }, 403)
    const b = await readBody(c, Create); if (!b.ok) return b.res
    if ((db.prepare('select count(*) n from invites where nb=? and expires>?').get(id, Date.now()) as { n: number }).n >= 20) return c.json({ error: 'Too many active links. Remove one first.' }, 400)
    const code = randomBytes(12).toString('base64url'), now = Date.now(), expires = now + b.data.days * 86_400_000
    db.prepare('insert into invites(code,nb,role,by,created,expires) values(?,?,?,?,?,?)').run(code, id, b.data.role, c.get('uid'), now, expires)
    return c.json({ code, role: b.data.role, expires, uses: 0 })
  })

  r.get('/notebooks/:id/invites', auth, c => {
    const id = c.req.param('id'); if (!owner(id, c.get('uid'))) return c.json({ error: 'forbidden' }, 403)
    return c.json(db.prepare('select code, role, created, expires, uses from invites where nb=? and expires>? order by created desc').all(id, Date.now()))
  })

  r.delete('/notebooks/:id/invites/:code', auth, c => {
    const id = c.req.param('id'); if (!owner(id, c.get('uid'))) return c.json({ error: 'forbidden' }, 403)
    db.prepare('delete from invites where nb=? and code=?').run(id, c.req.param('code')); return c.json({ ok: true })
  })

  // What the link is for (shown before the person signs in)
  r.get('/invites/:code', look, c => {
    const i = live(c.req.param('code')); if (!i) return c.json({ error: 'This invite link has expired or was removed.' }, 404)
    const nb = db.prepare('select n.title, u.name from notebooks n left join users u on u.id=n.owner where n.id=?').get(i.nb) as { title: string; name: string | null } | undefined
    if (!nb) return c.json({ error: 'This invite link has expired or was removed.' }, 404)
    return c.json({ title: nb.title, owner: nb.name || 'Someone', role: i.role })
  })

  r.post('/invites/:code', auth, look, c => {
    const i = live(c.req.param('code')), uid = c.get('uid'); if (!i) return c.json({ error: 'This invite link has expired or was removed.' }, 404)
    if (getRole(db, i.nb, uid)) return c.json({ id: i.nb })   // already in: never change an existing role
    db.transaction(() => {
      db.prepare("insert into members(nb,user,role) values(?,?,?)").run(i.nb, uid, i.role)
      db.prepare('update invites set uses=uses+1 where code=?').run(i.code)
      logActivity(db, i.nb, uid, 'members', { added: [uid], changed: [], removed: [] }, '')
    })()
    bus.emit(i.nb, { members: true, by: uid, cid: c.req.header('x-client-id') || '' })
    return c.json({ id: i.nb })
  })
  return r
}
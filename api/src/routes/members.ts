import { Hono } from 'hono'
import { z } from 'zod'
import { getRole } from '../access'
import { requireAuth } from '../middleware'
import { whoAndWhere } from '../push'
import { unassign } from '../unassign'
import { Email, readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Invite = z.object({ email: Email, role: z.enum(['editor', 'viewer']).default('editor') })
const Nick = z.object({ nick: z.string().trim().max(32, 'Nicknames can be up to 32 characters') })

export const memberRoutes = (ctx: Ctx) => {
  const { db, bus } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)

  r.post('/notebooks/:id/members', auth, async c => {
    const id = c.req.param('id'); if (getRole(db, id, c.get('uid')) !== 'owner') return c.json({ error: 'Only the owner can invite people' }, 403)
    const b = await readBody(c, Invite); if (!b.ok) return b.res
    const u = db.prepare('select id from users where email=?').get(b.data.email) as { id: string } | undefined
    if (!u) return c.json({ error: 'No account with that email' }, 404)
    if (u.id === c.get('uid')) return c.json({ error: "That's you" }, 400)
    const isNew = !getRole(db, id, u.id)
    db.prepare("insert into members(nb,user,role) values(?,?,?) on conflict(nb,user) do update set role=excluded.role").run(id, u.id, b.data.role)
    if (isNew) { const { name, title } = whoAndWhere(db, id, c.get('uid')); ctx.notify(u.id, { title: 'Added to a notebook', body: `${name} added you to “${title}”`, url: `/n/${id}` }) }
    bus.emit(id, { members: true, by: c.get('uid'), cid: c.req.header('x-client-id') || '' }); return c.json({ ok: true })
  })

  r.delete('/notebooks/:id/members/:uid', auth, c => {
    const id = c.req.param('id'), target = c.req.param('uid'), me = c.get('uid')
    if (getRole(db, id, target) === 'owner') return c.json({ error: 'The owner cannot be removed' }, 400)
    if (getRole(db, id, me) !== 'owner' && me !== target) return c.json({ error: 'forbidden' }, 403)
    db.prepare('delete from members where nb=? and user=?').run(id, target); db.prepare('delete from positions where nb=? and user=?').run(id, target); unassign(db, bus, id, target)
    bus.emit(id, { members: true, by: me, cid: c.req.header('x-client-id') || '' }); return c.json({ ok: true })
  })

  // Per-notebook nickname for yourself (blank = use your account name)
  r.patch('/notebooks/:id/nick', auth, async c => {
    const id = c.req.param('id'), me = c.get('uid'); if (!getRole(db, id, me)) return c.json({ error: 'not found' }, 404)
    const b = await readBody(c, Nick); if (!b.ok) return b.res
    db.prepare('update members set nick=? where nb=? and user=?').run(b.data.nick, id, me)
    bus.emit(id, { members: true, by: me, cid: c.req.header('x-client-id') || '' }); return c.json({ ok: true })
  })
  return r
}

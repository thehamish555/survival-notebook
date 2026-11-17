import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireAuth } from '../middleware'
import { unassign } from '../unassign'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Rename = z.object({ name: z.string().trim().min(1, 'Enter a display name').max(40) })
const Password = z.object({ current: z.string().max(72), next: z.string().min(8, 'New password must be at least 8 characters').max(72) })
const Delete = z.object({ password: z.string().max(72) })

export const accountRoutes = (ctx: Ctx) => {
  const { db, bus } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)
  const hashOf = (uid: string) => (db.prepare('select hash from users where id=?').get(uid) as { hash: string }).hash

  r.patch('/me', auth, async c => {
    const b = await readBody(c, Rename); if (!b.ok) return b.res
    db.prepare('update users set name=? where id=?').run(b.data.name, c.get('uid')); return c.json({ ok: true })
  })

  r.post('/me/password', auth, async c => {
    const b = await readBody(c, Password); if (!b.ok) return b.res
    if (!bcrypt.compareSync(b.data.current, hashOf(c.get('uid')))) return c.json({ error: 'Current password is wrong' }, 403)
    db.prepare('update users set hash=? where id=?').run(bcrypt.hashSync(b.data.next, ctx.bcryptCost), c.get('uid')); return c.json({ ok: true })
  })

  // Deletes the account, every notebook it owns, its memberships, tokens and gear.
  r.delete('/me', auth, async c => {
    const b = await readBody(c, Delete); if (!b.ok) return b.res
    const uid = c.get('uid')
    if (!bcrypt.compareSync(b.data.password, hashOf(uid))) return c.json({ error: 'Password is wrong' }, 403)
    db.transaction(() => {
      for (const { nb } of db.prepare("select nb from members where user=? and role='owner'").all(uid) as { nb: string }[]) {
        for (const t of ['sections', 'members', 'files', 'activity']) db.prepare(`delete from ${t} where nb=?`).run(nb)
        db.prepare('delete from notebooks where id=?').run(nb)
      }
      for (const { nb } of db.prepare('select nb from members where user=?').all(uid) as { nb: string }[]) {
        unassign(db, bus, nb, uid); db.prepare('delete from sections where nb=? and name in (?,?,?)').run(nb, 'gear:' + uid, 'prefs:' + uid, 'stats:' + uid)
      }
      db.prepare('delete from members where user=?').run(uid)
      db.prepare('delete from api_tokens where user=?').run(uid)
      db.prepare('delete from users where id=?').run(uid)
    })()
    return c.json({ ok: true })
  })
  return r
}

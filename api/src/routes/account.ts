import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../middleware'
import { unassign } from '../unassign'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Rename = z.object({ name: z.string().trim().min(1, 'Enter a display name').max(40) })
const Delete = z.object({ email: z.string().max(254) })

export const accountRoutes = (ctx: Ctx) => {
  const { db, bus } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)
  const emailOf = (uid: string) => (db.prepare('select email from users where id=?').get(uid) as { email: string }).email

  r.patch('/me', auth, async c => {
    const b = await readBody(c, Rename); if (!b.ok) return b.res
    db.prepare('update users set name=? where id=?').run(b.data.name, c.get('uid')); return c.json({ ok: true })
  })

  // Deletes the account, every notebook it owns, its memberships, tokens, push subscriptions, gear and inventory.
  r.delete('/me', auth, async c => {
    const b = await readBody(c, Delete); if (!b.ok) return b.res
    const uid = c.get('uid')
    if (b.data.email.trim().toLowerCase() !== emailOf(uid)) return c.json({ error: 'That is not your email address' }, 403)
    db.transaction(() => {
      for (const { nb } of db.prepare("select nb from members where user=? and role='owner'").all(uid) as { nb: string }[]) {
        for (const t of ['sections', 'members', 'files', 'activity', 'invites', 'map_tiles', 'positions', 'play']) db.prepare(`delete from ${t} where nb=?`).run(nb)
        db.prepare('delete from notebooks where id=?').run(nb)
      }
      for (const { nb } of db.prepare('select nb from members where user=?').all(uid) as { nb: string }[]) {
        unassign(db, bus, nb, uid); db.prepare('delete from sections where nb=? and name in (?,?,?,?)').run(nb, 'gear:' + uid, 'prefs:' + uid, 'stats:' + uid, 'inv:' + uid)
      }
      db.prepare('delete from members where user=?').run(uid)
      db.prepare('delete from positions where user=?').run(uid)
      db.prepare('delete from play where user=?').run(uid)
      db.prepare('delete from api_tokens where user=?').run(uid)
      db.prepare('delete from push_subs where user=?').run(uid)
      db.prepare('delete from users where id=?').run(uid)
    })()
    return c.json({ ok: true })
  })
  return r
}
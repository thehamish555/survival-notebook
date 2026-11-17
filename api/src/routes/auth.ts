import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { rateLimit, requireAuth, signToken } from '../middleware'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Google = z.object({ credential: z.string().min(10, 'Missing Google sign-in').max(5000) })
type U = { id: string; email: string; name: string; google_sub: string | null }

export const authRoutes = (ctx: Ctx) => {
  const r = new Hono<AppEnv>(), limit = rateLimit(30, 10 * 60_000)
  // Sign in (or sign up) with a Google ID token. The same email always lands on the same account.
  r.post('/auth/google', limit, async c => {
    const b = await readBody(c, Google); if (!b.ok) return b.res
    let g; try { g = await ctx.verifyGoogle(b.data.credential) } catch { return c.json({ error: 'Google sign-in failed. Try again.' }, 401) }
    const { db } = ctx
    let u = db.prepare('select id,email,name,google_sub from users where google_sub=?').get(g.sub) as U | undefined
    if (!u) {
      u = db.prepare('select id,email,name,google_sub from users where email=?').get(g.email) as U | undefined
      if (u) db.prepare('update users set google_sub=? where id=?').run(g.sub, u.id)   // an older account with this email: link it
      else {
        u = { id: randomUUID(), email: g.email, name: g.name.slice(0, 40), google_sub: g.sub }
        db.prepare("insert into users(id,email,name,hash,google_sub) values(?,?,?,'',?)").run(u.id, u.email, u.name, g.sub)
      }
    }
    return c.json({ token: signToken(ctx.config.JWT_SECRET, u.id), user: { id: u.id, email: u.email, name: u.name } })
  })
  r.get('/me', requireAuth(ctx), c => c.json(ctx.db.prepare('select id,email,name from users where id=?').get(c.get('uid'))))
  return r
}
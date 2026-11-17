import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { rateLimit, requireAuth, signToken } from '../middleware'
import { Email, readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Register = z.object({ email: Email, name: z.string().trim().min(1, 'Enter a display name').max(40), password: z.string().min(8, 'Password must be at least 8 characters').max(72) })
const Login = z.object({ email: Email, password: z.string().max(72) })

export const authRoutes = (ctx: Ctx) => {
  const r = new Hono<AppEnv>(), limit = rateLimit(30, 10 * 60_000), dummy = bcrypt.hashSync('dummy', ctx.bcryptCost)
  r.post('/auth/register', limit, async c => {
    const b = await readBody(c, Register); if (!b.ok) return b.res
    const u = { id: randomUUID(), email: b.data.email, name: b.data.name }
    try { ctx.db.prepare('insert into users(id,email,name,hash) values(?,?,?,?)').run(u.id, u.email, u.name, bcrypt.hashSync(b.data.password, ctx.bcryptCost)) }
    catch { return c.json({ error: 'That email is already registered' }, 409) }
    return c.json({ token: signToken(ctx.config.JWT_SECRET, u.id), user: u })
  })
  r.post('/auth/login', limit, async c => {
    const b = await readBody(c, Login); if (!b.ok) return b.res
    const u = ctx.db.prepare('select * from users where email=?').get(b.data.email) as { id: string; email: string; name: string; hash: string } | undefined
    const ok = bcrypt.compareSync(b.data.password, u?.hash ?? dummy)   // constant-ish time whether or not the user exists
    if (!u || !ok) return c.json({ error: 'Invalid email or password' }, 401)
    return c.json({ token: signToken(ctx.config.JWT_SECRET, u.id), user: { id: u.id, email: u.email, name: u.name } })
  })
  r.get('/me', requireAuth(ctx), c => c.json(ctx.db.prepare('select id,email,name from users where id=?').get(c.get('uid'))))
  return r
}

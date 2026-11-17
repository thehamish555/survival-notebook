import { Hono } from 'hono'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { hashToken, rateLimit, requireAuth } from '../middleware'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Create = z.object({ name: z.string().trim().min(1, 'Give the token a name, e.g. “Gaming PC”').max(40) })
const Start = z.object({ name: z.string().trim().max(40).optional() })
const Poll = z.object({ secret: z.string().min(20).max(100) })

// Linking the mod without copying a token: the game asks for a short code, its player approves the code on the website while signed in,
// and the game collects a new token with the secret only it knows. Codes live in memory for 10 minutes.
export const LINK_TTL = 10 * 60_000
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // no 0/O or 1/I to mix up
type Pending = { secret: string; name: string; expires: number; token?: string }
const tidy = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

// Personal API tokens for the Minecraft mod. Only the hash is stored; the token is shown once, at creation.
export const tokenRoutes = (ctx: Ctx) => {
  const { db } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)
  r.get('/me/tokens', auth, c => c.json(db.prepare('select id, name, created, last_used as lastUsed, 1 as members from api_tokens where user=? order by created desc').all(c.get('uid'))))
  r.post('/me/tokens', auth, async c => {
    const b = await readBody(c, Create); if (!b.ok) return b.res
    const uid = c.get('uid')
    if ((db.prepare('select count(*) n from api_tokens where user=?').get(uid) as { n: number }).n >= 10) return c.json({ error: 'You can have up to 10 tokens — revoke one first' }, 400)
    const id = randomUUID(), token = 'snp_' + randomBytes(32).toString('base64url')
    db.prepare('insert into api_tokens(id,user,name,hash,created) values(?,?,?,?,?)').run(id, uid, b.data.name, hashToken(token), Date.now())
    return c.json({ id, name: b.data.name, token })
  })
  const pending = new Map<string, Pending>()   // code (without the dash) -> request
  const live = (code: string) => { const p = pending.get(tidy(code)); if (p && p.expires < Date.now()) { pending.delete(tidy(code)); return undefined } return p }
  r.post('/link/start', rateLimit(20, 600_000), async c => {   // the game: no account yet
    const b = await readBody(c, Start); if (!b.ok) return b.res
    const now = Date.now(); for (const [k, p] of pending) if (p.expires < now) pending.delete(k)
    if (pending.size > 5000) return c.json({ error: 'Too many people are linking right now. Try again in a minute.' }, 503)
    let code = ''; do { code = Array.from(randomBytes(8), x => ALPHA[x % ALPHA.length]).join('') } while (pending.has(code))
    const secret = randomBytes(32).toString('base64url')
    pending.set(code, { secret, name: b.data.name || 'Minecraft', expires: now + LINK_TTL })
    return c.json({ code: code.slice(0, 4) + '-' + code.slice(4), secret, expiresIn: LINK_TTL / 1000 })
  })
  r.get('/link/:code', auth, c => {   // the website: what is being linked
    const p = live(c.req.param('code')); if (!p) return c.json({ error: 'That code has expired or was already used. Press Link this game again in Minecraft for a new one.' }, 404)
    return c.json({ name: p.name, expires: p.expires, done: !!p.token })
  })
  r.post('/link/:code/approve', auth, c => {   // the website: the signed-in player says yes
    const p = live(c.req.param('code')), uid = c.get('uid')
    if (!p) return c.json({ error: 'That code has expired or was already used. Press Link this game again in Minecraft for a new one.' }, 404)
    if (p.token) return c.json({ ok: true })
    if ((db.prepare('select count(*) n from api_tokens where user=?').get(uid) as { n: number }).n >= 10) return c.json({ error: 'You can have up to 10 linked games. Remove one on your Account page first.' }, 400)
    const id = randomUUID(), token = 'snp_' + randomBytes(32).toString('base64url')
    db.prepare('insert into api_tokens(id,user,name,hash,created) values(?,?,?,?,?)').run(id, uid, p.name, hashToken(token), Date.now())
    p.token = token
    return c.json({ ok: true })
  })
  r.post('/link/poll', rateLimit(120, 60_000), async c => {   // the game: waiting for the player to approve
    const b = await readBody(c, Poll); if (!b.ok) return b.res
    for (const [k, p] of pending) {
      if (p.secret !== b.data.secret) continue
      if (p.expires < Date.now()) { pending.delete(k); break }
      if (!p.token) return c.json({ waiting: true }, 202)
      pending.delete(k)   // handed over once, then forgotten
      return c.json({ token: p.token })
    }
    return c.json({ error: 'expired' }, 410)
  })

  r.delete('/me/tokens/:id', auth, c => {
    db.prepare('delete from api_tokens where id=? and user=?').run(c.req.param('id'), c.get('uid')); return c.json({ ok: true })
  })
  return r
}

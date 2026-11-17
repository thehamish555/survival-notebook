import { Hono } from 'hono'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { hashToken, requireAuth } from '../middleware'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Create = z.object({ name: z.string().trim().min(1, 'Give the token a name, e.g. “Gaming PC”').max(40) })

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
  r.delete('/me/tokens/:id', auth, c => {
    db.prepare('delete from api_tokens where id=? and user=?').run(c.req.param('id'), c.get('uid')); return c.json({ ok: true })
  })
  return r
}

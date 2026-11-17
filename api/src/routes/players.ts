import { Hono } from 'hono'
import { z } from 'zod'
import { getRole } from '../access'
import { requireAuth } from '../middleware'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

// Where each player is right now, so the team can see each other on the map (website and mod).
// Kept in memory only, never written to the database, and forgotten two minutes after the last update.
export const POS_TTL = 120_000
export type Pos = { uid: string; name: string; dim: 'ow' | 'nether' | 'end'; x: number; y: number; z: number; yaw: number; ts: number }
const Body = z.object({
  dim: z.enum(['ow', 'nether', 'end']),
  x: z.number().finite().min(-30_000_000).max(30_000_000), y: z.number().finite().min(-4096).max(4096), z: z.number().finite().min(-30_000_000).max(30_000_000),
  yaw: z.number().finite().default(0),
})

export const playerRoutes = (ctx: Ctx) => {
  const r = new Hono<AppEnv>(), auth = requireAuth(ctx)
  const where = new Map<string, Map<string, Pos>>()   // notebook -> player -> position
  const fresh = (nb: string, now = Date.now()) => {
    const m = where.get(nb); if (!m) return []
    for (const [uid, p] of m) if (now - p.ts > POS_TTL) m.delete(uid)
    return [...m.values()]
  }

  r.get('/notebooks/:id/pos', auth, c => {
    const id = c.req.param('id'); if (!getRole(ctx.db, id, c.get('uid'))) return c.json({ error: 'not found' }, 404)
    return c.json(fresh(id))
  })

  r.put('/notebooks/:id/pos', auth, async c => {
    const id = c.req.param('id'), uid = c.get('uid'); if (!getRole(ctx.db, id, uid)) return c.json({ error: 'not found' }, 404)
    const b = await readBody(c, Body); if (!b.ok) return b.res
    const row = ctx.db.prepare(`select coalesce(nullif(m.nick,''), u.name, 'Someone') as name from members m join users u on u.id=m.user where m.nb=? and m.user=?`).get(id, uid) as { name: string } | undefined
    const p: Pos = { uid, name: row?.name || 'Someone', ...b.data, x: Math.round(b.data.x * 10) / 10, y: Math.round(b.data.y), z: Math.round(b.data.z * 10) / 10, yaw: Math.round(b.data.yaw), ts: Date.now() }
    if (!where.has(id)) where.set(id, new Map())
    where.get(id)!.set(uid, p)
    ctx.bus.emit(id, { pos: p })
    return c.json({ ok: true })
  })

  r.delete('/notebooks/:id/pos', auth, c => {   // left the world, or switched sharing off
    const id = c.req.param('id'), uid = c.get('uid')
    if (where.get(id)?.delete(uid)) ctx.bus.emit(id, { pos: { uid, gone: true } })
    return c.json({ ok: true })
  })
  return r
}

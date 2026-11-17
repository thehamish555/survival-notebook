import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getRole } from '../access'
import { requireAuth } from '../middleware'
import type { AppEnv, Ctx } from '../types'

// Live sync: every write emits on the notebook's channel; each open tab holds one SSE stream.
export const eventRoutes = (ctx: Ctx) => {
  const r = new Hono<AppEnv>()
  r.get('/notebooks/:id/events', requireAuth(ctx, true), c => {
    const id = c.req.param('id'); if (!getRole(ctx.db, id, c.get('uid'))) return c.json({ error: 'not found' }, 404)
    return streamSSE(c, async s => {
      const h = (m: unknown) => { void s.writeSSE({ data: JSON.stringify(m) }) }
      ctx.bus.on(id, h); s.onAbort(() => { ctx.bus.off(id, h) })
      while (!s.aborted) { await s.sleep(15000); await s.writeSSE({ event: 'ping', data: '' }) }
    })
  })
  return r
}

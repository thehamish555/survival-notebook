import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../middleware'
import { vapidKeys } from '../push'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

const Sub = z.object({ endpoint: z.string().url().max(1000).refine(u => u.startsWith('https://'), 'Bad endpoint'), keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }) })
const Drop = z.object({ endpoint: z.string().max(1000) })

/** Browser push: the site asks for the public key, subscribes the browser, and sends the subscription here. One row per device. */
export const pushRoutes = (ctx: Ctx) => {
  const { db, config } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)

  r.get('/push/key', c => c.json({ key: vapidKeys(db, config).publicKey }))

  r.post('/push/subscribe', auth, async c => {
    const b = await readBody(c, Sub); if (!b.ok) return b.res
    const uid = c.get('uid')
    if ((db.prepare('select count(*) n from push_subs where user=?').get(uid) as { n: number }).n >= 20) db.prepare('delete from push_subs where endpoint=(select endpoint from push_subs where user=? order by created limit 1)').run(uid)
    db.prepare('insert into push_subs values(?,?,?,?,?) on conflict(endpoint) do update set user=excluded.user, p256dh=excluded.p256dh, auth=excluded.auth')
      .run(b.data.endpoint, uid, b.data.keys.p256dh, b.data.keys.auth, Date.now())
    return c.json({ ok: true })
  })

  r.delete('/push/subscribe', auth, async c => {
    const b = await readBody(c, Drop); if (!b.ok) return b.res
    db.prepare('delete from push_subs where endpoint=? and user=?').run(b.data.endpoint, c.get('uid'))
    return c.json({ ok: true })
  })

  r.post('/push/test', auth, c => {
    ctx.notify(c.get('uid'), { title: 'The Survival Notebook', body: 'Notifications are working.', url: '/account' })
    return c.json({ ok: true })
  })
  return r
}

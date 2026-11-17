import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { EventEmitter } from 'node:events'
import type { Config } from './config'
import { openDb, type DB } from './db'
import { googleVerifier } from './google'
import { originGuard, rateLimit, requestLog } from './middleware'
import { accountRoutes } from './routes/account'
import { authRoutes } from './routes/auth'
import { eventRoutes } from './routes/events'
import { fileRoutes } from './routes/files'
import { inviteRoutes } from './routes/invites'
import { mapRoutes } from './routes/map'
import { playerRoutes } from './routes/players'
import { memberRoutes } from './routes/members'
import { notebookRoutes } from './routes/notebooks'
import { pushRoutes } from './routes/push'
import { sectionRoutes } from './routes/sections'
import { tokenRoutes } from './routes/tokens'
import { makeNotify, webPushSender, type PushSender } from './push'
import type { AppEnv, Ctx } from './types'

export function createApp(config: Config, db: DB = openDb(config.DB_PATH), verifyGoogle: Ctx['verifyGoogle'] = googleVerifier(config), sendPush: PushSender = webPushSender) {
  const bus = new EventEmitter(); bus.setMaxListeners(0)
  const ctx: Ctx = { db, config, bus, verifyGoogle, notify: makeNotify(db, config, sendPush) }
  const app = new Hono<AppEnv>()

  app.use('*', secureHeaders())
  app.use('*', async (c, next) => { c.header('cache-control', 'no-store'); await next() })   // never cache API responses
  if (config.NODE_ENV !== 'test') app.use('*', requestLog())
  if (config.CORS_ORIGIN) app.use('*', cors({ origin: config.CORS_ORIGIN.split(',').map(o => o.trim()), allowHeaders: ['authorization', 'content-type', 'x-client-id'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }))

  app.get('/health', c => c.json({ ok: true }))                                              // liveness (no secret needed)
  app.get('/ready', c => { db.prepare('select 1').get(); return c.json({ ok: true }) })      // readiness: DB reachable

  app.use('*', originGuard(config))
  app.use('*', rateLimit(1500, 60_000))                                                      // generous per-IP ceiling for everything
  app.use('*', bodyLimit({ maxSize: 1024 * 1024, onError: c => c.json({ error: 'Request too large' }, 413) }))
  for (const routes of [authRoutes, accountRoutes, tokenRoutes, notebookRoutes, sectionRoutes, memberRoutes, inviteRoutes, fileRoutes, mapRoutes, playerRoutes, pushRoutes, eventRoutes]) app.route('/', routes(ctx))

  app.notFound(c => c.json({ error: 'not found' }, 404))
  app.onError((e, c) => { console.error(e); return c.json({ error: 'Internal error' }, 500) })
  return { app, db, bus }
}
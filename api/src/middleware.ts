import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Config } from './config'
import type { AppEnv, Ctx } from './types'

const safeEq = (a = '', b = '') => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
export const signToken = (secret: string, uid: string) => jwt.sign({}, secret, { subject: uid, expiresIn: '30d', algorithm: 'HS256' })

// Optional: when ORIGIN_SECRET is set, requests must carry it in x-origin-secret (for putting a proxy in front later).
export const originGuard = (config: Config): MiddlewareHandler => async (c, next) => {
  if (config.ORIGIN_SECRET && !safeEq(c.req.header('x-origin-secret'), config.ORIGIN_SECRET)) return c.json({ error: 'forbidden' }, 403)
  await next()
}

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

// Personal API tokens (snp_…) are for the Minecraft mod: it can read notebooks (and listen for live changes), edit places, to-dos, farms and its owner's own gear and inventory, upload map tiles, and set a nickname. Nothing else.
const MOD_ROUTES: [string, RegExp][] = [
  ['GET', /^\/me$/], ['GET', /^\/notebooks$/], ['GET', /^\/notebooks\/[\w-]+$/], ['GET', /^\/notebooks\/[\w-]+\/s\/[\w:-]+$/],
  ['GET', /^\/notebooks\/[\w-]+\/activity$/], ['GET', /^\/notebooks\/[\w-]+\/events$/], ['PATCH', /^\/notebooks\/[\w-]+\/nick$/],
  ['PUT', /^\/notebooks\/[\w-]+\/s\/(coords|todos|farms|deaths|notes|(gear|prefs|stats|inv):[0-9a-f-]{36})$/],
  ['POST', /^\/notebooks$/], ['POST', /^\/notebooks\/[\w-]+\/files$/], ['GET', /^\/notebooks\/[\w-]+\/files\/[\w-]+$/], ['DELETE', /^\/notebooks\/[\w-]+\/files\/[\w-]+$/],   // Litematica upload / download
  ['GET', /^\/notebooks\/[\w-]+\/blocks$/], ['PUT', /^\/notebooks\/[\w-]+\/map\/(ow|nether|end)\/-?\d+\/-?\d+$/],   // schematic block counts, map tiles
]
// Mod tokens can manage members too (the in-game Members tab).
const MEMBER_ROUTES: [string, RegExp][] = [['POST', /^\/notebooks\/[\w-]+\/members$/], ['DELETE', /^\/notebooks\/[\w-]+\/members\/[\w-]+$/]]

// allowQuery: EventSource can't send headers, so the SSE route alone accepts ?t=<session token>
export const requireAuth = ({ config, db }: Ctx, allowQuery = false): MiddlewareHandler<AppEnv> => async (c, next) => {
  const token = (c.req.header('authorization') || '').replace(/^Bearer /, '') || (allowQuery ? c.req.query('t') || '' : '')
  if (token.startsWith('snp_')) {
    const row = db.prepare('select id, user from api_tokens where hash=?').get(hashToken(token)) as { id: string; user: string } | undefined
    if (!row) return c.json({ error: 'unauthorized' }, 401)
    if (![...MOD_ROUTES, ...MEMBER_ROUTES].some(([meth, re]) => meth === c.req.method && re.test(c.req.path))) return c.json({ error: 'This token can’t do that' }, 403)
    db.prepare('update api_tokens set last_used=? where id=?').run(Date.now(), row.id)
    c.set('uid', row.user); c.set('mod', true)
    return next()
  }
  try {
    const p = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload
    if (!p.sub || !db.prepare('select 1 from users where id=?').get(p.sub)) throw new Error('unknown user')   // survives DB resets
    c.set('uid', p.sub)
  } catch { return c.json({ error: 'unauthorized' }, 401) }
  await next()
}

// Fixed-window limiter keyed by the caller's address.
/** The caller's address: the first x-forwarded-for hop when behind a proxy (the website's /api proxy on Vercel), else the socket address. */
function clientIp(c: Context): string {
  const fwd = (c.req.header('x-forwarded-for') || '').split(',')[0].trim()
  if (fwd) return fwd
  try { return getConnInfo(c).remote.address || 'local' } catch { return 'local' }
}

export function rateLimit(max: number, windowMs: number): MiddlewareHandler {
  const hits = new Map<string, { n: number; reset: number }>()
  return async (c, next) => {
    const now = Date.now(), ip = clientIp(c), h = hits.get(ip)
    if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + windowMs })
    else if (++h.n > max) return c.json({ error: 'Too many attempts — try again in a few minutes' }, 429)
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    await next()
  }
}

// Logs method/path/status only — never the query string (it can hold a token).
export const requestLog = (): MiddlewareHandler => async (c, next) => {
  const t = Date.now(); await next()
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - t}ms`)
}

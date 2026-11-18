import { Hono } from 'hono'
import { z } from 'zod'
import { getRole } from '../access'
import { requireAuth } from '../middleware'
import { whoAndWhere } from '../push'
import { readBody } from '../validate'
import type { AppEnv, Ctx } from '../types'

// Where each player is, so the team can see each other on the map (website and mod). Each player's last position is kept,
// so someone who has logged off still shows where they left, greyed out with when they were last seen.
export const ONLINE_FOR = 120_000   // no update for two minutes (or they left the world) = offline
const AWAY_FOR = 20 * 60_000          // "Sam is playing" only after 20 minutes away, so rejoining doesn't spam
export type Pos = { uid: string; name: string; dim: 'ow' | 'nether' | 'end'; x: number; y: number; z: number; yaw: number; ts: number; online: boolean; mcName: string; mcUuid: string }
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i
const Body = z.object({
  dim: z.enum(['ow', 'nether', 'end']),
  x: z.number().finite().min(-30_000_000).max(30_000_000), y: z.number().finite().min(-4096).max(4096), z: z.number().finite().min(-30_000_000).max(30_000_000),
  yaw: z.number().finite().default(0),
  mcName: z.string().max(16).regex(/^[A-Za-z0-9_]*$/).default(''),
  mcUuid: z.string().regex(UUID).or(z.literal('')).default(''),
})

export const playerRoutes = (ctx: Ctx) => {
  const r = new Hono<AppEnv>(), auth = requireAuth(ctx), db = ctx.db
  const select = `select p.user as uid, coalesce(nullif(m.nick,''), u.name, 'Someone') as name, p.dim, p.x, p.y, p.z, p.yaw, p.ts, p.online, p.mc_name as mcName, p.mc_uuid as mcUuid
    from positions p join members m on m.nb=p.nb and m.user=p.user join users u on u.id=p.user where p.nb=?`
  const shape = (row: any, now = Date.now()): Pos => ({ ...row, online: !!row.online && now - row.ts < ONLINE_FOR })

  r.get('/notebooks/:id/pos', auth, c => {
    const id = c.req.param('id'); if (!getRole(db, id, c.get('uid'))) return c.json({ error: 'not found' }, 404)
    return c.json((db.prepare(`${select} order by p.ts desc`).all(id) as any[]).map(x => shape(x)))
  })

  r.put('/notebooks/:id/pos', auth, async c => {
    const id = c.req.param('id'), uid = c.get('uid'); if (!getRole(db, id, uid)) return c.json({ error: 'not found' }, 404)
    const b = await readBody(c, Body); if (!b.ok) return b.res
    const d = b.data, now = Date.now()
    const before = db.prepare('select dim, x, z, ts, online from positions where nb=? and user=?').get(id, uid) as { dim: string; x: number; z: number; ts: number; online: number } | undefined
    if (before?.online && now - before.ts < ONLINE_FOR) {   // still playing since the last update: add the time and the distance to today's total
      const moved = before.dim === d.dim ? Math.min(2000, Math.hypot(d.x - before.x, d.z - before.z)) : 0
      db.prepare(`insert into play(nb,user,day,ms,dist) values(?,?,?,?,?) on conflict(nb,user,day) do update set ms=ms+excluded.ms, dist=dist+excluded.dist`)
        .run(id, uid, new Date(now).toISOString().slice(0, 10), now - before.ts, moved)
    } else if (!before || now - before.ts > AWAY_FOR) {     // back after a while: let the team know, if they want that
      const { name, title } = whoAndWhere(db, id, uid)
      for (const { user } of db.prepare('select user from members where nb=? and user<>?').all(id, uid) as { user: string }[]) ctx.notify(user, { title, body: `${name} is playing`, url: `/n/${id}#map` }, 'online')
    }
    db.prepare(`insert into positions(nb,user,dim,x,y,z,yaw,ts,online,mc_name,mc_uuid) values(?,?,?,?,?,?,?,?,1,?,?)
      on conflict(nb,user) do update set dim=excluded.dim, x=excluded.x, y=excluded.y, z=excluded.z, yaw=excluded.yaw, ts=excluded.ts, online=1,
        mc_name=case when excluded.mc_name<>'' then excluded.mc_name else positions.mc_name end, mc_uuid=case when excluded.mc_uuid<>'' then excluded.mc_uuid else positions.mc_uuid end`)
      .run(id, uid, d.dim, Math.round(d.x * 10) / 10, Math.round(d.y), Math.round(d.z * 10) / 10, Math.round(d.yaw), now, d.mcName, d.mcUuid.toLowerCase())
    const row = db.prepare(`${select} and p.user=?`).get(id, uid)
    if (row) ctx.bus.emit(id, { pos: shape(row, now) })
    return c.json({ ok: true })
  })

  r.delete('/notebooks/:id/pos', auth, c => {   // left the world: keep where they were, marked offline
    const id = c.req.param('id'), uid = c.get('uid')
    db.prepare('update positions set online=0 where nb=? and user=?').run(id, uid)
    const row = db.prepare(`${select} and p.user=?`).get(id, uid)
    if (row) ctx.bus.emit(id, { pos: shape(row) })
    return c.json({ ok: true })
  })

  r.delete('/notebooks/:id/pos/me', auth, c => {   // switched sharing off: forget it entirely
    const id = c.req.param('id'), uid = c.get('uid')
    if (db.prepare('delete from positions where nb=? and user=?').run(id, uid).changes) ctx.bus.emit(id, { pos: { uid, gone: true } })
    return c.json({ ok: true })
  })

  // A player's skin for their face on the website's map, fetched from Mojang by the server (so browsers never contact anyone else) and kept for 6 hours.
  // Only for players who share a position in this notebook, so it can't be used to look anyone up.
  const skins = new Map<string, { at: number; png: Uint8Array | null }>()
  r.get('/notebooks/:id/skin/:uuid', auth, async c => {
    const id = c.req.param('id'), want = c.req.param('uuid').toLowerCase()
    if (!getRole(db, id, c.get('uid')) || !UUID.test(want)) return c.json({ error: 'not found' }, 404)
    if (!db.prepare('select 1 from positions where nb=? and mc_uuid=?').get(id, want)) return c.json({ error: 'not found' }, 404)
    let hit = skins.get(want)
    if (!hit || Date.now() - hit.at > 6 * 3_600_000) {
      hit = { at: Date.now(), png: null }
      try {
        const prof = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${want.replace(/-/g, '')}`, { signal: AbortSignal.timeout(5000) })
        const tex = prof.ok ? JSON.parse(Buffer.from((await prof.json()).properties?.find((p: any) => p.name === 'textures')?.value || '', 'base64').toString('utf8') || '{}') : null
        const url = tex?.textures?.SKIN?.url as string | undefined
        if (url && /^https?:\/\/textures\.minecraft\.net\//.test(url)) { const s = await fetch(url.replace(/^http:/, 'https:'), { signal: AbortSignal.timeout(5000) }); if (s.ok) hit.png = new Uint8Array(await s.arrayBuffer()) }
      } catch { /* offline-mode players and network trouble: no face, the map draws a plain marker */ }
      skins.set(want, hit)
    }
    if (!hit.png) return c.json({ error: 'no skin' }, 404)
    return c.body(hit.png as any, 200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=21600' })
  })

  // The skin on a player head in a schematic, for the 3D viewer: by texture hash (most files have it), or the owner's UUID or name.
  // Fetched by the server from Mojang only (so browsers never contact anyone else), and kept for a day.
  const heads = new Map<string, { at: number; png: Uint8Array | null }>()
  const getJson = async (url: string) => { const res = await fetch(url, { signal: AbortSignal.timeout(5000) }); return res.ok ? res.json() : null }
  r.get('/skins/:key', auth, async c => {
    const key = c.req.param('key')
    const kind = /^[0-9a-f]{40,64}$/.test(key) && key.length !== 32 ? 'hash' : /^[0-9a-f]{32}$/.test(key) ? 'uuid' : /^[A-Za-z0-9_]{1,16}$/.test(key) ? 'name' : null
    if (!kind) return c.json({ error: 'not a skin' }, 400)
    let hit = heads.get(key)
    if (!hit || Date.now() - hit.at > 24 * 3_600_000) {
      hit = { at: Date.now(), png: null }
      try {
        let hash = kind === 'hash' ? key : ''
        if (!hash) {
          const uuid = kind === 'uuid' ? key : (await getJson(`https://api.mojang.com/users/profiles/minecraft/${key}`))?.id
          const prof = typeof uuid === 'string' && /^[0-9a-f]{32}$/.test(uuid) ? await getJson(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`) : null
          const tex = JSON.parse(Buffer.from(prof?.properties?.find((p: any) => p.name === 'textures')?.value || '', 'base64').toString('utf8') || '{}')
          hash = String(tex?.textures?.SKIN?.url || '').match(/\/texture\/([0-9a-f]{40,64})$/)?.[1] || ''
        }
        if (hash) { const res = await fetch(`https://textures.minecraft.net/texture/${hash}`, { signal: AbortSignal.timeout(5000) }); if (res.ok) hit.png = new Uint8Array(await res.arrayBuffer()) }
      } catch { /* offline or unknown: the viewer shows Steve */ }
      if (heads.size >= 500) heads.delete(heads.keys().next().value!)
      heads.set(key, hit)
    }
    if (!hit.png) return c.json({ error: 'no skin' }, 404)
    return c.body(hit.png as any, 200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400' })
  })
  return r
}

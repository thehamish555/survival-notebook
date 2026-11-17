import { Hono } from 'hono'
import { deflateSync, inflateSync } from 'node:zlib'
import { canEdit, getRole } from '../access'
import { requireAuth } from '../middleware'
import type { DB } from '../db'
import type { AppEnv, Ctx } from '../types'

// The map is made of 128x128-block tiles, one byte per block (vanilla map colour id * 4 + shade, 0 = not seen yet), zlib-compressed.
// Only the mod writes tiles, and only for players who switched map sharing on.
export const TILE = 128, TILE_BYTES = TILE * TILE
export const MAX_TILES = 8000, MAX_BYTES = 64 * 1024 * 1024, MAX_UPLOAD = 64 * 1024
const DIMS = new Set(['ow', 'nether', 'end'])
const COORD = 250_000   // the world border is 30 million blocks out: 234,375 tiles

/** A new upload wins wherever it has data; pixels it hasn't seen keep what was there. */
export function mergeTile(old: Buffer | undefined, next: Buffer): Buffer {
  if (!old) return next
  const out = Buffer.from(old)
  for (let i = 0; i < TILE_BYTES; i++) if (next[i]) out[i] = next[i]
  return out
}

export const PRUNE_AGE = 90 * 86_400_000, PRUNE_KEEP = 256

/**
 * Removes map tiles nobody has updated for `maxAgeMs`, except tiles within `keep` blocks of a saved place in the same dimension.
 * Runs daily for every notebook, and on demand for one (the owner's Clear old tiles button). Returns how many were removed.
 */
export function pruneMap(db: DB, { nb, now = Date.now(), maxAgeMs = PRUNE_AGE, keep = PRUNE_KEEP }: { nb?: string; now?: number; maxAgeMs?: number; keep?: number } = {}) {
  const old = db.prepare(`select nb, dim, tx, tz from map_tiles where updated<?${nb ? ' and nb=?' : ''}`).all(...(nb ? [now - maxAgeMs, nb] : [now - maxAgeMs])) as { nb: string; dim: string; tx: number; tz: number }[]
  const places = new Map<string, Record<string, [number, number][]>>()
  const placesOf = (id: string) => {
    if (!places.has(id)) {
      const by: Record<string, [number, number][]> = { ow: [], nether: [], end: [] }
      const row = db.prepare("select data from sections where nb=? and name='coords'").get(id) as { data: string } | undefined
      try { for (const p of JSON.parse(row?.data || '[]')) for (const d of Object.keys(by)) { const n = String(p?.[d] || '').trim().split(/\s+/).map(Number); if (n.length === 3 && n.every(Number.isFinite)) by[d].push([n[0], n[2]]) } } catch { /* unreadable: keep nothing special */ }
      places.set(id, by)
    }
    return places.get(id)!
  }
  const del = db.prepare('delete from map_tiles where nb=? and dim=? and tx=? and tz=?')
  let n = 0
  db.transaction(() => {
    for (const t of old) {
      const x0 = t.tx * TILE, z0 = t.tz * TILE
      const near = (placesOf(t.nb)[t.dim] || []).some(([x, z]) => Math.hypot(Math.max(x0 - x, 0, x - (x0 + TILE - 1)), Math.max(z0 - z, 0, z - (z0 + TILE - 1))) <= keep)
      if (!near) { del.run(t.nb, t.dim, t.tx, t.tz); n++ }
    }
  })()
  return n
}

export const mapRoutes = (ctx: Ctx) => {
  const { db, bus } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)
  const lastPing = new Map<string, number>()
  // Live update for open map views. At most one every 20 s per notebook, so a player walking around doesn't flood everyone.
  const ping = (nb: string, by: string) => {
    const now = Date.now(); if (now - (lastPing.get(nb) || 0) < 20_000) return
    lastPing.set(nb, now); bus.emit(nb, { map: true, by, cid: '' })
  }

  r.get('/notebooks/:id/map', auth, c => {
    const id = c.req.param('id'); if (!getRole(db, id, c.get('uid'))) return c.json({ error: 'not found' }, 404)
    return c.json(db.prepare('select dim, tx, tz, updated from map_tiles where nb=?').all(id))
  })

  r.get('/notebooks/:id/map/:dim/:tx/:tz', auth, c => {
    const id = c.req.param('id'); if (!getRole(db, id, c.get('uid'))) return c.json({ error: 'not found' }, 404)
    const t = db.prepare('select data from map_tiles where nb=? and dim=? and tx=? and tz=?').get(id, c.req.param('dim'), Number(c.req.param('tx')), Number(c.req.param('tz'))) as { data: Buffer } | undefined
    if (!t) return c.json({ error: 'not found' }, 404)
    return c.body(new Uint8Array(t.data), 200, { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable' })   // the client asks with ?v=<updated>
  })

  r.put('/notebooks/:id/map/:dim/:tx/:tz', auth, async c => {
    const id = c.req.param('id'), uid = c.get('uid'), dim = c.req.param('dim'), tx = Number(c.req.param('tx')), tz = Number(c.req.param('tz'))
    if (!canEdit(getRole(db, id, uid))) return c.json({ error: 'forbidden' }, 403)
    if (!DIMS.has(dim) || !Number.isInteger(tx) || !Number.isInteger(tz) || Math.abs(tx) > COORD || Math.abs(tz) > COORD) return c.json({ error: 'Bad tile' }, 400)
    const body = Buffer.from(await c.req.arrayBuffer())
    if (!body.length || body.length > MAX_UPLOAD) return c.json({ error: 'Bad tile' }, 400)
    let next: Buffer
    try { next = inflateSync(body, { maxOutputLength: TILE_BYTES }) } catch { return c.json({ error: 'Bad tile' }, 400) }
    if (next.length !== TILE_BYTES) return c.json({ error: 'Bad tile' }, 400)
    const old = db.prepare('select data, size from map_tiles where nb=? and dim=? and tx=? and tz=?').get(id, dim, tx, tz) as { data: Buffer; size: number } | undefined
    const used = db.prepare('select count(*) n, coalesce(sum(size),0) b from map_tiles where nb=?').get(id) as { n: number; b: number }
    const data = deflateSync(mergeTile(old ? inflateSync(old.data) : undefined, next))
    if ((!old && used.n >= MAX_TILES) || used.b - (old?.size || 0) + data.length > MAX_BYTES) return c.json({ error: 'The map for this notebook is full' }, 413)
    db.prepare('insert into map_tiles values(?,?,?,?,?,?,?,?) on conflict(nb,dim,tx,tz) do update set data=excluded.data, size=excluded.size, updated=excluded.updated, by=excluded.by')
      .run(id, dim, tx, tz, data, data.length, Date.now(), uid)
    ping(id, uid)
    return c.json({ ok: true })
  })

  // Clear old tiles now (same rule as the daily clean-up)
  r.post('/notebooks/:id/map/prune', auth, c => {
    const id = c.req.param('id'); if (getRole(db, id, c.get('uid')) !== 'owner') return c.json({ error: 'Only the owner can clear the map' }, 403)
    const removed = pruneMap(db, { nb: id }); if (removed) bus.emit(id, { map: true, by: c.get('uid'), cid: '' })
    return c.json({ removed })
  })

  // The owner can wipe the map (it fills in again from anyone still sharing it).
  r.delete('/notebooks/:id/map', auth, c => {
    const id = c.req.param('id'); if (getRole(db, id, c.get('uid')) !== 'owner') return c.json({ error: 'Only the owner can clear the map' }, 403)
    db.prepare('delete from map_tiles where nb=?').run(id); bus.emit(id, { map: true, by: c.get('uid'), cid: '' })
    return c.json({ ok: true })
  })
  return r
}

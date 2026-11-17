import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { canEdit, getRole } from '../access'
import { requireAuth } from '../middleware'
import type { Database } from 'better-sqlite3'
import type { AppEnv, Ctx } from '../types'

const MAX_FILE = 100 * 1024, MAX_TOTAL = 20 * 1024 * 1024   // Litematica files: 100 KB each, 20 MB per notebook

/**
 * Files uploaded but never attached to a farm (menu closed, game crashed, upload replaced) are removed after `graceMs`.
 * A file counts as attached if its id appears in that notebook's farms list.
 */
export function sweepFiles(db: Database, graceMs = 2 * 60 * 60 * 1000, now = Date.now()) {
  const old = db.prepare('select id,nb from files where created<?').all(now - graceMs) as { id: string; nb: string }[]
  if (!old.length) return 0
  const used = new Map<string, Set<string>>()
  const inUse = (nb: string) => {
    if (!used.has(nb)) {
      const ids = new Set<string>(), row = db.prepare("select data from sections where nb=? and name='farms'").get(nb) as { data: string } | undefined
      try { for (const f of JSON.parse(row?.data || '[]')) if (f?.file?.id) ids.add(f.file.id) } catch { /* unreadable list: keep everything */ return null }
      used.set(nb, ids)
    }
    return used.get(nb)!
  }
  let n = 0
  for (const f of old) { const ids = inUse(f.nb); if (ids && !ids.has(f.id)) { db.prepare('delete from files where id=?').run(f.id); n++ } }
  return n
}

export const fileRoutes = (ctx: Ctx) => {
  const { db } = ctx, r = new Hono<AppEnv>(), auth = requireAuth(ctx)

  r.post('/notebooks/:id/files', auth, async c => {
    const id = c.req.param('id'); if (!canEdit(getRole(db, id, c.get('uid')))) return c.json({ error: 'forbidden' }, 403)
    const name = (c.req.query('name') || '').split(/[\\/]/).pop()!.replace(/[^\w.\- ()]/g, '_').slice(0, 80)
    if (!/\.litematic$/i.test(name)) return c.json({ error: 'Only .litematic files are allowed' }, 400)
    const buf = Buffer.from(await c.req.arrayBuffer())
    if (!buf.length) return c.json({ error: 'File is empty' }, 400)
    if (buf.length > MAX_FILE) return c.json({ error: 'File is over the 100 KB limit' }, 413)
    const used = (db.prepare('select coalesce(sum(size),0) n from files where nb=?').get(id) as { n: number }).n
    if (used + buf.length > MAX_TOTAL) return c.json({ error: 'This notebook has run out of file storage' }, 413)
    const fid = randomUUID(); db.prepare('insert into files values(?,?,?,?,?,?)').run(fid, id, name, buf.length, buf, Date.now())
    return c.json({ id: fid, name, size: buf.length })
  })

  // Removes a file you uploaded (e.g. you cancelled a farm before saving it, or removed the attachment).
  r.delete('/notebooks/:id/files/:fid', auth, c => {
    const id = c.req.param('id'); if (!canEdit(getRole(db, id, c.get('uid')))) return c.json({ error: 'forbidden' }, 403)
    db.prepare('delete from files where id=? and nb=?').run(c.req.param('fid'), id)
    return c.json({ ok: true })
  })

  r.get('/notebooks/:id/files/:fid', auth, c => {
    const id = c.req.param('id'); if (!getRole(db, id, c.get('uid'))) return c.json({ error: 'not found' }, 404)
    const f = db.prepare('select name,data from files where id=? and nb=?').get(c.req.param('fid'), id) as { name: string; data: Buffer } | undefined
    if (!f) return c.json({ error: 'not found' }, 404)
    return c.body(new Uint8Array(f.data), 200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'x-content-type-options': 'nosniff' })
  })
  return r
}

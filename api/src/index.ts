import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { serve } from '@hono/node-server'
import { ensureNative } from './native'

ensureNative()   // before anything loads the database library
const { createApp } = await import('./app')
const { loadConfig } = await import('./config')
const { sweepFiles } = await import('./routes/files')
const { pruneMap } = await import('./routes/map')
const { sendWeeklyRecaps } = await import('./recap')

const config = loadConfig()
if (config.NODE_ENV !== 'production') console.warn('⚠ Running with development defaults (not for production)')
const { app, db, notify } = createApp(config)
const server = serve({ fetch: app.fetch, port: config.PORT }, i => console.log(`API listening on :${i.port} (${config.NODE_ENV})`))

setInterval(() => { try { const n = sweepFiles(db); if (n) console.log(`Removed ${n} unattached file(s)`) } catch (e) { console.error('file sweep failed', e) } }, 10 * 60 * 1000).unref()

// Daily: map tiles nobody has updated for 90 days go, unless they're near a saved place
const prune = () => { try { const n = pruneMap(db); if (n) console.log(`Removed ${n} old map tile(s)`) } catch (e) { console.error('map clean-up failed', e) } }
setTimeout(prune, 60_000).unref(); setInterval(prune, 24 * 3600 * 1000).unref()

// Hourly: on Sunday the weekly recap goes out (once per notebook)
setInterval(() => { try { const n = sendWeeklyRecaps(db, notify); if (n) console.log(`Sent ${n} weekly recap(s)`) } catch (e) { console.error('recap failed', e) } }, 3600 * 1000).unref()

// Daily consistent snapshot of the database (safe while running), newest 14 kept.
const backupDir = config.BACKUP_DIR || join(dirname(config.DB_PATH), 'backups')
const backup = async () => {
  try {
    mkdirSync(backupDir, { recursive: true })
    await db.backup(join(backupDir, `notebook-${new Date().toISOString().replace(/[:.]/g, '-')}.db`))
    for (const f of readdirSync(backupDir).filter(f => f.endsWith('.db')).sort().slice(0, -14)) rmSync(join(backupDir, f))
  } catch (e) { console.error('backup failed', e) }
}
if (config.NODE_ENV === 'production') { setTimeout(backup, 30_000).unref(); setInterval(backup, 24 * 3600 * 1000).unref() }

const shutdown = () => { server.close(); db.close(); process.exit(0) }   // flush the WAL cleanly when the server stops
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown)
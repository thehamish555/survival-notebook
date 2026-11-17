// Consistent online backup of the SQLite DB (safe while the API is running). Keeps the newest 14.
//   npm run backup --prefix api      → data/backups/notebook-<timestamp>.db   (the API also does this by itself every 24 h in production)
import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

const src = process.env.DB_PATH || './data/notebook.db', dir = join(dirname(src), 'backups')
mkdirSync(dir, { recursive: true })
const dest = join(dir, `notebook-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
const db = new Database(src, { fileMustExist: true }); await db.backup(dest); db.close()
for (const f of readdirSync(dir).filter(f => f.endsWith('.db')).sort().slice(0, -14)) rmSync(join(dir, f))
console.log('Backup written:', dest)

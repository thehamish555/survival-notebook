// Newer npm versions skip install scripts, which leaves better-sqlite3 without its compiled file.
// If it's missing, fetch the prebuilt binary (or build it) here, so the API starts either way.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export function ensureNative() {
  const require = createRequire(import.meta.url)
  let dir: string
  try { dir = dirname(require.resolve('better-sqlite3/package.json')) } catch { return }
  if (existsSync(join(dir, 'build', 'Release', 'better_sqlite3.node'))) return
  console.log('Installing the SQLite binary…')
  const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: dir, stdio: 'inherit' }).status === 0
  const prebuild = join(dir, '..', 'prebuild-install', 'bin.js')
  if (existsSync(prebuild) && run(process.execPath, [prebuild])) return
  if (!run('npx', ['--yes', 'node-gyp', 'rebuild', '--release'])) console.error('Could not set up SQLite. Check that the server image has build tools.')
}
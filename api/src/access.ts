import type { DB } from './db'
export const getRole = (db: DB, nb: string, uid: string): string | null =>
  (db.prepare('select role from members where nb=? and user=?').get(nb, uid) as { role: string } | undefined)?.role ?? null
export const canEdit = (r: string | null) => r === 'owner' || r === 'editor'

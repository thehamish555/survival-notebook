import type { DB } from './db'

export type Detail = { added: string[]; changed: string[]; removed: string[]; edited?: boolean }
const rows = (raw: string | undefined): any[] => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
export const isEmpty = (d: Detail) => !d.edited && !d.added.length && !d.changed.length && !d.removed.length

/** What changed between two versions of a table section, by row id. */
export function diffRows(oldRaw: string | undefined, next: any[]): Detail {
  const A = new Map(rows(oldRaw).map(r => [r?.id, JSON.stringify(r)])), B = new Map(next.map(r => [r.id, JSON.stringify(r)]))
  const d: Detail = { added: [], changed: [], removed: [] }
  for (const [id, v] of B) { if (!A.has(id)) d.added.push(id); else if (A.get(id) !== v) d.changed.push(id) }
  for (const id of A.keys()) if (!B.has(id)) d.removed.push(id)
  return d
}

/** Folds two consecutive edits by the same person into one entry (typing in a table saves many times). */
export function mergeDetail(a: Detail, b: Detail): Detail {
  const added = new Set([...a.added, ...b.added]), removed = new Set([...a.removed, ...b.removed]), changed = new Set([...a.changed, ...b.changed])
  for (const id of [...added]) if (removed.has(id)) { added.delete(id); removed.delete(id) }   // added then removed = nothing happened
  for (const id of [...added, ...removed]) changed.delete(id)
  return { added: [...added], changed: [...changed], removed: [...removed], edited: a.edited || b.edited }
}

export function logActivity(db: DB, nb: string, user: string, section: string, d: Detail, via: string) {
  if (isEmpty(d)) return
  const now = Date.now()
  const last = db.prepare('select id, user, section, via, detail, ts from activity where nb=? order by id desc limit 1').get(nb) as { id: number; user: string; section: string; via: string; detail: string; ts: number } | undefined
  if (last && last.user === user && last.section === section && last.via === via && now - last.ts < 120_000) {
    const merged = mergeDetail(JSON.parse(last.detail), d)
    if (isEmpty(merged)) db.prepare('delete from activity where id=?').run(last.id)
    else db.prepare('update activity set detail=?, ts=? where id=?').run(JSON.stringify(merged), now, last.id)
    return
  }
  db.prepare('insert into activity(nb,user,section,detail,via,ts) values(?,?,?,?,?,?)').run(nb, user, section, JSON.stringify(d), via, now)
  db.prepare('delete from activity where nb=? and id not in (select id from activity where nb=? order by id desc limit 200)').run(nb, nb)
}

const LABEL: Record<string, [string, string]> = { coords: ['place', 'places'], todos: ['to-do', 'to-dos'], farms: ['farm', 'farms'], gear: ['gear item', 'gear items'], deaths: ['death', 'deaths'] }
export function describe(section: string, d: Detail): string {
  if (section === 'notes') return 'edited the notes'
  if (section === 'members') return 'joined the notebook'
  const [one, many] = LABEL[section] ?? ['row', 'rows']
  const n = (k: number) => `${k} ${k === 1 ? one : many}`
  const parts = [d.added.length && `added ${n(d.added.length)}`, d.changed.length && `edited ${n(d.changed.length)}`, d.removed.length && `removed ${n(d.removed.length)}`].filter(Boolean)
  return parts.join(', ') || 'made changes'
}
import type { DB } from './db'

/** What changed in one save. names/fields/marks were added later, so older entries may not have them. */
export type Detail = { added: string[]; changed: string[]; removed: string[]; edited?: boolean; names?: Record<string, string>; fields?: Record<string, string[]>; marks?: Record<string, string> }
const rows = (raw: string | undefined): any[] => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
export const isEmpty = (d: Detail) => !d.edited && !d.added.length && !d.changed.length && !d.removed.length

const pretty = (s: string) => s.replace(/^minecraft:/, '').replace(/_/g, ' ').replace(/(^| )[a-z]/g, c => c.toUpperCase())
/** A short human name for a row: its name, a to-do's project, or a gear item's type. */
export const rowName = (r: any): string => String(r?.name || r?.project || (r?.item ? pretty(String(r.item)) : '') || '').trim().slice(0, 60)
const SKIP = new Set(['id', 'by', 'ts', 'ttl'])
/** A change worth its own words: a to-do finished, a farm built, a death's items recovered. */
function mark(a: any, b: any): string | undefined {
  if (b?.progress === 'Done' && a?.progress !== 'Done') return 'finished'
  if (b?.built === true && a?.built !== true) return 'built'
  if (b?.building === true && !a?.building && !b?.built) return 'started building'
  if (b?.recovered === true && a?.recovered !== true) return 'recovered'
  return undefined
}

/** What changed between two versions of a table section, by row id, with row names and which fields changed. */
export function diffRows(oldRaw: string | undefined, next: any[]): Detail {
  const before = new Map(rows(oldRaw).map(r => [r?.id, r])), after = new Map(next.map(r => [r?.id, r]))
  const d: Detail = { added: [], changed: [], removed: [], names: {}, fields: {}, marks: {} }
  for (const [id, r] of after) {
    const o = before.get(id)
    if (o === undefined) { d.added.push(id); d.names![id] = rowName(r); continue }
    if (JSON.stringify(o) === JSON.stringify(r)) continue
    d.changed.push(id); d.names![id] = rowName(r) || rowName(o)
    d.fields![id] = [...new Set([...Object.keys(o || {}), ...Object.keys(r || {})])].filter(k => !SKIP.has(k) && JSON.stringify(o?.[k]) !== JSON.stringify(r?.[k]))
    const m = mark(o, r); if (m) d.marks![id] = m
  }
  for (const [id, r] of before) if (!after.has(id)) { d.removed.push(id); d.names![id] = rowName(r) }
  return d
}

/** Folds two consecutive edits by the same person into one entry (typing in a table saves many times). */
export function mergeDetail(a: Detail, b: Detail): Detail {
  const added = new Set([...a.added, ...b.added]), removed = new Set([...a.removed, ...b.removed]), changed = new Set([...a.changed, ...b.changed])
  for (const id of [...added]) if (removed.has(id)) { added.delete(id); removed.delete(id) }   // added then removed = nothing happened
  for (const id of [...added, ...removed]) changed.delete(id)
  const fields: Record<string, string[]> = { ...(a.fields || {}) }
  for (const [id, f] of Object.entries(b.fields || {})) fields[id] = [...new Set([...(fields[id] || []), ...f])]
  return { added: [...added], changed: [...changed], removed: [...removed], edited: a.edited || b.edited, names: { ...(a.names || {}), ...(b.names || {}) }, fields, marks: { ...(a.marks || {}), ...(b.marks || {}) } }
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
const FIELD: Record<string, string> = { name: 'name', cat: 'category', ow: 'coordinates', nether: 'coordinates', end: 'coordinates', portal: 'portal', priority: 'priority', progress: 'status',
  assignee: 'assignee', qty: 'quantity', notes: 'notes', icon: 'icon', place: 'place', file: 'litematic', tutorial: 'video', building: 'status', built: 'status', enchants: 'enchantments',
  item: 'item', off: 'switched-off enchantments', plan: 'planned', project: 'name', recovered: 'recovered', x: 'coordinates', y: 'coordinates', z: 'coordinates', dim: 'dimension', cause: 'cause' }
const list = (names: string[]) => names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`

export function describe(section: string, d: Detail): string {
  if (section === 'notes') return 'edited the notes'
  if (section === 'members') return 'joined the notebook'
  const [one, many] = LABEL[section] ?? ['row', 'rows']
  const n = (k: number) => `${k} ${k === 1 ? one : many}`
  const nm = (id: string) => d.names?.[id] || ''
  if (!d.names) {   // entries saved before names were kept
    const parts = [d.added.length && `added ${n(d.added.length)}`, d.changed.length && `edited ${n(d.changed.length)}`, d.removed.length && `removed ${n(d.removed.length)}`].filter(Boolean)
    return parts.join(', ') || 'made changes'
  }
  const group = (verb: string, ids: string[]) => {
    if (!ids.length) return ''
    const named = ids.map(nm).filter(Boolean)
    if (ids.length === 1) return named[0] ? `${verb} the ${one} ${named[0]}` : `${verb} a ${one}`
    return named.length ? `${verb} ${n(ids.length)}: ${list(named)}` : `${verb} ${n(ids.length)}`
  }
  const marked = d.changed.filter(id => d.marks?.[id]), plain = d.changed.filter(id => !d.marks?.[id])
  const byMark = new Map<string, string[]>(); for (const id of marked) byMark.set(d.marks![id], [...(byMark.get(d.marks![id]) || []), id])
  let edited = group('edited', plain)
  if (plain.length === 1) {
    const f = [...new Set((d.fields?.[plain[0]] || []).map(k => FIELD[k] || k))]
    if (f.length && f.length <= 3) edited += ` (${f.join(', ')})`
  }
  const parts = [group('added', d.added), ...[...byMark].map(([m, ids]) => group(m, ids)), edited, group('removed', d.removed)].filter(Boolean)
  return parts.join('; ') || 'made changes'
}

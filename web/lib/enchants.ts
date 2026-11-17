import data from './enchants.json'

// Rules come from shared/enchants.json (also bundled into the mod): which enchants each item can get, max levels, conflicts.
export type EnchDef = { name: string; max: number; curse?: boolean }
export type Kind = { label: string; group: string; enchants: string[]; variants: { label: string; id: string }[] }
export const ENCH = data.enchants as Record<string, EnchDef>
export const KINDS = data.kinds as Record<string, Kind>
const EXCLUSIVE = data.exclusive as string[][]
const NAME_TO_KEY: Record<string, string> = Object.fromEntries(Object.entries(ENCH).map(([k, v]) => [v.name, k]))
export const KIND_GROUPS = ['Weapons', 'Tools', 'Armor', 'Other']

export const kindOfItem = (item?: string): string | undefined => Object.entries(KINDS).find(([, k]) => k.variants.some(v => v.id === item))?.[0]
const words = (s: string) => s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
const POTION_OF = /^(potion|splash_potion|lingering_potion|tipped_arrow)_(.+)$/
/** A readable item name. Potion and arrow icons made for each effect read "Potion of Healing", "Arrow of Poison" and so on. */
export const prettyItem = (id?: string) => {
  const m = (id || '').match(POTION_OF)
  if (m && !['potion', 'splash_potion', 'lingering_potion'].includes(id || '')) return `${m[1] === 'tipped_arrow' ? 'Arrow' : words(m[1])} of ${words(m[2])}`
  return words(id || '')
}
export const conflictsOf = (key: string) => new Set(EXCLUSIVE.filter(s => s.includes(key)).flat().filter(k => k !== key))

export type Owned = { name: string; level: number; max: number; state: 'max' | 'low' | 'curse' | 'other' }
export type Missing = { key: string; name: string; max: number; alt: boolean; goal?: boolean }
export type Opts = { off?: Iterable<string>; goal?: Record<string, number> }
const R = ['', 'I', 'II', 'III', 'IV', 'V']
/** "Sharpness V", but "Mending" — enchants whose max is I don't need the numeral. */
export const lvl = (name: string, level: number, max: number) => (max <= 1 ? name : `${name} ${R[level] || level}`)

export type Analysis = { owned: Owned[]; missing: Missing[]; off: Missing[]; goals: Missing[]; upgrades: number; remaining: number; done: boolean; known: boolean }

/**
 * What an item still needs. `have` maps display names to levels (how gear is stored).
 * opts.off = enchants switched off for THIS item (shown red, can be switched back on); opts.goal = enchants you want on it (name -> level).
 * Conflicting enchants are "excluded", not missing. A goal also excludes whatever it conflicts with.
 */
export function analyse(kind: string | undefined, have: Record<string, number>, opts: Opts = {}): Analysis {
  const off = new Set(opts.off ?? []), goalKey: Record<string, number> = {}
  for (const [n, l] of Object.entries(opts.goal ?? {})) { const k = NAME_TO_KEY[n]; if (k && l > 0) goalKey[k] = l }
  const levels: Record<string, number> = {}
  const owned: Owned[] = Object.entries(have || {}).map(([name, level]) => {
    const key = NAME_TO_KEY[name], def = key ? ENCH[key] : undefined
    if (key) levels[key] = level
    const max = (key && goalKey[key]) || def?.max || level
    return { name, level, max, state: !def ? 'other' : def.curse ? 'curse' : level >= max ? 'max' : 'low' } as Owned
  })
  const upgrades = owned.filter(o => o.state === 'low').length
  const k = kind ? KINDS[kind] : undefined
  if (!k) return { owned, missing: [], off: [], goals: [], upgrades, remaining: 0, done: false, known: false }

  const goals: Missing[] = Object.entries(goalKey).filter(([key]) => !(levels[key] > 0)).map(([key, l]) => ({ key, name: ENCH[key].name, max: l, alt: false, goal: true }))
  const wanted = new Set(goals.map(g => g.key))
  const missing: Missing[] = [], offList: Missing[] = []
  for (const key of k.enchants) {
    const def = ENCH[key]
    if (def.curse || (levels[key] ?? 0) > 0 || wanted.has(key)) continue
    if ([...conflictsOf(key)].some(c => (levels[c] ?? 0) > 0 || wanted.has(c))) continue
    ;(off.has(key) ? offList : missing).push({ key, name: def.name, max: def.max, alt: false })
  }
  const keys = new Set(missing.map(m => m.key))
  for (const m of missing) m.alt = [...conflictsOf(m.key)].some(c => keys.has(c))
  const seen = new Set<string>(); let groups = 0
  for (const m of missing) {
    if (seen.has(m.key)) continue
    groups++; const stack = [m.key]
    while (stack.length) { const c = stack.pop()!; if (seen.has(c)) continue; seen.add(c); for (const n of conflictsOf(c)) if (keys.has(n)) stack.push(n) }
  }
  const remaining = upgrades + groups + goals.length
  return { owned, missing, off: offList, goals, upgrades, remaining, done: remaining === 0 && owned.some(o => o.state !== 'curse'), known: true }
}

/** A planned item (plan: true) has nothing yet — everything on it is a goal. */
export const gearParts = (it: any) => it.plan
  ? { have: {} as Record<string, number>, goal: { ...(it.enchants || {}), ...(it.goal || {}) } as Record<string, number>, off: (it.off || []) as string[] }
  : { have: (it.enchants || {}) as Record<string, number>, goal: (it.goal || {}) as Record<string, number>, off: (it.off || []) as string[] }
export const analyseItem = (it: any): Analysis => { const p = gearParts(it); return analyse(kindOfItem(it.item || it.icon), p.have, { off: p.off, goal: p.goal }) }

/** Enchanted books still needed across a set of items: [display name, max level, how many items] */
export function bookList(items: any[]) {
  const need = new Map<string, { name: string; max: number; count: number }>()
  const add = (name: string, max: number) => { const e = need.get(name) ?? { name, max, count: 0 }; e.count++; need.set(name, e) }
  for (const it of items) {
    const a = analyseItem(it)
    for (const o of a.owned) if (o.state === 'low') add(o.name, o.max)
    for (const m of a.missing) if (!m.alt) add(m.name, m.max)
    for (const g of a.goals) add(g.name, g.max)
  }
  return [...need.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

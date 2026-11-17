// Three-way merge for table sections, by row id, so two people editing at once don't overwrite each other.
// base = what I last saw from the server, mine = my edited copy, theirs = what the server has now.
type Row = { id: string; [k: string]: any }
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)

export function mergeRows(base: Row[], mine: Row[], theirs: Row[]): Row[] {
  const B = new Map(base.map(r => [r.id, r])), M = new Map(mine.map(r => [r.id, r])), T = new Map(theirs.map(r => [r.id, r]))
  const out: Row[] = []
  for (const t of theirs) {
    const b = B.get(t.id), m = M.get(t.id)
    if (!b) { out.push(t); continue }                                  // they added it
    if (!m) { if (!same(b, t)) out.push(t); continue }                 // I deleted it: gone, unless they edited it meanwhile
    const merged: Row = { ...t }                                       // both have it: keep their changes, layer my field edits on top
    for (const k of new Set([...Object.keys(m), ...Object.keys(b)])) if (!same(m[k], b[k])) { if (k in m) merged[k] = m[k]; else delete merged[k] }
    out.push(merged)
  }
  for (const m of mine) {
    const b = B.get(m.id)
    if (!b && !T.has(m.id)) out.push(m)                                // I added it
    else if (b && !T.has(m.id) && !same(m, b)) out.push(m)             // they deleted it but I edited it: keep my version
  }
  return out
}

export function mergeSection(name: string, base: any, mine: any, theirs: any) {
  if (name === 'notes') return same(mine, base) ? theirs : mine         // free text: my edit wins if I changed it
  return mergeRows(Array.isArray(base) ? base : [], Array.isArray(mine) ? mine : [], Array.isArray(theirs) ? theirs : [])
}

// Reads coordinates pasted from the game. F3+C gives "/execute in minecraft:the_nether run tp @s 1303.46 60.00 -1888.91 6.34 20.58",
// which says which dimension it is. "/tp x y z" and plain "x y z" don't, so the caller has to know (or ask).
// Coordinates are never converted between dimensions here.

export type Dim = 'ow' | 'nether' | 'end'
export type Pasted = { xyz: string; dim: Dim | null }
export const DIM_LABEL: Record<Dim, string> = { ow: 'Overworld', nether: 'Nether', end: 'End' }
const DIM_ID: Record<string, Dim> = { 'minecraft:overworld': 'ow', overworld: 'ow', 'minecraft:the_nether': 'nether', the_nether: 'nether', 'minecraft:the_end': 'end', the_end: 'end' }

const NUM = '(-?\\d+(?:\\.\\d+)?)'
const XYZ = new RegExp(`^${NUM}[\\s,]+${NUM}[\\s,]+${NUM}(?:\\s+-?\\d+(?:\\.\\d+)?){0,2}$`)
const block = (n: string) => String(Math.floor(Number(n)))

/** The block position and dimension in a pasted command or "x y z", or null if it isn't one. Throws for a dimension the notebook has no column for. */
export function parsePaste(text: string): Pasted | null {
  let s = (text || '').trim().replace(/^\//, '').replace(/\s+/g, ' ')
  let dim: Dim | null = null
  const ex = s.match(/^execute in (\S+) run (.*)$/i)
  if (ex) {
    dim = DIM_ID[ex[1].toLowerCase()] ?? null
    if (!dim) throw new Error(`The notebook has no column for ${ex[1]}`)
    s = ex[2]
  }
  const tp = s.match(/^(?:tp|teleport) (?:(?:@[spaer](?:\[[^\]]*\])?|(?!-?\d)[\w.-]{1,16}) )?(.*)$/i)
  if (tp) s = tp[1]
  else if (ex) return null
  const m = s.match(XYZ)
  if (!m) return null
  return { xyz: [block(m[1]), block(m[2]), block(m[3])].join(' '), dim }
}

/** True for text that looks like something pasted from the game rather than typed "x y z" (so a cell can react to it). */
export const looksPasted = (text: string) => /^\/?(execute|tp|teleport)\b/i.test((text || '').trim()) || /\d\.\d/.test(text || '') || /,/.test(text || '')

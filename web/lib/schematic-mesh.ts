// Turns a schematic into triangles using the game's own block models (public/mc/blocks.json, made by scripts/extract-blocks.mjs).
// Faces hidden against a full solid neighbour are skipped, like the game does, so big builds stay light.
import type { Block, Schematic, Tile } from './litematic'

type Face = [number, number[] | null, number, number, number]   // texture, uv, cull, tint, uv rotation
type Box = [number[], number[], 0 | [string, number, number, number, number], Record<string, Face>]
type ModelRef = { m: number; x?: number; y?: number }
export type BlockData = {
  cols: number; rows: number; tex: string[]
  big?: Record<number, number[]>   // block entity textures kept at full size: [x, y, w, h] on the sheet
  models: ({ b: Box[] } | { p: number } | { q: number[][] })[]   // q: baked block entity quads, [texture, tint, then x y z u v for each corner]
  blocks: Record<string, { v?: [string, ModelRef][]; mp?: [any, ModelRef][]; t?: number[]; fluid?: number }>
}
export type MeshPart = { pos: Float32Array; uv: Float32Array; col: Float32Array; idx: Uint32Array }
/** custom: parts drawn with their own picture instead of the sheet, keyed "skin:<hash, uuid or name>" or "banner:<colour>:<pattern/colour,...>". Their uv is in that picture's pixels. */
export type Mesh = { solid: MeshPart; glass: MeshPart; custom: Record<string, MeshPart>; faces: number }

const DIRS: Record<string, number[]> = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }
const corners = (dir: string, [x0, y0, z0]: number[], [x1, y1, z1]: number[]): number[][] => {
  switch (dir) {
    case 'up': return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
    case 'down': return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]]
    case 'north': return [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]]
    case 'south': return [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]
    case 'west': return [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]]
    default: return [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]]
  }
}
const defaultUv = (dir: string, [x0, y0, z0]: number[], [x1, y1, z1]: number[]): number[] => {
  switch (dir) {
    case 'down': return [x0, 16 - z1, x1, 16 - z0]
    case 'up': return [x0, z0, x1, z1]
    case 'north': return [16 - x1, 16 - y1, 16 - x0, 16 - y0]
    case 'south': return [x0, 16 - y1, x1, 16 - y0]
    case 'west': return [z0, 16 - y1, z1, 16 - y0]
    default: return [16 - z1, 16 - y1, 16 - z0, 16 - y0]
  }
}
const rad = (d: number) => d * Math.PI / 180
const rotAxis = (axis: string, a: number, [x, y, z]: number[]): number[] => {
  const c = Math.cos(a), s = Math.sin(a)
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c]
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c]
  return [x * c - y * s, x * s + y * c, z]
}
/** A block state's rotation (x first, then y, both the opposite way round to the maths convention), about the block's centre. */
const turn = (r: ModelRef, p: number[]) => {
  let q = [p[0] - 8, p[1] - 8, p[2] - 8]
  if (r.x) q = rotAxis('x', rad(-r.x), q)
  if (r.y) q = rotAxis('y', rad(-r.y), q)
  return [q[0] + 8, q[1] + 8, q[2] + 8]
}
const turnDir = (r: ModelRef, n: number[]) => { let q = n; if (r.x) q = rotAxis('x', rad(-r.x), q); if (r.y) q = rotAxis('y', rad(-r.y), q); return q.map(Math.round) }
const dirOf = (n: number[]) => Object.keys(DIRS).find(k => DIRS[k][0] === n[0] && DIRS[k][1] === n[1] && DIRS[k][2] === n[2]) || 'up'

/** Which models a block state uses: the variant whose conditions all match, or every multipart piece whose condition matches. */
export function modelsFor(data: BlockData, b: Block): ModelRef[] {
  const def = data.blocks[b.name]
  if (!def) return []
  if (def.v) {
    const match = def.v.find(([k]) => !k || k.split(',').every(kv => { const [p, v] = kv.split('='); return b.props[p] === v }))
    return match ? [match[1]] : [def.v[0][1]]
  }
  const test = (w: any): boolean => {
    if (!w) return true
    if (w.OR) return w.OR.some(test)
    if (w.AND) return w.AND.every(test)
    return Object.entries(w).every(([p, v]) => String(v).split('|').includes(b.props[p] ?? ''))
  }
  return (def.mp || []).filter(([w]) => test(w)).map(([, r]) => r)
}

const SEE_THROUGH = /glass|leaves|ice$|^ice|slime|honey_block|barrier|spawner|vault|trial|mangrove_roots|scaffolding|^light$/
const TRANSLUCENT = /stained_glass|^glass|tinted_glass|ice$|^ice|slime_block|honey_block|water/
// Blocks the game draws with code: a plain box of their particle texture, about the right size
const SPECIAL: [RegExp, number[], number[]][] = [
  [/chest$/, [1, 0, 1], [15, 14, 15]], [/_bed$/, [0, 0, 0], [16, 9, 16]], [/(skull|head)$/, [4, 0, 4], [12, 8, 12]],
  [/shulker_box$/, [0, 0, 0], [16, 16, 16]], [/(wall_)?(hanging_)?sign$|banner$/, [2, 0, 7], [14, 12, 9]], [/conduit|decorated_pot/, [3, 0, 3], [13, 13, 13]],
]

export function buildMesh(s: Schematic, data: BlockData): Mesh {
  const { X, Y, Z } = s, W = data.cols * 16, H = data.rows * 16
  const states = s.palette.map(b => {
    const refs = modelsFor(data, b)
    const one = refs.length === 1 && 'b' in data.models[refs[0].m] ? (data.models[refs[0].m] as { b: Box[] }).b : null
    const full = !!one && one.length === 1 && one[0][0].join() === '0,0,0' && one[0][1].join() === '16,16,16' && !one[0][2]
    return { b, refs, solid: full && !SEE_THROUGH.test(b.name), glass: TRANSLUCENT.test(b.name), tint: data.blocks[b.name]?.t, fluid: data.blocks[b.name]?.fluid }
  })
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z ? 0 : s.data[(y * Z + z) * X + x])
  const parts = { solid: { p: [] as number[], u: [] as number[], c: [] as number[], i: [] as number[] }, glass: { p: [] as number[], u: [] as number[], c: [] as number[], i: [] as number[] } }
  let faces = 0
  type Part = typeof parts.solid
  const custom: Record<string, Part> = {}
  const corner = (texIdx: number) => data.big?.[texIdx] ?? [(texIdx % data.cols) * 16, Math.floor(texIdx / data.cols) * 16]
  const quad = (glass: boolean, pts: number[][], uv: number[] | number[][], rot: number, texIdx: number, shade: number[], ox: number, oy: number, oz: number, own?: Part) => {
    const g = own || (glass ? parts.glass : parts.solid), base = g.p.length / 3
    const [tx, ty] = own ? [0, 0] : corner(texIdx)
    let uvs = Array.isArray(uv[0]) ? uv as number[][] : (([a, b, c, d]) => [[a, b], [c, b], [c, d], [a, d]])(uv as number[])
    for (let r = 0; r < (rot / 90) % 4; r++) uvs = [uvs[3], uvs[0], uvs[1], uvs[2]]
    for (let k = 0; k < 4; k++) {
      g.p.push(ox + pts[k][0] / 16, oy + pts[k][1] / 16, oz + pts[k][2] / 16)
      if (own) g.u.push(uvs[k][0], uvs[k][1]); else g.u.push((tx + uvs[k][0]) / W, 1 - (ty + uvs[k][1]) / H)
      g.c.push(shade[0], shade[1], shade[2])
    }
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3)
    faces++
  }
  const linear = (v: number) => Math.pow(v / 255, 2.2)   // tints are sRGB colours; the viewer mixes in linear light and converts back
  const light = (n: number[]) => (n[1] > 0.5 ? 1 : n[1] < -0.5 ? 0.5 : Math.abs(n[2]) > Math.abs(n[0]) ? 0.8 : 0.62)
  const normalOf = (p: number[][]) => {
    const a = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], b = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]]
    const n = [a[2] * b[1] - a[1] * b[2], a[0] * b[2] - a[2] * b[0], a[1] * b[0] - a[0] * b[1]], l = Math.hypot(...n) || 1
    return n.map(v => v / l)
  }
  const hidden = (x: number, y: number, z: number, dir: string, self: number) => {
    const d = DIRS[dir], n = at(x + d[0], y + d[1], z + d[2])
    if (!n) return false
    const st = states[n]
    return st.solid || (st.b.name === states[self].b.name && (st.glass || st.fluid !== undefined || SEE_THROUGH.test(st.b.name)))   // glass next to glass, water next to water (any level)
  }
  const box = (st: typeof states[number], self: number, x: number, y: number, z: number, ref: ModelRef, from: number[], to: number[], rot: Box[2], faceMap: Record<string, Face>) => {
    for (const [dir, f] of Object.entries(faceMap)) {
      const worldDir = dirOf(turnDir(ref, DIRS[dir]))
      if (f[2] && hidden(x, y, z, worldDir, self)) continue
      let pts = corners(dir, from, to)
      if (rot) pts = pts.map(p => { const [axis, ang, ox, oy, oz] = rot; const q = rotAxis(axis, rad(ang), [p[0] - ox, p[1] - oy, p[2] - oz]); return [q[0] + ox, q[1] + oy, q[2] + oz] })
      pts = pts.map(p => turn(ref, p))
      const l = light(normalOf(pts)), t = f[3] && st.tint ? st.tint.map(linear) : [1, 1, 1]
      quad(st.glass, pts, f[1] || defaultUv(dir, from, to), f[4], f[0], [t[0] * l, t[1] * l, t[2] * l], x, y, z)
    }
  }
  const plain = (tex: number) => Object.fromEntries(Object.keys(DIRS).map(d => [d, [tex, null, 1, 0, 0] as Face]))
  for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const id = s.data[(y * Z + z) * X + x]; if (!id) continue
    const st = states[id]
    if (st.fluid !== undefined) {   // water and lava: a box a bit lower than a full block, tinted
      const top = states[at(x, y + 1, z)]?.b.name === st.b.name ? 16 : 14
      box({ ...st, tint: st.tint || [255, 255, 255] }, id, x, y, z, {} as ModelRef, [0, 0, 0], [16, top, 16], 0,
        Object.fromEntries(Object.keys(DIRS).map(d => [d, [st.fluid!, [0, 0, 16, 16], 1, 1, 0] as Face])))
      continue
    }
    for (const ref of st.refs) {
      const m = data.models[ref.m]
      if ('b' in m) for (const [from, to, rot, f] of m.b) box(st, id, x, y, z, ref, from, to, rot, f)
      else if ('q' in m) {   // a chest, banner, head and so on, already turned the right way
        const key = ownPicture(st.b.name, s.tiles?.get((y * Z + z) * X + x))
        for (const q of m.q) {
          const pts = [0, 1, 2, 3].map(k => turn(ref, q.slice(2 + k * 5, 5 + k * 5))), uv = [0, 1, 2, 3].map(k => q.slice(5 + k * 5, 7 + k * 5))
          const own = key && (key.all || q[1]) ? (custom[key.key] ||= { p: [], u: [], c: [], i: [] }) : undefined   // a head's skin, or a banner's patterned cloth
          const l = light(normalOf(pts)), t = !own && q[1] && st.tint ? st.tint.map(linear) : [1, 1, 1]
          quad(st.glass, pts, uv, 0, q[0], [t[0] * l, t[1] * l, t[2] * l], x, y, z, own)
        }
      } else if (m.p >= 0) {
        const sp = SPECIAL.find(([re]) => re.test(st.b.name))
        box(st, id, x, y, z, ref, sp ? sp[1] : [1, 0, 1], sp ? sp[2] : [15, 15, 15], 0, plain(m.p))
      }
    }
  }
  const pack = (g: typeof parts.solid): MeshPart => ({ pos: new Float32Array(g.p), uv: new Float32Array(g.u), col: new Float32Array(g.c), idx: new Uint32Array(g.i) })
  return { solid: pack(parts.solid), glass: pack(parts.glass), custom: Object.fromEntries(Object.entries(custom).map(([k, g]) => [k, pack(g)])), faces }
}

/** Which blocks get their own picture: player heads with a skin (the whole head) and banners with patterns (the cloth). */
function ownPicture(name: string, tile?: Tile): { key: string; all: boolean } | null {
  if (!tile) return null
  if (tile.skin && /^player(_wall)?_head$/.test(name)) return { key: 'skin:' + tile.skin, all: true }
  const colour = name.match(/^(.+?)_(wall_)?banner$/)?.[1]
  if (tile.patterns && colour) return { key: `banner:${colour}:${tile.patterns.map(p => p.join('/')).join(',')}`, all: false }
  return null
}

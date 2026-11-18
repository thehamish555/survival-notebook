// Turns a schematic into triangles using the game's own block models (public/mc/blocks.json, made by scripts/extract-blocks.mjs).
// Faces hidden against a neighbour that covers them are skipped, like the game does, so big builds stay light.
import type { Block, Entity, Schematic, Tile } from './litematic'

type Face = [number, number[] | null, number, number, number]   // texture, uv, cull, tint, uv rotation
type Box = [number[], number[], 0 | [string, number, number, number, number], Record<string, Face>]
type ModelRef = { m: number; x?: number; y?: number }
export type BlockData = {
  cols: number; rows: number; tex: string[]
  big?: Record<number, number[]>   // block entity textures kept at full size: [x, y, w, h] on the sheet
  models: ({ b: Box[] } | { p: number } | { q: number[][] })[]   // q: baked block entity quads, [texture, tint, then x y z u v for each corner]
  blocks: Record<string, { v?: [string, ModelRef][]; mp?: [any, ModelRef][]; t?: number[]; fluid?: number }>
  /** Mobs, boats, minecarts and frames, facing yaw 0 with the entity at the origin. Keys starting "m:" have no texture of their own: the viewer picks one. Loaded separately (entities.json). */
  entities?: Record<string, { q: number[][]; pic?: string; s?: number[] }>   // s: the texture size the uv is in, for mobs (their pictures are scaled to fit)
  paintings?: Record<string, number[]>   // how many blocks wide and high
}
export type MeshPart = { pos: Float32Array; uv: Float32Array; col: Float32Array; idx: Uint32Array }
/** custom: parts drawn with their own picture instead of the sheet, keyed by what the picture is ("skin:<hash>", "banner:<colour>:<patterns>", "tex:<entity texture>",
 *  "item:<id>", "paint:<painting>" and so on); a key ending "#clear" is see-through. Their uv is in that picture's pixels, except mob textures (tex, villager,
 *  zombie_villager), which are 0..1. */
export type Mesh = { solid: MeshPart; glass: MeshPart; custom: Record<string, MeshPart>; faces: number; missing: Record<string, number> }

const DIRS: Record<string, number[]> = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }
const OPPOSITE: Record<string, string> = { down: 'up', up: 'down', north: 'south', south: 'north', west: 'east', east: 'west' }
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

// ---- 4x4 matrices (row by row), for placing entities
type M4 = number[]
const mul = (a: M4, b: M4): M4 => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c]; return o }
const chain = (...ms: M4[]) => ms.reduce(mul)
const T = (x: number, y: number, z: number): M4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]
const S = (x: number, y = x, z = x): M4 => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]
const RY = (a: number): M4 => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1] }
const RX = (a: number): M4 => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1] }
const apply = (m: M4, [x, y, z]: number[]) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]]

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
// Blocks whose shape hides the faces it covers, though it isn't a full block (the game's occlusion shapes): a slab's side hides its neighbour's slab side
const COVERS = /_slab$|_stairs$|^snow$|^farmland$|^dirt_path$|carpet$/
// Always in water, though they don't say so
const ALWAYS_WET = /^(bubble_column|kelp|kelp_plant|seagrass|tall_seagrass)$/
// Blocks the game draws with code that the viewer has no shape for: a plain box of their particle texture, about the right size. Anything else without a shape is invisible (light, barriers).
const SPECIAL: [RegExp, number[], number[], number[]?][] = [
  [/chest$/, [1, 0, 1], [15, 14, 15]], [/_bed$/, [0, 0, 0], [16, 9, 16]], [/(skull|head)$/, [4, 0, 4], [12, 8, 12]],
  [/shulker_box$/, [0, 0, 0], [16, 16, 16]], [/(wall_)?(hanging_)?sign$|banner$/, [2, 0, 7], [14, 12, 9]], [/conduit|decorated_pot/, [3, 0, 3], [13, 13, 13]],
  [/^end_portal$/, [0, 6, 0], [16, 12, 16], [0.05, 0.07, 0.1]], [/^end_gateway$/, [0, 0, 0], [16, 16, 16], [0.05, 0.07, 0.1]], [/copper_golem_statue$/, [4, 0, 4], [12, 14, 12]],
]

export function buildMesh(s: Schematic, data: BlockData): Mesh {
  const { X, Y, Z } = s, W = data.cols * 16, H = data.rows * 16
  const states = s.palette.map(b => {
    const refs = modelsFor(data, b)
    const one = refs.length === 1 && 'b' in data.models[refs[0].m] ? (data.models[refs[0].m] as { b: Box[] }).b : null
    const full = !!one && one.length === 1 && one[0][0].join() === '0,0,0' && one[0][1].join() === '16,16,16' && !one[0][2]
    const def = data.blocks[b.name]
    const wet = b.name === 'water' || ALWAYS_WET.test(b.name) || b.props.waterlogged === 'true'
    return { b, refs, solid: full && !SEE_THROUGH.test(b.name), glass: TRANSLUCENT.test(b.name), tint: def?.t, fluid: def?.fluid, wet, lava: b.name === 'lava', covers: null as Record<string, number[][]> | null }
  })
  // What each partly-covering block (slabs, stairs) covers on each side of its block: rectangles in the two other axes, in pixels
  const AXES: Record<string, [number, number, number, number]> = { down: [1, 0, 0, 2], up: [1, 16, 0, 2], north: [2, 0, 0, 1], south: [2, 16, 0, 1], west: [0, 0, 1, 2], east: [0, 16, 1, 2] }
  const rectOf = (pts: number[][], dir: string) => {
    const [axis, at, a, b] = AXES[dir]
    if (pts.some(p => Math.abs(p[axis] - at) > 1e-4)) return null   // not on the block's side
    return [Math.min(...pts.map(p => p[a])), Math.min(...pts.map(p => p[b])), Math.max(...pts.map(p => p[a])), Math.max(...pts.map(p => p[b]))]
  }
  for (const st of states) {
    if (!COVERS.test(st.b.name) || st.solid) continue
    const cov: Record<string, number[][]> = {}
    for (const ref of st.refs) {
      const m = data.models[ref.m]; if (!('b' in m)) continue
      for (const [from, to, rot, faces] of m.b) {
        if (rot) continue
        for (const dir of Object.keys(faces)) {
          const pts = corners(dir, from, to).map(p => turn(ref, p)), wd = dirOf(turnDir(ref, DIRS[dir])), r = rectOf(pts, wd)
          if (r) (cov[wd] ||= []).push(r)
        }
      }
    }
    st.covers = cov
  }
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z ? 0 : s.data[(y * Z + z) * X + x])
  type Part = { p: number[]; u: number[]; c: number[]; i: number[] }
  const newPart = (): Part => ({ p: [], u: [], c: [], i: [] })
  const parts = { solid: newPart(), glass: newPart() }
  const custom: Record<string, Part> = {}
  let faces = 0
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
  /** Whether the face of block `self` at (x, y, z) on side `dir` (corners pts, in pixels) is covered by its neighbour. */
  const hidden = (x: number, y: number, z: number, dir: string, self: number, pts?: number[][]) => {
    const d = DIRS[dir], n = at(x + d[0], y + d[1], z + d[2])
    if (!n) return false
    const st = states[n]
    if (st.solid || (st.b.name === states[self].b.name && (st.glass || SEE_THROUGH.test(st.b.name)))) return true   // glass next to glass
    const cov = st.covers?.[OPPOSITE[dir]], r = cov && pts && rectOf(pts, dir)
    return !!r && cov!.some(c => c[0] <= r[0] + 1e-4 && c[1] <= r[1] + 1e-4 && c[2] >= r[2] - 1e-4 && c[3] >= r[3] - 1e-4)
  }
  const box = (st: typeof states[number], self: number, x: number, y: number, z: number, ref: ModelRef, from: number[], to: number[], rot: Box[2], faceMap: Record<string, Face>, place?: M4, shadeBy?: number[]) => {
    for (const [dir, f] of Object.entries(faceMap)) {
      const worldDir = dirOf(turnDir(ref, DIRS[dir]))
      let pts = corners(dir, from, to)
      if (rot) pts = pts.map(p => { const [axis, ang, ox, oy, oz] = rot; const q = rotAxis(axis, rad(ang), [p[0] - ox, p[1] - oy, p[2] - oz]); return [q[0] + ox, q[1] + oy, q[2] + oz] })
      pts = pts.map(p => turn(ref, p))
      if (place) pts = pts.map(p => apply(place, p.map(v => v / 16)).map(v => v * 16))   // a block carried by an entity: no neighbours to hide behind
      else if (f[2] && hidden(x, y, z, worldDir, self, pts)) continue
      const l = light(normalOf(pts)), t = f[3] && st.tint ? st.tint.map(linear) : shadeBy || [1, 1, 1]
      quad(st.glass, pts, f[1] || defaultUv(dir, from, to), f[4], f[0], [t[0] * l, t[1] * l, t[2] * l], place ? 0 : x, place ? 0 : y, place ? 0 : z)
    }
  }
  const plain = (tex: number) => Object.fromEntries(Object.keys(DIRS).map(d => [d, [tex, null, 1, 0, 0] as Face]))

  // Water and lava, including blocks standing in water: a box as high as the fluid, with only the faces that don't touch more of it
  const fluidTex = (lava: boolean) => data.blocks[lava ? 'lava' : 'water']?.fluid
  const fluid = (x: number, y: number, z: number, st: typeof states[number]) => {
    const lava = st.lava, tex = fluidTex(lava); if (tex === undefined) return
    const same = (id: number) => !!id && (lava ? states[id].lava : states[id].wet)
    const level = Number(st.b.props.level) || 0, top = same(at(x, y + 1, z)) ? 16 : 16 * (8 - (level >= 8 ? 0 : level)) / 9
    const tint = (lava ? [255, 255, 255] : data.blocks.water?.t || [63, 118, 228]).map(linear)
    for (const dir of Object.keys(DIRS)) {
      const d = DIRS[dir], n = at(x + d[0], y + d[1], z + d[2])
      if (same(n) || (n && states[n].solid && dir !== 'up')) continue   // a solid block above still shows the surface below it
      const pts = corners(dir, [0, 0, 0], [16, top, 16]), l = light(DIRS[dir])
      quad(!lava, pts, [0, 0, 16, 16], 0, tex, [tint[0] * l, tint[1] * l, tint[2] * l], x, y, z)
    }
  }

  for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const id = s.data[(y * Z + z) * X + x]; if (!id) continue
    const st = states[id]
    if (st.wet || st.lava) fluid(x, y, z, st)
    if (st.fluid !== undefined || st.b.name === 'bubble_column') continue
    for (const ref of st.refs) {
      const m = data.models[ref.m]
      if ('b' in m) for (const [from, to, rot, f] of m.b) box(st, id, x, y, z, ref, from, to, rot, f)
      else if ('q' in m) {   // a chest, banner, head and so on, already turned the right way
        const key = ownPicture(st.b.name, s.tiles?.get((y * Z + z) * X + x))
        for (const q of m.q) {
          const pts = [0, 1, 2, 3].map(k => turn(ref, q.slice(2 + k * 5, 5 + k * 5))), uv = [0, 1, 2, 3].map(k => q.slice(5 + k * 5, 7 + k * 5))
          const own = key && (key.all || q[1]) ? (custom[key.key] ||= newPart()) : undefined   // a head's skin, or a banner's patterned cloth
          const l = light(normalOf(pts)), t = !own && q[1] && st.tint ? st.tint.map(linear) : [1, 1, 1]
          quad(st.glass, pts, uv, 0, q[0], [t[0] * l, t[1] * l, t[2] * l], x, y, z, own)
        }
      } else if (m.p >= 0) {
        const sp = SPECIAL.find(([re]) => re.test(st.b.name))
        if (sp) box(st, id, x, y, z, ref, sp[1], sp[2], 0, plain(m.p), undefined, sp[3])
      }
    }
  }

  // ---- Entities, each placed by a matrix from its own model space (block units, the entity at the origin) to the schematic's
  const missing: Record<string, number> = {}
  const miss = (id: string) => { missing[id] = (missing[id] || 0) + 1 }
  /** Draws a model's quads (block pixels) through matrix m, on the sheet or on a picture of its own, tinted. With size, uv becomes 0..1 of that texture size. */
  const drawModel = (q: number[][], m: M4, own?: Part, tint?: number[], size?: number[]) => {
    const t = tint ? tint.map(linear) : [1, 1, 1]
    for (const r of q) {
      const pts = [0, 1, 2, 3].map(i => apply(m, r.slice(2 + i * 5, 5 + i * 5).map(v => v / 16)).map(v => v * 16))
      const uv = [0, 1, 2, 3].map(i => { const [u, v] = r.slice(5 + i * 5, 7 + i * 5); return size ? [u / size[0], v / size[1]] : [u, v] }), l = light(normalOf(pts))
      quad(false, pts, uv, 0, r[0], [t[0] * l, t[1] * l, t[2] * l], 0, 0, 0, own)
    }
  }
  /** A flat picture (an item's icon, a painting) as one square through matrix m: corners (-0.5, -0.5)..(0.5, 0.5) facing +z, the picture w x h pixels. */
  const flat = (key: string, m: M4, w: number, h: number, tint?: number[], uv = [0, 0, w, h]) => {
    const own = custom[key] ||= newPart(), t = (tint || [255, 255, 255]).map(linear)
    const pts = [[-0.5, 0.5, 0], [0.5, 0.5, 0], [0.5, -0.5, 0], [-0.5, -0.5, 0]].map(p => apply(m, p).map(v => v * 16))
    const l = light(normalOf(pts))
    quad(false, pts, [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]], 0, 0, [t[0] * l, t[1] * l, t[2] * l], 0, 0, 0, own)
  }
  /** A block (falling sand, primed TNT, a block display) through matrix m, from its corner. */
  const carried = (b: Block, m: M4) => {
    const st = { b, refs: modelsFor(data, b), solid: false, glass: TRANSLUCENT.test(b.name), tint: data.blocks[b.name]?.t, fluid: undefined, wet: false, lava: false, covers: null }
    for (const ref of st.refs) {
      const md = data.models[ref.m]
      if ('b' in md) for (const [from, to, rot, f] of md.b) box(st, 0, 0, 0, 0, ref, from, to, rot, f, m)
      else if ('q' in md) drawModel(md.q.map(r => [r[0], r[1], ...[0, 1, 2, 3].flatMap(k => [...turn(ref, r.slice(2 + k * 5, 5 + k * 5)), ...r.slice(5 + k * 5, 7 + k * 5)])]), m)
    }
    return st.refs.length > 0
  }
  /** A mob or other modelled entity: its pieces through matrix m. */
  const drawPieces = (pieces: Piece[], m: M4, id: string) => {
    for (const [k, p] of pieces.entries()) {
      const md = data.entities?.[p.key]; if (!md) { if (k === 0) { miss(id); return } continue }   // a missing extra (a chest the model has no room for) is just left off
      const pic = p.pic || md.pic, own = pic ? (custom[pic + (p.clear ? '#clear' : '')] ||= newPart()) : undefined
      if (!own && p.key.startsWith('m:')) { miss(id); return }
      drawModel(md.q, p.at ? chain(m, p.at) : m, own, p.tint, own ? md.s : undefined)
    }
  }

  for (const e of s.entities || []) {
    if (Math.floor(e.y) >= Y || e.y < -1) continue   // above the layer cut
    const id = e.id, turnTo = RY(rad(-e.yaw))
    if (QUIET.has(id)) continue
    if (/item_frame$/.test(id)) {   // frames sit in their block, the item turned in its frame
      const F = FACING[e.facing ?? -1]; if (!F) { miss(id); continue }
      const f = FACING_NAME[e.facing!], bx = Math.floor(e.x + F[0] * 0.46875), by = Math.floor(e.y + F[1] * 0.46875), bz = Math.floor(e.z + F[2] * 0.46875)
      if (!e.hidden) { const md = data.entities?.[`${id}:${f}`]; if (md) drawModel(md.q, T(bx, by, bz)); else miss(id) }
      if (e.item) { const md = data.entities?.[`frame_item:${f}`]; if (md) drawModel(md.q.map(r => { const pts = spin([0, 1, 2, 3].map(i => r.slice(2 + i * 5, 5 + i * 5)), F, -(e.turn || 0) * Math.PI / 4); return [r[0], r[1], ...[0, 1, 2, 3].flatMap(i => [...pts[i], ...r.slice(5 + i * 5, 7 + i * 5)])] }), T(bx, by, bz), custom[`item:${e.item}`] ||= newPart()) }
      continue
    }
    if (id === 'item' || id === 'item_display') {   // a dropped item or an item display: the item's icon, flat
      if (!e.item) continue
      const m = id === 'item' ? chain(T(e.x, e.y + 0.35, e.z), turnTo, S(0.5)) : chain(T(e.x, e.y, e.z), turnTo, RX(rad(e.pitch || 0)), e.transform || S(1))
      flat(`item:${e.item}`, m, 64, 64); continue
    }
    if (id === 'experience_orb') { flat('tex:experience/experience_orb', chain(T(e.x, e.y + 0.25, e.z), turnTo, S(0.3)), 1, 1, [128, 255, 32], [0, 0, 0.25, 0.25]); continue }
    if (id === 'painting') {
      const size = data.paintings?.[String(e.variant || 'kebab')], F = FACING[e.facing ?? 3]
      if (!size || !F || !F[0] && !F[2]) { miss(id); continue }
      const [w, h] = size, face = Math.atan2(F[0], F[2])   // turn +z to face the way it faces
      flat(`paint:${e.variant}`, chain(T(e.x + F[0] / 32, e.y, e.z + F[2] / 32), RY(face), S(w, h, 1)), w * 16, h * 16); continue
    }
    if (id === 'falling_block' || id === 'tnt' || id === 'block_display') {
      const b = e.block || (id === 'tnt' ? { name: 'tnt', props: {} } : null)
      const m = id === 'block_display' ? chain(T(e.x, e.y, e.z), turnTo, RX(rad(e.pitch || 0)), e.transform || S(1)) : T(e.x - 0.5, e.y, e.z - 0.5)
      if (!b || b.name === 'air' || !carried(b, m)) miss(id)
      continue
    }
    const look = entityLook(e)
    if (!look) { miss(id); continue }
    drawPieces(look.pieces, chain(T(e.x, e.y, e.z), turnTo, S(look.scale ?? 1), look.shift ? T(look.shift[0], look.shift[1], look.shift[2]) : S(1)), id)
  }
  // The mob turning slowly in a spawner (SpawnerRenderer), small enough to fit inside
  for (const [i, t] of s.tiles || []) {
    if (!t.spawn) continue
    const x = i % X, z = Math.floor(i / X) % Z, y = Math.floor(i / (X * Z)); if (y >= Y) continue
    const look = entityLook({ id: t.spawn, x: 0, y: 0, z: 0, yaw: 0 }); if (!look) continue
    const [w, h] = SIZE[t.spawn] || [0.6, 1.8], k = 0.53125 / Math.max(1, w, h)
    drawPieces(look.pieces, chain(T(x + 0.5, y + 0.4, z + 0.5), T(0, -0.2, 0), RX(rad(-30)), S(k * (look.scale ?? 1)), look.shift ? T(look.shift[0], look.shift[1], look.shift[2]) : S(1)), t.spawn)
  }
  const pack = (g: Part): MeshPart => ({ pos: new Float32Array(g.p), uv: new Float32Array(g.u), col: new Float32Array(g.c), idx: new Uint32Array(g.i) })
  return { solid: pack(parts.solid), glass: pack(parts.glass), custom: Object.fromEntries(Object.entries(custom).map(([k, g]) => [k, pack(g)])), faces, missing }
}

const FACING = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]], FACING_NAME = ['down', 'up', 'north', 'south', 'west', 'east']
const COLOURS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
// DyeColor's texture colours: sheep wool and tropical fish are painted with them
const DYE = [0xF9FFFE, 0xF9801D, 0xC74EBD, 0x3AB3DA, 0xFED83D, 0x80C71F, 0xF38BAA, 0x474F52, 0x9D9D97, 0x169C9C, 0x8932B8, 0x3C44AA, 0x835432, 0x5E7C16, 0xB02E26, 0x1D1D21].map(c => [c >> 16, (c >> 8) & 255, c & 255])
// Entities with nothing to see (or that the game doesn't save visibly): skipped without a note
const QUIET = new Set(['marker', 'interaction', 'area_effect_cloud', 'lightning_bolt', 'fishing_bobber', 'text_display', 'ominous_item_spawner', 'player'])
// Hitbox sizes [width, height] of mobs often found in spawners, which shrink to fit
const SIZE: Record<string, [number, number]> = {
  zombie: [0.6, 1.95], husk: [0.6, 1.95], drowned: [0.6, 1.95], zombie_villager: [0.6, 1.95], skeleton: [0.6, 1.99], stray: [0.6, 1.99], bogged: [0.6, 1.99], wither_skeleton: [0.7, 2.4],
  spider: [1.4, 0.9], cave_spider: [0.7, 0.5], blaze: [0.6, 1.8], silverfish: [0.4, 0.3], magma_cube: [0.52, 0.52], slime: [0.52, 0.52], creeper: [0.6, 1.7], breeze: [0.6, 1.77],
  pig: [0.9, 0.9], cow: [0.9, 1.4], chicken: [0.4, 0.7], sheep: [0.9, 1.3], enderman: [0.6, 2.9], iron_golem: [1.4, 2.7], guardian: [0.85, 0.85], piglin: [0.6, 1.95], zombified_piglin: [0.6, 1.95],
}
/** Turns points (block pixels) about their middle, around axis n, by angle a: an item turned in its frame. */
function spin(pts: number[][], n: number[], a: number) {
  const m = [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length), c = Math.cos(a), s = Math.sin(a)
  return pts.map(p => {
    const v = [p[0] - m[0], p[1] - m[1], p[2] - m[2]], d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2], x = [n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0]]
    return [0, 1, 2].map(i => m[i] + v[i] * c + x[i] * s + n[i] * d * (1 - c))
  })
}

type Piece = { key: string; pic?: string; tint?: number[]; clear?: boolean; at?: M4 }
const tex = (key: string, path: string, more: Partial<Piece> = {}): Piece => ({ key: 'm:' + key, pic: 'tex:' + path, ...more })
// Mobs with one look: model layer and texture, then the baby's if it has its own
const PLAIN: Record<string, [string, string, string?, string?]> = {
  allay: ['allay', 'allay/allay'], armadillo: ['armadillo', 'armadillo/armadillo', 'armadillo_baby', 'armadillo/armadillo_baby'], bat: ['bat', 'bat/bat'],
  bee: ['bee', 'bee/bee', 'bee_baby', 'bee/bee_baby'], blaze: ['blaze', 'blaze/blaze'], breeze: ['breeze', 'breeze/breeze'],
  camel: ['camel', 'camel/camel', 'camel_baby', 'camel/camel_baby'], camel_husk: ['camel', 'camel/camel_husk'], cave_spider: ['cave_spider', 'spider/cave_spider'],
  cod: ['cod', 'fish/cod'], creaking: ['creaking', 'creaking/creaking'], creeper: ['creeper', 'creeper/creeper'],
  dolphin: ['dolphin', 'dolphin/dolphin', 'dolphin_baby', 'dolphin/dolphin_baby'], donkey: ['donkey', 'horse/donkey', 'donkey_baby', 'horse/donkey_baby'],
  elder_guardian: ['elder_guardian', 'guardian/guardian_elder'], enderman: ['enderman', 'enderman/enderman'], endermite: ['endermite', 'endermite/endermite'],
  evoker: ['evoker', 'illager/evoker'], ghast: ['ghast', 'ghast/ghast'], giant: ['giant', 'zombie/zombie'],
  glow_squid: ['glow_squid', 'squid/glow_squid', 'glow_squid_baby', 'squid/glow_squid_baby'], goat: ['goat', 'goat/goat', 'goat_baby', 'goat/goat_baby'],
  guardian: ['guardian', 'guardian/guardian'], happy_ghast: ['happy_ghast', 'ghast/happy_ghast', 'happy_ghast_baby', 'ghast/happy_ghast_baby'],
  hoglin: ['hoglin', 'hoglin/hoglin', 'hoglin_baby', 'hoglin/hoglin_baby'], husk: ['husk', 'zombie/husk', 'husk_baby', 'zombie/husk_baby'],
  illusioner: ['illusioner', 'illager/illusioner'], mule: ['mule', 'horse/mule', 'mule_baby', 'horse/mule_baby'],
  nautilus: ['nautilus', 'nautilus/nautilus', 'nautilus_baby', 'nautilus/nautilus_baby'], zombie_nautilus: ['zombie_nautilus', 'nautilus/zombie_nautilus'],
  ocelot: ['ocelot', 'cat/ocelot', 'ocelot_baby', 'cat/ocelot_baby'], parched: ['parched', 'skeleton/parched'],
  piglin: ['piglin', 'piglin/piglin', 'piglin_baby', 'piglin/piglin_baby'], piglin_brute: ['piglin_brute', 'piglin/piglin_brute'], pillager: ['pillager', 'illager/pillager'],
  polar_bear: ['polar_bear', 'bear/polarbear', 'polar_bear_baby', 'bear/polarbear_baby'], ravager: ['ravager', 'illager/ravager'], silverfish: ['silverfish', 'silverfish/silverfish'],
  skeleton: ['skeleton', 'skeleton/skeleton'], skeleton_horse: ['skeleton_horse', 'horse/horse_skeleton', 'skeleton_horse_baby', 'horse/horse_skeleton_baby'],
  sniffer: ['sniffer', 'sniffer/sniffer', 'sniffer_baby', 'sniffer/snifflet'], spider: ['spider', 'spider/spider'],
  squid: ['squid', 'squid/squid', 'squid_baby', 'squid/squid_baby'], strider: ['strider', 'strider/strider', 'strider_baby', 'strider/strider_baby'],
  tadpole: ['tadpole', 'tadpole/tadpole'], turtle: ['turtle', 'turtle/turtle', 'turtle_baby', 'turtle/turtle_baby'], vex: ['vex', 'illager/vex'],
  vindicator: ['vindicator', 'illager/vindicator'], wandering_trader: ['wandering_trader', 'wandering_trader/wandering_trader'], warden: ['warden', 'warden/warden'],
  witch: ['witch', 'witch/witch'], wither: ['wither', 'wither/wither'], wither_skeleton: ['wither_skeleton', 'skeleton/wither_skeleton'],
  zoglin: ['zoglin', 'hoglin/zoglin', 'zoglin_baby', 'hoglin/zoglin_baby'], zombie: ['zombie', 'zombie/zombie', 'zombie_baby', 'zombie/zombie_baby'],
  zombie_horse: ['zombie_horse', 'horse/horse_zombie', 'zombie_horse_baby', 'horse/horse_zombie_baby'],
  zombified_piglin: ['zombified_piglin', 'piglin/zombified_piglin', 'zombified_piglin_baby', 'piglin/zombified_piglin_baby'],
  leash_knot: ['leash_knot', 'lead_knot/lead_knot'], end_crystal: ['end_crystal', 'end_crystal/end_crystal'],
}
// Skeletons and drowned wear a second, slightly bigger layer
const OUTER: Record<string, [string, string, string?, string?]> = {
  stray: ['stray_outer_layer', 'skeleton/stray_overlay'], bogged: ['bogged_outer_layer', 'skeleton/bogged_overlay'],
  drowned: ['drowned_outer_layer', 'zombie/drowned_outer_layer', 'drowned_baby_outer_layer', 'zombie/drowned_outer_layer_baby'],
}
const named = (v: Entity['variant'], list: string[], fallback = list[0]) => (typeof v === 'number' ? list[v] ?? fallback : typeof v === 'string' && /^[a-z0-9_]+$/.test(v) ? v : fallback)
const MINECARTS = new Set(['minecart', 'chest_minecart', 'hopper_minecart', 'furnace_minecart', 'tnt_minecart'])

/** How an entity looks: its model pieces (with their pictures and tints) and any size or offset its renderer adds, or null for one the viewer can't draw. */
function entityLook(e: Entity): { pieces: Piece[]; scale?: number; shift?: number[] } | null {
  const id = e.id, b = e.baby ? '_baby' : ''
  const plainOf = (row: [string, string, string?, string?]) => (e.baby && row[2] ? tex(row[2], row[3]!) : tex(row[0], row[1]))
  if (PLAIN[id]) {
    const pieces = [plainOf(PLAIN[id])]
    if (e.chest) pieces.push({ ...pieces[0], key: pieces[0].key + ':chests' })   // a donkey or mule with a chest on
    if (OUTER[id]) pieces.push(plainOf(OUTER[id]))
    return { pieces }
  }
  if (OUTER[id]) return { pieces: [tex(id, id === 'drowned' ? 'zombie/drowned' : 'skeleton/' + id), plainOf(OUTER[id])] }
  switch (id) {
    case 'cow': { const v = named(e.variant, ['temperate']), l = v === 'cold' ? 'cold_cow' : v === 'warm' ? 'warm_cow' : 'cow'; return { pieces: [tex(l + b, `cow/cow_${v}${b}`)] } }
    case 'pig': { const v = named(e.variant, ['temperate']); return { pieces: [tex(e.baby ? 'pig_baby' : v === 'cold' ? 'cold_pig' : 'pig', `pig/pig_${v}${b}`)] } }
    case 'chicken': { const v = named(e.variant, ['temperate']); return { pieces: [tex(e.baby ? 'chicken_baby' : v === 'cold' ? 'cold_chicken' : 'chicken', `chicken/chicken_${v}${b}`)] } }
    case 'mooshroom': return { pieces: [tex('mooshroom' + b, `cow/mooshroom_${e.wood === 'brown' ? 'brown' : 'red'}${b}`)] }
    case 'sheep': return { pieces: [tex('sheep' + b, `sheep/sheep${b}`), ...(e.sheared ? [] : [tex(e.baby ? 'sheep_baby_wool' : 'sheep_wool', `sheep/sheep_wool${b}`, { tint: DYE[e.colour ?? 0] || DYE[0] })])] }
    case 'cat': return { pieces: [tex('cat' + b, `cat/cat_${named(e.variant, ['tabby'])}${b}`)] }
    case 'wolf': { const v = named(e.variant, ['pale']); return { pieces: [tex('wolf' + b, `wolf/${v === 'pale' ? 'wolf' : 'wolf_' + v}${e.tame ? '_tame' : ''}${b}`)] } }
    case 'frog': return { pieces: [tex('frog', `frog/frog_${named(e.variant, ['temperate'])}`)] }
    case 'axolotl': return { pieces: [tex('axolotl' + b, `axolotl/axolotl_${named(e.variant, ['lucy', 'wild', 'gold', 'cyan', 'blue'])}${b}`)] }
    case 'rabbit': {
      const v = e.variant === 99 ? 'caerbannog' : named(e.variant, ['brown', 'white', 'black', 'white_splotched', 'gold', 'salt'])
      return { pieces: [tex('rabbit' + b, `rabbit/rabbit_${v === 'evil' ? 'caerbannog' : v}${b}`)] }
    }
    case 'horse': {
      const v = typeof e.variant === 'number' ? e.variant : 0, coat = ['white', 'creamy', 'chestnut', 'brown', 'black', 'gray', 'darkbrown'][v & 255] || 'white'
      const marks = [null, 'white', 'whitefield', 'whitedots', 'blackdots'][(v >> 8) & 255]
      return { pieces: [tex('horse' + b, `horse/horse_${coat}${b}`), ...(marks ? [tex('horse' + b, `horse/horse_markings_${marks}${b}`)] : [])] }
    }
    case 'llama': case 'trader_llama': { const t = `llama/llama_${named(e.variant, ['creamy', 'white', 'brown', 'gray'])}${b}`; return { pieces: [tex(id + b, t), ...(e.chest ? [tex(id + b + ':chests', t)] : [])] } }
    case 'parrot': return { pieces: [tex('parrot', `parrot/parrot_${named(e.variant, ['red_blue', 'blue', 'green', 'yellow_blue', 'grey'])}`)] }
    case 'fox': return { pieces: [tex('fox' + b, `fox/fox${e.wood === 'snow' ? '_snow' : ''}${b}`)] }
    case 'panda': { const g = named(e.variant, ['normal']); return { pieces: [tex('panda' + b, e.baby ? `panda/${g === 'normal' ? 'panda' : g + '_panda'}_baby` : `panda/panda${g === 'normal' ? '' : '_' + g}`)] } }
    case 'salmon': { const v = named(e.variant, ['medium']); return { pieces: [tex(v === 'small' ? 'salmon_small' : v === 'large' ? 'salmon_large' : 'salmon', 'fish/salmon')] } }
    case 'pufferfish': return { pieces: [tex(['pufferfish_small', 'pufferfish_medium', 'pufferfish_big'][typeof e.variant === 'number' ? e.variant : 0] || 'pufferfish_small', 'fish/pufferfish')] }
    case 'tropical_fish': {
      const v = typeof e.variant === 'number' ? e.variant : 0, big = (v & 255) === 1, kind = big ? 'b' : 'a', l = big ? 'tropical_fish_large' : 'tropical_fish_small'
      return { pieces: [tex(l, `fish/tropical_${kind}`, { tint: DYE[(v >> 16) & 255] || DYE[0] }), tex(l + '_pattern', `fish/tropical_${kind}_pattern_${(((v >> 8) & 255) % 6) + 1}`, { tint: DYE[(v >>> 24) & 255] || DYE[0] })] }
    }
    case 'slime': case 'magma_cube': {
      const size = (e.size ?? 0) + 1, t = id === 'slime' ? 'slime/slime' : 'slime/magmacube'
      return { pieces: [tex(id, t), ...(id === 'slime' ? [tex('slime_outer', t, { clear: true })] : [])], scale: 0.999 * size }
    }
    case 'phantom': { const f = 1 + 0.15 * (e.size ?? 0); return { pieces: [tex('phantom', 'phantom/phantom')], scale: f, shift: [0, -1.3125, -0.1875] } }
    case 'copper_golem': { const w = named(e.variant, ['unaffected']); return { pieces: [tex('copper_golem', `copper_golem/copper_golem${w === 'unaffected' ? '' : '_' + w}`)] } }
    case 'villager': { const [t, p] = e.villager || ['plains', 'none']; return { pieces: [{ key: 'm:villager' + b, pic: `villager:${t}:${e.baby ? 'baby' : p}` }] } }
    case 'zombie_villager': { const [t, p] = e.villager || ['plains', 'none']; return { pieces: [{ key: 'm:zombie_villager' + b, pic: `zombie_villager:${t}:${e.baby ? 'baby' : p}` }] } }
    case 'iron_golem': return { pieces: [{ key: id }] }
    case 'snow_golem': return { pieces: [{ key: e.pumpkin === false ? 'snow_golem_sheared' : 'snow_golem' }] }
    case 'shulker': return { pieces: [{ key: e.colour !== undefined && COLOURS[e.colour] ? `shulker_${COLOURS[e.colour]}` : 'shulker' }] }
    case 'armor_stand': return { pieces: e.hidden ? [] : [{ key: id }, ...(e.arms ? [{ key: 'armor_stand_arms' }] : []), ...(e.plate !== false ? [{ key: 'armor_stand_plate' }] : [])], scale: e.small ? 0.5 : 1 }
  }
  if (MINECARTS.has(id)) return { pieces: [{ key: id }] }
  if (/^(spawner|command_block)_minecart$/.test(id)) return { pieces: [{ key: 'minecart' }] }
  if (id === 'boat' || id === 'chest_boat') { const w = e.wood || 'oak'; return { pieces: [{ key: w === 'bamboo' ? (id === 'boat' ? 'bamboo_raft' : 'bamboo_chest_raft') : `${w}_${id}` }] } }
  if (/_(chest_)?(boat|raft)$/.test(id)) return { pieces: [{ key: id }] }
  return null
}

/** Which blocks get their own picture: player heads with a skin (the whole head) and banners with patterns (the cloth). */
function ownPicture(name: string, tile?: Tile): { key: string; all: boolean } | null {
  if (!tile) return null
  if (tile.skin && /^player(_wall)?_head$/.test(name)) return { key: 'skin:' + tile.skin, all: true }
  const colour = name.match(/^(.+?)_(wall_)?banner$/)?.[1]
  if (tile.patterns && colour) return { key: `banner:${colour}:${tile.patterns.map(p => p.join('/')).join(',')}`, all: false }
  return null
}

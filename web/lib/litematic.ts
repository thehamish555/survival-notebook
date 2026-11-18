// Reads a Litematica .litematic file in the browser into one block grid, for the 3D viewer.
// The file is gzip NBT. Each region has a position, a size (either sign), a block palette and the palette indices packed into longs
// (a value can cross from one long into the next). Index order inside a region: x fastest, then z, then y.

export type Block = { name: string; props: Record<string, string> }
/** What a block entity adds to how it looks: a player head's skin (a texture hash, a UUID or a name), a banner's pattern layers, or the mob in a spawner. */
export type Tile = { skin?: string; patterns?: [string, string][]; spawn?: string; sign?: { front?: SignText; back?: SignText } }
/** One side of a sign: its four lines as plain text, the dye colour and whether it glows. */
export type SignText = { lines: string[]; colour: string; glow: boolean }
/** Something worn or held: the item, and a leather dye colour if it has one. */
export type Worn = { id: string; dye?: number }
/** A mob, armor stand, boat, minecart or item frame: where it is (in blocks, from the schematic's corner), which way it faces, and the few details that change its look. */
export type Entity = {
  id: string; x: number; y: number; z: number; yaw: number; pitch?: number
  wood?: string; arms?: boolean; plate?: boolean; small?: boolean; hidden?: boolean; pumpkin?: boolean; colour?: number
  villager?: [string, string]; facing?: number; item?: string; turn?: number
  /** Which kind of its mob it is: a name ("warm", "tabby") or a number (horses, axolotls, tropical fish), as the file has it */
  variant?: string | number; baby?: boolean; size?: number; sheared?: boolean; tame?: boolean; chest?: boolean
  /** A falling block, primed TNT or block display's block, and a display's transformation (4x4, row by row) */
  block?: Block; transform?: number[]
  /** Held in the main and off hand, and worn (head, chest, legs, feet) */
  hands?: (string | undefined)[]; armor?: Partial<Record<'head' | 'chest' | 'legs' | 'feet', Worn>>
}
export type Schematic = { X: number; Y: number; Z: number; palette: Block[]; data: Uint16Array; name: string; count: number; tiles?: Map<number, Tile>; entities?: Entity[] }
const MAX_VOLUME = 8_000_000

function readNbt(buf: Uint8Array): any {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), td = new TextDecoder()
  let o = 0
  const str = () => { const n = dv.getUint16(o); o += 2; const s = td.decode(buf.subarray(o, o + n)); o += n; return s }
  const payload = (t: number, depth: number): any => {
    if (depth > 64) throw new Error('NBT nested too deep')
    switch (t) {
      case 1: return dv.getInt8(o++)
      case 2: { const v = dv.getInt16(o); o += 2; return v }
      case 3: { const v = dv.getInt32(o); o += 4; return v }
      case 4: { const hi = dv.getInt32(o), lo = dv.getUint32(o + 4); o += 8; return hi * 4294967296 + lo }
      case 5: { const v = dv.getFloat32(o); o += 4; return v }
      case 6: { const v = dv.getFloat64(o); o += 8; return v }
      case 7: { const n = dv.getInt32(o); o += 4; const v = buf.subarray(o, o + n); o += n; return v }
      case 8: return str()
      case 9: { const et = dv.getUint8(o++), n = dv.getInt32(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(payload(et, depth + 1)); return a }
      case 10: { const m: Record<string, any> = {}; for (;;) { const ct = dv.getUint8(o++); if (ct === 0) return m; const k = str(); m[k] = payload(ct, depth + 1) } }
      case 11: { const n = dv.getInt32(o); o += 4; const a = new Int32Array(n); for (let i = 0; i < n; i++) { a[i] = dv.getInt32(o); o += 4 } return a }
      case 12: {   // longs as [lo, hi] word pairs, so bit 0 of the stream is bit 0 of word 0
        const n = dv.getInt32(o); o += 4
        const w = new Uint32Array(n * 2)
        for (let i = 0; i < n; i++) { w[i * 2 + 1] = dv.getUint32(o); w[i * 2] = dv.getUint32(o + 4); o += 8 }
        return w
      }
      default: throw new Error('Unknown NBT tag ' + t)
    }
  }
  if (dv.getUint8(o++) !== 10) throw new Error('Not an NBT file')
  str()
  return payload(10, 0)
}

async function gunzip(file: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([file]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const AIR = new Set(['air', 'cave_air', 'void_air', 'structure_void'])
const COLOURS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
// Banner patterns saved before 1.20.5 use short codes
const OLD_PATTERNS: Record<string, string> = {
  b: 'base', bl: 'square_bottom_left', br: 'square_bottom_right', tl: 'square_top_left', tr: 'square_top_right', bs: 'stripe_bottom', ts: 'stripe_top', ls: 'stripe_left', rs: 'stripe_right',
  cs: 'stripe_center', ms: 'stripe_middle', drs: 'stripe_downright', dls: 'stripe_downleft', ss: 'small_stripes', cr: 'cross', sc: 'straight_cross', bt: 'triangle_bottom', tt: 'triangle_top',
  bts: 'triangles_bottom', tts: 'triangles_top', ld: 'diagonal_left', rd: 'diagonal_up_right', lud: 'diagonal_up_left', rud: 'diagonal_right', mc: 'circle', mr: 'rhombus', vh: 'half_vertical',
  hh: 'half_horizontal', vhr: 'half_vertical_right', hhb: 'half_horizontal_bottom', bo: 'border', cbo: 'curly_border', gra: 'gradient', gru: 'gradient_up', bri: 'bricks', glb: 'globe',
  cre: 'creeper', sku: 'skull', flo: 'flower', moj: 'mojang', pig: 'piglin',
}
const hex = (a: any) => (a instanceof Int32Array && a.length === 4 ? [...a].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('') : '')
/** A head's skin: the texture's hash when the file has it, otherwise the owner's UUID or name for the server to look up. */
function skinOf(t: any): string | undefined {
  const prof = t.profile ?? t.SkullOwner
  if (typeof prof === 'string') return /^[A-Za-z0-9_]{1,16}$/.test(prof) ? prof : undefined
  if (!prof || typeof prof !== 'object') return undefined
  const props = Array.isArray(prof.properties) ? prof.properties : prof.Properties?.textures ?? []
  const value = props.find?.((p: any) => (p.name ?? 'textures') === 'textures')?.value ?? props[0]?.Value
  if (typeof value === 'string') {
    try { const url = JSON.parse(atob(value))?.textures?.SKIN?.url; const h = typeof url === 'string' && url.match(/\/texture\/([0-9a-f]{40,64})$/)?.[1]; if (h) return h } catch { }
  }
  const id = hex(prof.id ?? prof.Id); if (id) return id
  const name = prof.name ?? prof.Name
  return typeof name === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(name) ? name : undefined
}
const bare = (v: any) => (typeof v === 'string' ? v.replace(/^minecraft:/, '') : undefined)
const flag = (v: any) => (v === undefined ? undefined : !!v)
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const blockOf = (b: any): Block | undefined => (typeof b?.Name === 'string' ? { name: bare(b.Name)!, props: b.Properties && typeof b.Properties === 'object' ? b.Properties : {} } : undefined)
const PAINTING_FACING = [3, 4, 2, 5]   // a painting's 2D facing (south, west, north, east) as the 3D order item frames use

/** A display entity's transformation as a 4x4 matrix (row by row): either saved as one, or as translation, left rotation, scale and right rotation. */
function transformOf(t: any): number[] | undefined {
  if (!t) return undefined
  if ((Array.isArray(t) || t instanceof Float32Array) && t.length === 16) return Array.from(t as ArrayLike<number>, Number)
  if (typeof t !== 'object') return undefined
  const v3 = (a: any, d: number) => (Array.isArray(a) && a.length === 3 ? a.map(Number) : [d, d, d])
  const quat = (r: any): number[] => {
    if (Array.isArray(r) && r.length === 4) return r.map(Number)
    if (r && Array.isArray(r.axis) && r.axis.length === 3) { const [x, y, z] = r.axis.map(Number), l = Math.hypot(x, y, z) || 1, h = Number(r.angle || 0) / 2, s = Math.sin(h); return [x / l * s, y / l * s, z / l * s, Math.cos(h)] }
    return [0, 0, 0, 1]
  }
  const rot = ([x, y, z, w]: number[]) => [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0, 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0, 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1]
  const mul = (a: number[], b: number[]) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c]; return o }
  const [tx, ty, tz] = v3(t.translation, 0), [sx, sy, sz] = v3(t.scale, 1)
  const m = [mul(mul([1, 0, 0, tx, 0, 1, 0, ty, 0, 0, 1, tz, 0, 0, 0, 1], rot(quat(t.left_rotation))), [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]), rot(quat(t.right_rotation))].reduce(mul)
  return m.every(Number.isFinite) ? m : undefined
}

// How high riders sit above their vehicle's position (roughly: boats and rafts, minecarts)
const seat = (vehicle: string) => (/boat|raft/.test(vehicle) ? 0.1875 : /minecart/.test(vehicle) ? 0.0625 : 0.75)
/** An entity and anything riding it (a villager in a boat or minecart), with positions from the schematic's corner. Litematica moves only the
 *  vehicle's position into the schematic, so riders are put on their vehicle instead of where their own (world) position says. */
function entitiesOf(e: any, ox: number, oy: number, oz: number, out: Entity[], depth = 0, vehicle?: Entity) {
  if (depth > 8 || out.length >= 5000) return
  const id = bare(e?.id), pos = e?.Pos
  let me: Entity | undefined
  if (id && (vehicle || (Array.isArray(pos) && pos.length >= 3 && pos.every((n: any) => Number.isFinite(n))))) {
    const vd = e.VillagerData ?? e.villager_data, isPainting = id === 'painting'
    const [x, y, z] = vehicle ? [vehicle.x, vehicle.y + seat(vehicle.id), vehicle.z] : [ox + pos[0], oy + pos[1], oz + pos[2]]
    out.push(me = {
      id, x, y, z, yaw: Number(e.Rotation?.[0]) || 0, pitch: Number(e.Rotation?.[1]) || 0,
      wood: bare(e.Type), arms: flag(e.ShowArms), plate: e.NoBasePlate === undefined ? undefined : !e.NoBasePlate, small: flag(e.Small), hidden: flag(e.Invisible),
      pumpkin: flag(e.Pumpkin), colour: num(e.Color),
      villager: vd ? [bare(vd.type) || 'plains', bare(vd.profession) || 'none'] : undefined,
      facing: isPainting ? PAINTING_FACING[num(e.facing) ?? num(e.Facing) ?? 0] : num(e.Facing),
      item: bare(e.Item?.id ?? e.item?.id), turn: num(e.ItemRotation),
      variant: isPainting ? bare(e.variant ?? e.Motive ?? e.motive) : bare(e.variant) ?? num(e.Variant) ?? num(e.RabbitType) ?? bare(e.MainGene) ?? bare(e.type) ?? num(e.PuffState) ?? bare(e.weather_state),
      baby: (num(e.Age) ?? 0) < 0 || !!e.IsBaby, size: num(e.Size), sheared: flag(e.Sheared), tame: !!(e.Owner ?? e.owner), chest: flag(e.ChestedHorse),
      block: blockOf(e.BlockState ?? e.block_state), transform: transformOf(e.transformation), ...gearOf(e),
    })
  }
  if (me) for (const p of Array.isArray(e?.Passengers) ? e.Passengers : []) entitiesOf(p, ox, oy, oz, out, depth + 1, me)
}

// Trial spawners name a config instead (trial_chamber/melee/zombie), until they've spawned something
const TRIAL: Record<string, string> = { poison_skeleton: 'bogged', baby_zombie: 'zombie' }
/** The mob a spawner or trial spawner shows: its next spawn, or for a trial spawner the mob its config spawns. */
function spawnOf(t: any): string | undefined {
  const direct = bare((t.SpawnData ?? t.spawn_data)?.entity?.id)
  if (direct) return direct
  const cfg = t.normal_config ?? t.ominous_config
  if (typeof cfg === 'string') { const last = bare(cfg)?.split('/').pop(); return last ? TRIAL[last] || last : undefined }
  const first = Array.isArray(cfg?.spawn_potentials) ? cfg.spawn_potentials[0] : undefined
  return bare(first?.data?.entity?.id)
}

/** A text component as plain text: a JSON string, an object with text and extra parts, or a list of them. */
function plainText(v: any, depth = 0): string {
  if (depth > 8 || v == null) return ''
  if (typeof v === 'string') {
    const t = v.trim()
    if (/^[[{"]/.test(t)) { try { const j = JSON.parse(t); if (typeof j !== 'string' || j !== v) return plainText(j, depth + 1) } catch { /* plain text that starts with a bracket */ } }
    return v
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(x => plainText(x, depth + 1)).join('')
  if (typeof v === 'object') return (typeof v.text === 'string' ? v.text : typeof v.translate === 'string' ? v.translate : '') + (Array.isArray(v.extra) ? v.extra.map((x: any) => plainText(x, depth + 1)).join('') : '')
  return ''
}
/** A sign's text, front and back: saved as front_text and back_text since 1.20, as Text1 to Text4 before. Signs with nothing written are skipped. */
function signOf(t: any): Tile['sign'] {
  const side = (o: any): SignText | undefined => {
    if (!o || typeof o !== 'object') return undefined
    const lines = (Array.isArray(o.messages) ? o.messages : []).slice(0, 4).map((m: any) => plainText(m).slice(0, 80))
    return lines.some((l: string) => l.trim()) ? { lines, colour: bare(o.color) || 'black', glow: !!o.has_glowing_text } : undefined
  }
  const old = typeof t.Text1 === 'string' ? side({ messages: [t.Text1, t.Text2, t.Text3, t.Text4], color: t.Color, has_glowing_text: t.GlowingText }) : undefined
  const front = side(t.front_text) || old, back = side(t.back_text)
  return front || back ? { front, back } : undefined
}
/** What a mob or armor stand holds and wears: the equipment map since 1.21.5, HandItems and ArmorItems before. */
function gearOf(e: any): Pick<Entity, 'hands' | 'armor'> {
  const worn = (s: any): Worn | undefined => {
    const id = bare(s?.id); if (!id || id === 'air') return undefined
    const c = s.components?.['minecraft:dyed_color'] ?? s.components?.dyed_color ?? s.tag?.display?.color
    const dye = typeof c === 'number' ? c : typeof c?.rgb === 'number' ? c.rgb : undefined
    return dye === undefined ? { id } : { id, dye }
  }
  const eq = e.equipment && typeof e.equipment === 'object' ? e.equipment : {}, hi = Array.isArray(e.HandItems) ? e.HandItems : [], ai = Array.isArray(e.ArmorItems) ? e.ArmorItems : []
  const hands = [worn(eq.mainhand ?? hi[0])?.id, worn(eq.offhand ?? hi[1])?.id]
  const armor = { head: worn(eq.head ?? ai[3]), chest: worn(eq.chest ?? ai[2]), legs: worn(eq.legs ?? ai[1]), feet: worn(eq.feet ?? ai[0]) }
  for (const k of Object.keys(armor) as (keyof typeof armor)[]) if (!armor[k]) delete armor[k]
  return { ...(hands.some(Boolean) ? { hands } : {}), ...(Object.keys(armor).length ? { armor } : {}) }
}

function patternsOf(t: any): [string, string][] | undefined {
  const list = Array.isArray(t.patterns) ? t.patterns : Array.isArray(t.Patterns) ? t.Patterns : null
  if (!list) return undefined
  const out = list.map((p: any): [string, string] | null => {
    const pat = typeof p.pattern === 'string' ? p.pattern : p.pattern?.asset_id ?? OLD_PATTERNS[p.Pattern]
    const col = typeof p.color === 'string' ? p.color : COLOURS[p.Color]
    return typeof pat === 'string' && col ? [pat.replace(/^minecraft:/, '').replace(/^.*\//, ''), col] : null
  }).filter(Boolean).slice(0, 16) as [string, string][]
  return out.length ? out : undefined
}

export async function readLitematic(file: ArrayBuffer): Promise<Schematic> {
  const root = readNbt(await gunzip(file))
  const regions = Object.values<any>(root?.Regions || {})
  if (!regions.length) throw new Error('No regions in this file')
  // The whole thing's bounds, from every region's corners
  const box = regions.map(r => {
    const p = r.Position || { x: 0, y: 0, z: 0 }, s = r.Size || { x: 0, y: 0, z: 0 }
    const lo = (pos: number, size: number) => (size < 0 ? pos + size + 1 : pos)
    return { r, x: lo(p.x, s.x), y: lo(p.y, s.y), z: lo(p.z, s.z), sx: Math.abs(s.x), sy: Math.abs(s.y), sz: Math.abs(s.z) }
  }).filter(b => b.sx && b.sy && b.sz)
  const minX = Math.min(...box.map(b => b.x)), minY = Math.min(...box.map(b => b.y)), minZ = Math.min(...box.map(b => b.z))
  const X = Math.max(...box.map(b => b.x + b.sx)) - minX, Y = Math.max(...box.map(b => b.y + b.sy)) - minY, Z = Math.max(...box.map(b => b.z + b.sz)) - minZ
  if (X * Y * Z > MAX_VOLUME) throw new Error('This schematic is too big to show in 3D')
  const data = new Uint16Array(X * Y * Z), palette: Block[] = [{ name: 'air', props: {} }], keyIdx = new Map<string, number>([['air', 0]])
  let count = 0
  const tiles = new Map<number, Tile>(), entities: Entity[] = []
  for (const b of box) {
    for (const e of Array.isArray(b.r.Entities) ? b.r.Entities : []) entitiesOf(e, b.x - minX, b.y - minY, b.z - minZ, entities)   // positions are from the region's corner, like block entities
    for (const t of Array.isArray(b.r.TileEntities) ? b.r.TileEntities : []) {   // positions are from the region's corner
      const x = Number(t?.x), y = Number(t?.y), z = Number(t?.z)
      if (![x, y, z].every(Number.isInteger) || x < 0 || y < 0 || z < 0 || x >= b.sx || y >= b.sy || z >= b.sz) continue
      const tile: Tile = { skin: skinOf(t), patterns: patternsOf(t), spawn: spawnOf(t), sign: signOf(t) }
      if (tile.skin || tile.patterns || tile.spawn || tile.sign) tiles.set(((b.y - minY + y) * Z + (b.z - minZ + z)) * X + (b.x - minX + x), tile)
    }
    const pal: any[] = Array.isArray(b.r.BlockStatePalette) ? b.r.BlockStatePalette : [], words: Uint32Array = b.r.BlockStates
    if (!pal.length || !(words instanceof Uint32Array)) continue
    const map = pal.map(p => {   // this region's palette -> the merged one
      const name = String(p?.Name || 'air').replace(/^minecraft:/, ''), props = p?.Properties || {}
      if (AIR.has(name)) return 0
      const key = name + JSON.stringify(props)
      if (!keyIdx.has(key)) { keyIdx.set(key, palette.length); palette.push({ name, props }) }
      return keyIdx.get(key)!
    })
    const bits = Math.max(2, 32 - Math.clz32(pal.length - 1)), mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1, total = words.length * 32
    const vol = b.sx * b.sy * b.sz
    for (let i = 0, off = 0; i < vol && off + bits <= total; i++, off += bits) {
      const k = off >>> 5, s = off & 31
      let v = words[k] >>> s
      if (s + bits > 32) v |= words[k + 1] << (32 - s)
      v &= mask
      const id = map[v] ?? 0
      if (!id) continue
      const x = i % b.sx, z = Math.floor(i / b.sx) % b.sz, y = Math.floor(i / (b.sx * b.sz))
      data[((b.y - minY + y) * Z + (b.z - minZ + z)) * X + (b.x - minX + x)] = id
      count++
    }
  }
  return { X, Y, Z, palette, data, name: String(root?.Metadata?.Name || ''), count, tiles, entities }
}

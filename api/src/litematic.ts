import { gunzipSync } from 'node:zlib'

/**
 * Reads a Litematica .litematic file (gzip NBT) and counts the items needed to build it.
 * Each region stores a block palette plus a bit-packed array of palette indices (values may span two longs).
 */

type Nbt = any
const MAX_UNZIPPED = 16 * 1024 * 1024, MAX_VOLUME = 64_000_000

/** Minimal big-endian NBT reader. Long arrays become a Uint32Array of [lo, hi] word pairs (bit 0 of the stream is bit 0 of word 0). */
export function readNbt(buf: Buffer): Nbt {
  let o = 0
  const u8 = () => buf.readUInt8(o++), i16 = () => { const v = buf.readInt16BE(o); o += 2; return v }, i32 = () => { const v = buf.readInt32BE(o); o += 4; return v }
  const str = () => { const n = buf.readUInt16BE(o); o += 2; const s = buf.toString('utf8', o, o + n); o += n; return s }
  const payload = (t: number, depth: number): Nbt => {
    if (depth > 64) throw new Error('NBT nested too deep')
    switch (t) {
      case 1: return buf.readInt8(o++)
      case 2: return i16()
      case 3: return i32()
      case 4: { const hi = i32(), lo = buf.readUInt32BE(o); o += 4; return hi * 4294967296 + lo }
      case 5: { const v = buf.readFloatBE(o); o += 4; return v }
      case 6: { const v = buf.readDoubleBE(o); o += 8; return v }
      case 7: { const n = i32(); const v = buf.subarray(o, o + n); o += n; return v }
      case 8: return str()
      case 9: { const et = u8(), n = i32(), a: Nbt[] = []; for (let i = 0; i < n; i++) a.push(payload(et, depth + 1)); return a }
      case 10: { const m: Record<string, Nbt> = {}; for (;;) { const ct = u8(); if (ct === 0) return m; const k = str(); m[k] = payload(ct, depth + 1) } }
      case 11: { const n = i32(), a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = i32(); return a }
      case 12: {
        const n = i32(); if (n < 0 || o + n * 8 > buf.length) throw new Error('Bad long array')
        const w = new Uint32Array(n * 2)
        for (let i = 0; i < n; i++) { w[i * 2 + 1] = buf.readUInt32BE(o); w[i * 2] = buf.readUInt32BE(o + 4); o += 8 }
        return w
      }
      default: throw new Error('Unknown NBT tag ' + t)
    }
  }
  const t = u8(); if (t !== 10) throw new Error('Not an NBT compound')
  str()
  return payload(10, 0)
}

const SKIP = new Set(['air', 'cave_air', 'void_air', 'piston_head', 'moving_piston', 'nether_portal', 'end_portal', 'end_gateway', 'fire', 'soul_fire', 'bubble_column', 'structure_void', 'frosted_ice'])
const RENAME: Record<string, string> = {
  redstone_wire: 'redstone', tripwire: 'string', carrots: 'carrot', potatoes: 'potato', beetroots: 'beetroot_seeds', wheat: 'wheat_seeds',
  melon_stem: 'melon_seeds', attached_melon_stem: 'melon_seeds', pumpkin_stem: 'pumpkin_seeds', attached_pumpkin_stem: 'pumpkin_seeds', cocoa: 'cocoa_beans',
  sweet_berry_bush: 'sweet_berries', bamboo_sapling: 'bamboo', kelp_plant: 'kelp', cave_vines: 'glow_berries', cave_vines_plant: 'glow_berries',
  twisting_vines_plant: 'twisting_vines', weeping_vines_plant: 'weeping_vines', big_dripleaf_stem: 'big_dripleaf', powder_snow: 'powder_snow_bucket',
  farmland: 'dirt', dirt_path: 'dirt', torchflower_crop: 'torchflower_seeds', pitcher_crop: 'pitcher_pod', water_cauldron: 'cauldron', lava_cauldron: 'cauldron',
  powder_snow_cauldron: 'cauldron', tall_seagrass: 'seagrass', wall_torch: 'torch', potted_azalea_bush: 'azalea', potted_flowering_azalea_bush: 'flowering_azalea',
}
const AMOUNT = ['candles', 'pickles', 'eggs', 'layers', 'flower_amount', 'segment_amount']

/** What one block in a schematic costs, as [item, count] pairs. Matches what you'd hold to place it. */
export function blockItems(id: string, props: Record<string, string> = {}): [string, number][] {
  const ns = id.includes(':') ? id.slice(0, id.indexOf(':')) : 'minecraft'
  let name = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
  if (ns !== 'minecraft') return [[`${ns}:${name}`, 1]]
  if (SKIP.has(name)) return []
  if (name === 'water' || name === 'lava') return props.level === '0' || props.level === undefined ? [[`${name}_bucket`, 1]] : []
  if (props.half === 'upper' || props.part === 'head') return []   // the other half of doors, tall plants and beds
  let n = 1
  if (props.type === 'double' && name.endsWith('_slab')) n = 2
  for (const k of AMOUNT) if (props[k] && /^\d+$/.test(props[k])) n = Number(props[k])
  if (name.startsWith('potted_')) { const plant = RENAME[name] ?? name.slice(7); return [['flower_pot', 1], [plant, 1]] }
  if (name === 'flower_pot') return [['flower_pot', 1]]
  name = RENAME[name] ?? name.replace('_wall_', '_')
  return [[name, n]]
}

/** Values packed LSB-first into a word stream; a value can cross into the next word (Litematica's layout). */
function countIndices(words: Uint32Array, bits: number, volume: number, size: number): Uint32Array {
  const counts = new Uint32Array(size), mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1
  const total = words.length * 32
  for (let i = 0, off = 0; i < volume; i++, off += bits) {
    if (off + bits > total) break
    const k = off >>> 5, s = off & 31
    let v = words[k] >>> s
    if (s + bits > 32) v |= words[k + 1] << (32 - s)
    v &= mask
    if (v < size) counts[v]++
  }
  return counts
}

/** Item id (no "minecraft:") -> how many are needed, summed over every region. */
export function litematicItems(file: Buffer): Record<string, number> {
  const root = readNbt(gunzipSync(file, { maxOutputLength: MAX_UNZIPPED }))
  const regions = root?.Regions
  if (!regions || typeof regions !== 'object') throw new Error('No regions in this file')
  const out: Record<string, number> = {}
  let volumeLeft = MAX_VOLUME
  for (const r of Object.values<any>(regions)) {
    const palette: any[] = Array.isArray(r?.BlockStatePalette) ? r.BlockStatePalette : []
    const words: Uint32Array | undefined = r?.BlockStates instanceof Uint32Array ? r.BlockStates : undefined
    const sz = r?.Size
    if (!palette.length || !words || !sz) continue
    const volume = Math.abs(sz.x | 0) * Math.abs(sz.y | 0) * Math.abs(sz.z | 0)
    if (!volume) continue
    if (volume > volumeLeft) throw new Error('Schematic is too big to count')
    volumeLeft -= volume
    const bits = Math.max(2, 32 - Math.clz32(palette.length - 1))
    const counts = countIndices(words, bits, volume, palette.length)
    palette.forEach((p, i) => {
      if (!counts[i] || typeof p?.Name !== 'string') return
      for (const [item, n] of blockItems(p.Name, p.Properties || {})) out[item] = (out[item] || 0) + n * counts[i]
    })
  }
  return out
}

// Reads a Litematica .litematic file in the browser into one block grid, for the 3D viewer.
// The file is gzip NBT. Each region has a position, a size (either sign), a block palette and the palette indices packed into longs
// (a value can cross from one long into the next). Index order inside a region: x fastest, then z, then y.

export type Block = { name: string; props: Record<string, string> }
export type Schematic = { X: number; Y: number; Z: number; palette: Block[]; data: Uint16Array; name: string; count: number }
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
  for (const b of box) {
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
  return { X, Y, Z, palette, data, name: String(root?.Metadata?.Name || ''), count }
}

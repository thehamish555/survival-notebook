// Extracts block shapes and textures from YOUR installed Minecraft client jar for the 3D schematic viewer.
// Writes public/mc/blocks.json (every block state's models, with their boxes and faces) and public/mc/blocks.png (the textures: 16x16 tiles,
// then the chest, banner, head and other block entity textures at full size).
// Usage: npm run blocks            (auto-finds your newest installed version)
//        npm run blocks -- "C:\path\to\26.3.jar"
import AdmZip from 'adm-zip'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { addBlockEntities } from './block-entities.mjs'

let jar = process.argv[2]
if (!jar) {
  const base = process.env.APPDATA ? path.join(process.env.APPDATA, '.minecraft', 'versions')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support/minecraft/versions') : path.join(os.homedir(), '.minecraft/versions')
  const jars = fs.existsSync(base) ? fs.readdirSync(base).map(v => path.join(base, v, v + '.jar')).filter(f => fs.existsSync(f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs) : []
  if (!jars.length) { console.error('No client jars found. Launch the game once (or pass a .jar path).'); process.exit(1) }
  jar = jars[0]
}
console.log('Reading', jar)
const zip = new AdmZip(jar)
const readJson = p => { const e = zip.getEntry(p); try { return e ? JSON.parse(e.getData().toString('utf8')) : null } catch { return null } }
const tpath = t => String(t).replace(/^minecraft:/, '')

// ---- models: parents fill in textures and elements
const modelCache = new Map()
function chain(ref) {
  const textures = {}; let elements = null, ambient = true
  for (let r = ref, i = 0; r && i < 20; i++) {
    const m = readJson(`assets/minecraft/models/${tpath(r)}.json`); if (!m) break
    for (const [k, v] of Object.entries(m.textures || {})) if (!(k in textures)) textures[k] = v && typeof v === 'object' ? v.sprite : v
    if (!elements && m.elements) elements = m.elements
    if (m.ambientocclusion === false) ambient = false
    r = m.parent
  }
  return { textures, elements, ambient }
}
const resolveRef = (tex, v, depth = 0) => {
  if (typeof v !== 'string' || depth >= 10) return v
  if (v.startsWith('#')) return resolveRef(tex, tex[v.slice(1)], depth + 1)
  return /^[a-z0-9_]+$/.test(v) && v in tex ? resolveRef(tex, tex[v], depth + 1) : v
}

const texIndex = new Map(), texList = []
const tex = t => { const p = tpath(t); if (!p || p.startsWith('#')) return -1; if (!texIndex.has(p)) { texIndex.set(p, texList.length); texList.push(p) } return texIndex.get(p) }

/** A model as boxes: [from, to, rotation | 0, faces] where faces maps a direction to [texture, uv | null, cull, tint, uv rotation]. */
const models = [], modelIdx = new Map()
function model(ref) {
  const key = tpath(ref)
  if (modelIdx.has(key)) return modelIdx.get(key)
  const { textures, elements } = chain(ref)
  const boxes = (elements || []).map(e => {
    const faces = {}
    for (const [dir, f] of Object.entries(e.faces || {})) {
      const t = tex(resolveRef(textures, f.texture) || '')
      if (t < 0) continue
      faces[dir] = [t, f.uv || null, f.cullface ? 1 : 0, f.tintindex !== undefined ? 1 : 0, f.rotation || 0]   // no uv: worked out from the box in the viewer
    }
    const rot = e.rotation ? [e.rotation.axis, e.rotation.angle, ...(e.rotation.origin || [8, 8, 8])] : 0
    return [e.from, e.to, rot, faces]
  })
  const particle = tex(resolveRef(textures, textures.particle) || '')
  const i = models.length
  models.push(boxes.length ? { b: boxes } : { p: particle })   // no boxes: drawn by code in the game (chests, signs, beds); the viewer uses a plain box
  modelIdx.set(key, i)
  return i
}
const pickVariant = v => (Array.isArray(v) ? v[0] : v)
const ref = v => { const x = pickVariant(v); return { m: model(x.model), ...(x.x ? { x: x.x } : {}), ...(x.y ? { y: x.y } : {}) } }

// ---- every block state
const blocks = {}
for (const e of zip.getEntries()) {
  const name = e.entryName.match(/^assets\/minecraft\/blockstates\/([a-z0-9_]+)\.json$/)?.[1]; if (!name) continue
  const bs = readJson(e.entryName); if (!bs) continue
  if (bs.variants) blocks[name] = { v: Object.entries(bs.variants).map(([k, v]) => [k, ref(v)]) }
  else if (bs.multipart) blocks[name] = { mp: bs.multipart.map(p => [p.when || null, ref(p.apply)]) }
}
// Colours the game paints over grey textures (plains biome)
const GRASS = [0x91, 0xbd, 0x59], FOLIAGE = [0x77, 0xab, 0x2f]
const TINTS = {
  grass_block: GRASS, short_grass: GRASS, tall_grass: GRASS, fern: GRASS, large_fern: GRASS, potted_fern: GRASS, sugar_cane: GRASS, bush: GRASS,
  oak_leaves: FOLIAGE, jungle_leaves: FOLIAGE, acacia_leaves: FOLIAGE, dark_oak_leaves: FOLIAGE, vine: FOLIAGE, mangrove_leaves: [0x92, 0xc7, 0x50],
  birch_leaves: [0x80, 0xa7, 0x55], spruce_leaves: [0x61, 0x99, 0x61], lily_pad: [0x20, 0x80, 0x30], water: [0x3f, 0x76, 0xe4], water_cauldron: [0x3f, 0x76, 0xe4],
  redstone_wire: [0xc8, 0x10, 0x10], melon_stem: [0x9c, 0xc0, 0x40], pumpkin_stem: [0x9c, 0xc0, 0x40], attached_melon_stem: [0xe0, 0xc7, 0x1c], attached_pumpkin_stem: [0xe0, 0xc7, 0x1c],
}
for (const [k, c] of Object.entries(TINTS)) if (blocks[k]) blocks[k].t = c
// Fluids have no model: the viewer draws them as a slightly lower box
for (const [k, t] of [['water', 'block/water_still'], ['lava', 'block/lava_still']]) blocks[k] = { ...(blocks[k] || {}), fluid: tex(t) }

// Chests, shulker boxes, banners, heads, pots and bells: drawn by code in the game, shapes copied in block-entities.mjs
const big = addBlockEntities({ hasBlock: n => !!zip.getEntry(`assets/minecraft/blockstates/${n}.json`), tex, models, blocks })

// ---- the texture sheet: 16x16 tiles (first frame of animated ones), then the block entity textures at full size below them
const COLS = 64, W = COLS * 16, tileRows = Math.ceil(texList.length / COLS)
const rects = {}, pics = new Map()
let sx = 0, sy = tileRows * 16, shelf = 0
for (const [i, p] of [...big.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
  const e = zip.getEntry(`assets/minecraft/textures/${p}.png`); if (!e) { console.warn('Missing texture', p); continue }
  const { data, info } = await sharp(e.getData()).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (sx + info.width > W) { sx = 0; sy += shelf; shelf = 0 }
  rects[i] = [sx, sy, info.width, info.height]; pics.set(i, { data, w: info.width, h: info.height })
  sx += info.width; shelf = Math.max(shelf, info.height)
}
const rows = Math.ceil((sy + shelf) / 16)
const sheet = Buffer.alloc(W * rows * 16 * 4)
for (let i = 0; i < texList.length; i++) {
  if (big.has(i)) continue
  const e = zip.getEntry(`assets/minecraft/textures/${texList[i]}.png`); if (!e) continue
  const meta = await sharp(e.getData()).metadata()
  const side = Math.min(meta.width, meta.height)
  const { data } = await sharp(e.getData()).ensureAlpha().extract({ left: 0, top: 0, width: side, height: side }).resize(16, 16, { kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true })
  const cx = (i % COLS) * 16, cy = Math.floor(i / COLS) * 16
  for (let y = 0; y < 16; y++) data.copy(sheet, ((cy + y) * W + cx) * 4, y * 64, y * 64 + 64)
}
for (const [i, { data, w, h }] of pics) { const [x0, y0] = rects[i]; for (let y = 0; y < h; y++) data.copy(sheet, ((y0 + y) * W + x0) * 4, y * w * 4, (y + 1) * w * 4) }
const out = path.join('public', 'mc'); fs.mkdirSync(out, { recursive: true })
await sharp(sheet, { raw: { width: W, height: rows * 16, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(out, 'blocks.png'))
// Banner pattern layers (the viewer paints each banner from them) and Steve, for heads whose skin can't be loaded
const ent = path.join(out, 'entity'); fs.rmSync(ent, { recursive: true, force: true }); fs.mkdirSync(path.join(ent, 'banner'), { recursive: true })
for (const e of zip.getEntries()) {
  const n = e.entryName.match(/^assets\/minecraft\/textures\/entity\/banner\/([a-z0-9_]+)\.png$/)?.[1]
  if (n && n !== 'banner_base') fs.writeFileSync(path.join(ent, 'banner', n + '.png'), e.getData())
}
fs.writeFileSync(path.join(ent, 'steve.png'), zip.getEntry('assets/minecraft/textures/entity/player/wide/steve.png').getData())
fs.writeFileSync(path.join(out, 'blocks.json'), JSON.stringify({ cols: COLS, rows, tex: texList, big: rects, models, blocks }))
console.log(`${Object.keys(blocks).length} blocks, ${models.length} models, ${texList.length} textures -> public/mc/blocks.json, blocks.png (${(fs.statSync(path.join(out, 'blocks.json')).size / 1024).toFixed(0)} KB json)`)

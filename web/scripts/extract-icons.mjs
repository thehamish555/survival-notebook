// Extracts item icons from YOUR installed Minecraft client jar into public/mc/ (textures are Mojang's; not bundled with this project).
// Usage: npm run icons            (auto-finds your newest installed version)
//        npm run icons -- "C:\path\to\26.3.jar"
import AdmZip from 'adm-zip'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

let jar = process.argv[2]
if (!jar) {
  const base = process.env.APPDATA ? path.join(process.env.APPDATA, '.minecraft', 'versions')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support/minecraft/versions') : path.join(os.homedir(), '.minecraft/versions')
  if (!fs.existsSync(base)) { console.error(`No Minecraft versions folder at ${base}. Pass a client .jar path as an argument.`); process.exit(1) }
  const jars = fs.readdirSync(base).map(v => path.join(base, v, v + '.jar')).filter(f => fs.existsSync(f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  if (!jars.length) { console.error('No client jars found. Launch the game once (or pass a .jar path).'); process.exit(1) }
  jar = jars[0]
}
console.log('Reading', jar)
const zip = new AdmZip(jar), entries = zip.getEntries()
const animated = new Set(entries.filter(e => e.entryName.endsWith('.png.mcmeta')).map(e => e.entryName.replace('.mcmeta', '')))
const out = path.join('public', 'mc', 'item'); fs.mkdirSync(out, { recursive: true })
const names = []
for (const e of entries) {
  const m = e.entryName.match(/^assets\/minecraft\/textures\/item\/([a-z0-9_]+)\.png$/)
  if (!m || animated.has(e.entryName)) continue   // skip animated strips
  fs.writeFileSync(path.join(out, m[1] + '.png'), e.getData()); names.push(m[1])
}
// Clocks and compasses are stored as clock_00 ... clock_63 frames: use the first frame under the plain name.
for (const n of [...names]) {
  const m = n.match(/^(.+)_00$/)
  if (m && !have0(m[1])) { fs.copyFileSync(path.join(out, n + '.png'), path.join(out, m[1] + '.png')); names.push(m[1]) }
}
function have0(n) { return names.includes(n) }
// Block items have no flat item texture, so use the block's own flat texture (side or front face). Nothing is rendered or distorted.
const blockEntries = new Map(), entityEntries = new Map()
for (const e of entries) {
  let m = e.entryName.match(/^assets\/minecraft\/textures\/block\/([a-z0-9_]+)\.png$/); if (m) blockEntries.set(m[1], e)
  m = e.entryName.match(/^assets\/minecraft\/textures\/entity\/(?:player\/wide\/)?(steve)\.png$/); if (m) entityEntries.set(m[1], e)
}
const itemDefs = new Set(entries.map(e => e.entryName.match(/^assets\/minecraft\/items\/([a-z0-9_]+)\.json$/)?.[1]).filter(Boolean))
const have = new Set(names)
const GREEN = [0x7c, 0xbd, 0x6b], LEAF = [0x5a, 0x9c, 0x3a]
const TINT = { grass_block_top: GREEN, short_grass: GREEN, tall_grass_top: GREEN, fern: GREEN, oak_leaves: LEAF, jungle_leaves: LEAF, acacia_leaves: LEAF, dark_oak_leaves: LEAF, vine: LEAF, birch_leaves: [0x80, 0xa7, 0x55], spruce_leaves: [0x61, 0x99, 0x61], lily_pad: [0x20, 0x80, 0x30] }
const png = (w, h, data) => sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
const px = async (buf, rect, tint) => {   // RGBA pixels of (a region of) a png; animated strips use their first frame
  const meta = await sharp(buf).metadata(), w = rect ? rect[2] : meta.width, h = rect ? rect[3] : Math.min(meta.width, meta.height)
  const { data } = await sharp(buf).ensureAlpha().extract({ left: rect ? rect[0] : 0, top: rect ? rect[1] : 0, width: w, height: h }).raw().toBuffer({ resolveWithObject: true })
  if (tint) for (let i = 0; i < data.length; i += 4) { data[i] = data[i] * tint[0] / 255; data[i + 1] = data[i + 1] * tint[1] / 255; data[i + 2] = data[i + 2] * tint[2] / 255 }
  return { w, h, data }
}
const blocks = []
for (const n of [...(itemDefs.size ? itemDefs : new Set([...blockEntries.keys()]))]) {
  if (have.has(n)) continue
  const key = [n, n + '_side', n + '_front', n + '_top'].find(k => blockEntries.has(k)); if (!key) continue
  try { const t = await px(blockEntries.get(key).getData(), null, TINT[key]); fs.writeFileSync(path.join(out, n + '.png'), await png(t.w, t.h, t.data)); names.push(n); have.add(n); blocks.push(n) } catch { /* skip odd textures */ }
}
// A flat Steve face (with the hat layer) for "player" rows.
const steve = entityEntries.get('steve')
if (steve && !have.has('player_head')) {
  const buf = steve.getData(), base = await px(buf, [8, 8, 8, 8]), hat = await px(buf, [40, 8, 8, 8])
  for (let i = 0; i < base.data.length; i += 4) if (hat.data[i + 3] > 8) for (let k = 0; k < 4; k++) base.data[i + k] = hat.data[i + k]
  fs.writeFileSync(path.join(out, 'player_head.png'), await png(8, 8, base.data)); names.push('player_head')
}
names.sort((a, b) => a.localeCompare(b)); fs.writeFileSync(path.join('public', 'mc', 'index.json'), JSON.stringify(names))
console.log(`Extracted ${names.length} icons (${blocks.length} from block textures) to public/mc/`)

// UI sounds: copied from your game's own sound files (looked up through the asset index next to the versions folder).
try {
  const assets = path.join(path.dirname(path.dirname(jar)), '..', 'assets')
  const idxDir = path.join(assets, 'indexes')
  const idxFile = fs.readdirSync(idxDir).map(f => path.join(idxDir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
  const objs = JSON.parse(fs.readFileSync(idxFile, 'utf8')).objects
  const WANT = { click: ['random/click', 'ui/button/click'], ok: ['random/orb'], del: ['random/break', 'random/anvil_use'], err: ['mob/villager/no1', 'mob/villager/no'], open: ['random/pop', 'random/click'] }
  const sdir = path.join('public', 'mc', 'sound'); fs.mkdirSync(sdir, { recursive: true })
  const got = []
  for (const [name, cands] of Object.entries(WANT)) {
    const hit = cands.map(c => objs[`minecraft/sounds/${c}.ogg`]).find(Boolean)
    if (!hit) { console.log(`No sound found for "${name}" (tried ${cands.join(', ')}).`); continue }
    fs.copyFileSync(path.join(assets, 'objects', hit.hash.slice(0, 2), hit.hash), path.join(sdir, name + '.ogg')); got.push(name)
  }
  console.log(`Copied ${got.length} sounds to public/mc/sound/`)
} catch (e) { console.log('Skipped sounds:', e.message) }

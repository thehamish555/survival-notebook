// Extracts item icons from YOUR installed Minecraft client jar into public/mc/ (textures are Mojang's; not bundled with this project).
// Usage: npm run icons            (auto-finds your newest installed version)
//        npm run icons -- "C:\path\to\26.3.jar"
import AdmZip from 'adm-zip'
import sharp from 'sharp'
import { renderModel } from './block-render.mjs'
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
// Block items are drawn from their block model at the inventory angle (block-render.mjs); anything the game draws flat keeps a flat texture.
const blockEntries = new Map(), entityEntries = new Map()
for (const e of entries) {
  let m = e.entryName.match(/^assets\/minecraft\/textures\/block\/([a-z0-9_]+)\.png$/); if (m) blockEntries.set(m[1], e)
  m = e.entryName.match(/^assets\/minecraft\/textures\/entity\/(?:player\/wide\/)?(steve)\.png$/); if (m) entityEntries.set(m[1], e)
}
const itemDefs = new Set(entries.map(e => e.entryName.match(/^assets\/minecraft\/items\/([a-z0-9_]+)\.json$/)?.[1]).filter(Boolean))
const have = new Set(names)
const GREEN = [0x7c, 0xbd, 0x6b], LEAF = [0x5a, 0x9c, 0x3a]
const TINT = { grass_block_top: GREEN, grass_block_side_overlay: GREEN, mangrove_leaves: [0x8d, 0xb1, 0x27], short_grass: GREEN, tall_grass_top: GREEN, fern: GREEN, oak_leaves: LEAF, jungle_leaves: LEAF, acacia_leaves: LEAF, dark_oak_leaves: LEAF, vine: LEAF, birch_leaves: [0x80, 0xa7, 0x55], spruce_leaves: [0x61, 0x99, 0x61], lily_pad: [0x20, 0x80, 0x30] }
const png = (w, h, data) => sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
const px = async (buf, rect, tint) => {   // RGBA pixels of (a region of) a png; animated strips use their first frame
  const meta = await sharp(buf).metadata(), w = rect ? rect[2] : meta.width, h = rect ? rect[3] : Math.min(meta.width, meta.height)
  const { data } = await sharp(buf).ensureAlpha().extract({ left: rect ? rect[0] : 0, top: rect ? rect[1] : 0, width: w, height: h }).raw().toBuffer({ resolveWithObject: true })
  if (tint) for (let i = 0; i < data.length; i += 4) { data[i] = data[i] * tint[0] / 255; data[i + 1] = data[i + 1] * tint[1] / 255; data[i + 2] = data[i + 2] * tint[2] / 255 }
  return { w, h, data }
}
// Which texture an item shows is worked out the way the game does it: items/<id>.json names a model, models name parents and textures.
// That finds the right texture for blocks named differently from their texture (oak_slab -> oak_planks, chest -> its particle texture, and so on).
const jsonCache = new Map()
const readJson = p => { if (!jsonCache.has(p)) { const e = zip.getEntry(p); let v = null; try { v = e ? JSON.parse(e.getData().toString('utf8')) : null } catch { v = null } jsonCache.set(p, v) } return jsonCache.get(p) }
const modelRefs = (node, acc = []) => {   // every model named in an item definition (plain, conditional, select, special "base")
  if (Array.isArray(node)) node.forEach(x => modelRefs(x, acc))
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { if ((k === 'model' || k === 'base') && typeof v === 'string') acc.push(v); else modelRefs(v, acc) }
  return acc
}
const modelTextures = ref => {   // a model's textures, with its parents' filling the gaps
  const tex = {}
  for (let r = ref, i = 0; r && i < 20; i++) { const m = readJson(`assets/minecraft/models/${r.replace(/^minecraft:/, '')}.json`); if (!m) break; for (const [k, v] of Object.entries(m.textures || {})) if (!(k in tex)) tex[k] = v && typeof v === 'object' ? v.sprite : v; r = m.parent }   // 26.x can write a texture as { sprite, force_translucent }
  return tex
}
const resolveRef = (tex, v, depth = 0) => (typeof v === 'string' && v.startsWith('#') && depth < 10 ? resolveRef(tex, tex[v.slice(1)], depth + 1) : v)
const PREFER = ['layer0', 'all', 'side', 'texture', 'front', 'top', 'end', 'cross', 'plant', 'pattern', 'wool', 'particle']
const textureFor = n => {
  for (const ref of modelRefs(readJson(`assets/minecraft/items/${n}.json`))) {
    const tex = modelTextures(ref)
    for (const k of PREFER) {
      const t = resolveRef(tex, tex[k]); if (typeof t !== 'string' || t.startsWith('#')) continue
      const entry = zip.getEntry(`assets/minecraft/textures/${t.replace(/^minecraft:/, '')}.png`)
      if (entry) return { entry, base: t.split('/').pop() }
    }
  }
  return null
}
// A block item's look: the first model in the item definition, its parents' elements, textures and "gui" display angle.
const FLAT = /^(minecraft:)?(item\/generated|builtin\/generated|item\/handheld.*|builtin\/entity)$/
const texCache = new Map()
const loadTex = async t => {
  if (!texCache.has(t)) { const e = zip.getEntry(`assets/minecraft/textures/${t.replace(/^minecraft:/, '')}.png`); texCache.set(t, e ? await px(e.getData()).catch(() => null) : null) }
  return texCache.get(t)
}
async function render3d(n) {
  const ref = modelRefs(readJson(`assets/minecraft/items/${n}.json`))[0]; if (!ref) return null
  const tex = {}; let elements = null, gui = null
  for (let r = ref, i = 0; r && i < 20; i++) {
    if (FLAT.test(r)) return null
    const m = readJson(`assets/minecraft/models/${r.replace(/^minecraft:/, '')}.json`); if (!m) break
    for (const [k, v] of Object.entries(m.textures || {})) if (!(k in tex)) tex[k] = v && typeof v === 'object' ? v.sprite : v   // 26.x can write a texture as { sprite, force_translucent }
    if (!elements && m.elements) elements = m.elements
    if (!gui && m.display?.gui) gui = m.display.gui
    r = m.parent
  }
  if (!elements) return null
  const names = new Map()
  for (const el of elements) for (const f of Object.values(el.faces || {})) {
    const t = resolveRef(tex, f.texture)
    if (typeof t === 'string' && !t.startsWith('#') && !names.has(f.texture)) names.set(f.texture, { name: t.split('/').pop(), img: await loadTex(t) })
  }
  return renderModel({ elements, gui, texture: k => names.get(k)?.img ?? null, tint: k => TINT[names.get(k)?.name] ?? GREEN }, 64)
}
// Items the game draws as 3D models (heads, chests, banners, the shield) only name a stand-in texture, so cut a face from their real texture.
const tex = p => zip.getEntry(`assets/minecraft/textures/${p}.png`)
const face = (p, rect, hat) => async () => {   // a rectangle of an entity texture, with an optional overlay layer on top
  const e = tex(p); if (!e) return null
  const base = await px(e.getData(), rect)
  if (hat) { const top = await px(e.getData(), hat); for (let i = 0; i < base.data.length; i += 4) if (top.data[i + 3] > 8) for (let k = 0; k < 4; k++) base.data[i + k] = top.data[i + k] }
  return base
}
const chest = p => async () => {   // the front of a chest: lid strip above the body, with the latch
  const e = tex(`entity/chest/${p}`); if (!e) return null
  const buf = e.getData(), lid = await px(buf, [14, 14, 14, 5]), body = await px(buf, [14, 33, 14, 10]), lock = await px(buf, [1, 1, 2, 4])
  const w = 14, h = 15, data = Buffer.alloc(w * h * 4)
  lid.data.copy(data, 0); body.data.copy(data, w * 5 * 4)
  for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) { const s = (y * 2 + x) * 4, d = ((y + 3) * w + 6 + x) * 4; if (lock.data[s + 3] > 8) for (let k = 0; k < 4; k++) data[d + k] = lock.data[s + k] }
  return { w, h, data }
}
const SPECIAL = {
  skeleton_skull: face('entity/skeleton/skeleton', [8, 8, 8, 8]), wither_skeleton_skull: face('entity/skeleton/wither_skeleton', [8, 8, 8, 8]),
  zombie_head: face('entity/zombie/zombie', [8, 8, 8, 8], [40, 8, 8, 8]), creeper_head: face('entity/creeper/creeper', [8, 8, 8, 8]),
  piglin_head: face('entity/piglin/piglin', [8, 8, 10, 8]), shield: face('entity/shield_base_nopattern', [2, 2, 10, 20]),
  chest: chest('normal'), trapped_chest: chest('trapped'), ender_chest: chest('ender'),
  copper_chest: chest('copper'), exposed_copper_chest: chest('copper_exposed'), weathered_copper_chest: chest('copper_weathered'), oxidized_copper_chest: chest('copper_oxidized'),
}
for (const w of ['', 'exposed_', 'weathered_', 'oxidized_']) SPECIAL[`waxed_${w}copper_chest`] = SPECIAL[`${w}copper_chest`]
for (const c of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'])
  SPECIAL[`${c}_banner`] = SPECIAL[`${c}_bed`] = async () => { const e = tex(`block/${c}_wool`); return e ? px(e.getData()) : null }   // banners and beds: their colour
for (const [n, make] of Object.entries(SPECIAL)) {
  if (have.has(n) || !itemDefs.has(n)) continue
  try { const t = await make(); if (t) { fs.writeFileSync(path.join(out, n + '.png'), await png(t.w, t.h, t.data)); names.push(n); have.add(n) } } catch { /* leave it to the steps below */ }
}
const blocks = []
for (const n of [...(itemDefs.size ? itemDefs : new Set([...blockEntries.keys()]))]) {
  if (have.has(n) || n === 'player_head' || n === 'dragon_head') continue   // the player head is drawn from Steve below; the dragon head has no flat face
  try {
    const cube = await render3d(n)
    if (cube) { fs.writeFileSync(path.join(out, n + '.png'), await png(cube.w, cube.h, cube.data)); names.push(n); have.add(n); blocks.push(n); continue }
  } catch { /* fall back to a flat texture */ }
  const found = textureFor(n), key = found ? null : [n, n + '_side', n + '_front', n + '_top'].find(k => blockEntries.has(k))
  if (!found && !key) continue
  try {
    const t = found ? await px(found.entry.getData(), null, TINT[found.base]) : await px(blockEntries.get(key).getData(), null, TINT[key])
    fs.writeFileSync(path.join(out, n + '.png'), await png(t.w, t.h, t.data)); names.push(n); have.add(n); blocks.push(n)
  } catch { /* skip odd textures */ }
}

// A flat Steve face (with the hat layer) for "player" rows.
const steve = entityEntries.get('steve')
if (steve && !have.has('player_head')) {
  const buf = steve.getData(), base = await px(buf, [8, 8, 8, 8]), hat = await px(buf, [40, 8, 8, 8])
  for (let i = 0; i < base.data.length; i += 4) if (hat.data[i + 3] > 8) for (let k = 0; k < 4; k++) base.data[i + k] = hat.data[i + k]
  fs.writeFileSync(path.join(out, 'player_head.png'), await png(8, 8, base.data)); names.push('player_head'); have.add('player_head')
}
const missing = [...itemDefs].filter(n => !have.has(n) && n !== 'air')
if (missing.length) console.log(`No icon for ${missing.length} item(s): ${missing.join(', ')}`)
names.sort((a, b) => a.localeCompare(b)); fs.writeFileSync(path.join('public', 'mc', 'index.json'), JSON.stringify(names))
console.log(`Extracted ${names.length} icons (${blocks.length} blocks) to public/mc/`)

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

// Extracts item icons from YOUR installed Minecraft client jar into public/mc/ (textures are Mojang's; not bundled with this project).
// Usage: npm run icons            (auto-finds your newest installed version)
//        npm run icons -- "C:\path\to\26.3.jar"
import AdmZip from 'adm-zip'
import sharp from 'sharp'
import { entityBox, renderModel } from './block-render.mjs'
import { apng } from './apng.mjs'
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
// Only real items get an icon. The folder is cleared first, so parts like overlays, open bundle halves and clock frames never end up in it.
// ONLY=chest,bow redraws just those (handy while tuning a model) and leaves the rest and the index alone.
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const out = path.join('public', 'mc', 'item'); if (!ONLY) fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true })
const itemDefs = entries.map(e => e.entryName.match(/^assets\/minecraft\/items\/([a-z0-9_]+)\.json$/)?.[1]).filter(n => n && n !== 'air' && (!ONLY || ONLY.has(n))).sort()
const GREEN = [0x7c, 0xbd, 0x6b], LEAF = [0x5a, 0x9c, 0x3a]
const TINT = { grass_block_top: GREEN, grass_block_side_overlay: GREEN, mangrove_leaves: [0x8d, 0xb1, 0x27], short_grass: GREEN, tall_grass_top: GREEN, fern: GREEN, oak_leaves: LEAF, jungle_leaves: LEAF, acacia_leaves: LEAF, dark_oak_leaves: LEAF, vine: LEAF, birch_leaves: [0x80, 0xa7, 0x55], spruce_leaves: [0x61, 0x99, 0x61], lily_pad: [0x20, 0x80, 0x30] }
const png = (w, h, data) => sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
const px = async (buf, rect, tint) => {   // RGBA pixels of (a region of) a png; animated strips use their first frame
  const meta = await sharp(buf).metadata(), w = rect ? rect[2] : meta.width, h = rect ? rect[3] : Math.min(meta.width, meta.height)
  const { data } = await sharp(buf).ensureAlpha().extract({ left: rect ? rect[0] : 0, top: rect ? rect[1] : 0, width: w, height: h }).raw().toBuffer({ resolveWithObject: true })
  if (tint) for (let i = 0; i < data.length; i += 4) { data[i] = data[i] * tint[0] / 255; data[i + 1] = data[i + 1] * tint[1] / 255; data[i + 2] = data[i + 2] * tint[2] / 255 }
  return { w, h, data }
}
const jsonCache = new Map()
const readJson = p => { if (!jsonCache.has(p)) { const e = zip.getEntry(p); let v = null; try { v = e ? JSON.parse(e.getData().toString('utf8')) : null } catch { v = null } jsonCache.set(p, v) } return jsonCache.get(p) }
const tpath = t => t.replace(/^minecraft:/, '')
const rgbOf = v => [v >> 16 & 255, v >> 8 & 255, v & 255]

// ---- textures, with their animation (a strip of frames plus a .mcmeta saying how long each shows, in game ticks)
const anims = new Map()
async function anim(t) {
  const p = tpath(t)
  if (anims.has(p)) return anims.get(p)
  let a = null
  const e = zip.getEntry(`assets/minecraft/textures/${p}.png`)
  if (e) {
    const { data, info } = await sharp(e.getData()).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const meta = readJson(`assets/minecraft/textures/${p}.png.mcmeta`)?.animation
    if (!meta) a = { frames: [{ w: info.width, h: info.height, data }], times: [1], total: 1 }
    else {
      const fw = meta.width || Math.min(info.width, info.height), fh = meta.height || fw, n = Math.max(1, Math.floor(info.height / fh))
      const strip = Array.from({ length: n }, (_, i) => ({ w: fw, h: fh, data: Buffer.from(data.subarray(i * fh * info.width * 4, (i + 1) * fh * info.width * 4)) }))
      const seq = (meta.frames || strip.map((_, i) => i)).map(f => (typeof f === 'number' ? { index: f, time: meta.frametime || 1 } : { index: f.index, time: f.time || meta.frametime || 1 }))
      const frames = seq.map(f => strip[f.index] || strip[0]), times = seq.map(f => f.time)
      a = { frames, times, total: times.reduce((s, x) => s + x, 0), interpolate: !!meta.interpolate }
    }
  }
  anims.set(p, a)
  return a
}
const loadTex = async t => (await anim(t))?.frames[0] ?? null   // the first frame, for things that don't animate
function frameAt(a, tick) {   // which frame shows at a given tick, blended with the next one for textures that interpolate
  if (a.frames.length === 1) return a.frames[0]
  let t = tick % a.total, i = 0
  while (t >= a.times[i]) { t -= a.times[i]; i++ }
  if (!a.interpolate) return a.frames[i]
  const f = a.frames[i], g = a.frames[(i + 1) % a.frames.length], k = t / a.times[i], data = Buffer.alloc(f.data.length)
  for (let j = 0; j < data.length; j++) data[j] = Math.round(f.data[j] * (1 - k) + g.data[j] * k)
  return { w: f.w, h: f.h, data }
}
/** When to take each frame of an icon: often enough to catch its quickest texture, at most 32 frames. */
function timeline(list) {
  const moving = list.filter(a => a && a.total > 1)
  if (!moving.length) return [{ tick: 0, ms: 0 }]
  const total = Math.max(...moving.map(a => a.total))
  let step = Math.max(1, Math.min(...moving.map(a => Math.min(...a.times) / (a.interpolate ? 4 : 1))))
  if (total / step > 32) step = Math.ceil(total / 32)
  return Array.from({ length: Math.ceil(total / step) }, (_, i) => ({ tick: Math.round(i * step), ms: step * 50 }))
}
/** Draws an icon once per frame of its textures and encodes it: a plain PNG if nothing moves, an animated PNG if it does. */
async function encode(textures, draw) {
  const list = await Promise.all(textures.map(anim)), byName = new Map(textures.map((t, i) => [tpath(t), list[i]]))
  const frames = [], delays = []
  for (const { tick, ms } of timeline(list)) {
    const img = await draw(t => { const a = byName.get(tpath(t)); return a ? frameAt(a, tick) : null })
    if (!img) return null
    const last = frames[frames.length - 1]
    if (last && last.data.equals(img.data)) { delays[delays.length - 1] += ms; continue }   // nothing changed: hold the last frame longer
    frames.push(img); delays.push(ms)
  }
  return frames.length > 1 ? apng(frames, delays) : png(frames[0].w, frames[0].h, frames[0].data)
}

// ---- models: which one an item shows in the inventory, and what it's made of
const FLAT = /^(minecraft:)?(item\/generated|builtin\/generated|item\/handheld.*|builtin\/entity)$/
/** The model an item shows in an inventory slot: its "gui" case if it has one (tridents, spears, spyglass), otherwise its plain look. */
function pick(node) {
  if (!node || typeof node !== 'object') return null
  switch (String(node.type).replace(/^minecraft:/, '')) {
    case 'model': case 'composite': case 'special': return node
    case 'select': {
      if (node.property === 'minecraft:display_context') { const c = (node.cases || []).find(c => [].concat(c.when).includes('gui')); if (c) return pick(c.model) }
      return pick(node.fallback) || pick(node.cases?.[0]?.model)
    }
    case 'condition': return pick(node.on_false) || pick(node.on_true)
    case 'range_dispatch': return pick(node.entries?.[0]?.model) || pick(node.fallback)
    default: return pick(node.fallback) || pick(node.model)
  }
}
/** A model's textures (its parents fill the gaps), elements, inventory angle, and whether it's a flat item model. */
function chain(ref) {
  const textures = {}; let elements = null, gui = null, flat = false
  for (let r = ref, i = 0; r && i < 20; i++) {
    if (FLAT.test(r)) flat = true
    const m = readJson(`assets/minecraft/models/${tpath(r)}.json`); if (!m) break
    for (const [k, v] of Object.entries(m.textures || {})) if (!(k in textures)) textures[k] = v && typeof v === 'object' ? v.sprite : v   // 26.x can write { sprite, force_translucent }
    if (!elements && m.elements) elements = m.elements
    if (!gui && m.display?.gui) gui = m.display.gui
    r = m.parent
  }
  return { textures, elements, gui, flat }
}
const resolveRef = (tex, v, depth = 0) => {   // '#side' (or plain 'side' in newer models) points at another texture variable
  if (typeof v !== 'string' || depth >= 10) return v
  if (v.startsWith('#')) return resolveRef(tex, tex[v.slice(1)], depth + 1)
  return /^[a-z0-9_]+$/.test(v) && v in tex ? resolveRef(tex, tex[v], depth + 1) : v
}
const guiOf = ref => chain(ref).gui
const lightOf = ref => { for (let r = ref, i = 0; r && i < 20; i++) { const m = readJson(`assets/minecraft/models/${tpath(r)}.json`); if (!m) break; if (m.gui_light) return m.gui_light; r = m.parent } return 'side' }
const tintColour = t => {
  if (!t) return null
  if (t.type === 'minecraft:grass') return GREEN
  const v = t.type === 'minecraft:constant' ? t.value : t.default
  return typeof v === 'number' ? rgbOf(v) : null
}

/** A flat item: its layers stacked bottom to top, each coloured by its tint (leather is dyed brown, potions get their liquid colour). */
async function flatIcon(ref, tints = []) {
  const { textures } = chain(ref), layers = []
  for (let i = 0; i < 8; i++) { const t = resolveRef(textures, textures[`layer${i}`]); if (typeof t !== 'string' || t.startsWith('#')) break; layers.push(t) }
  if (!layers.length || !(await anim(layers[0]))) return null
  return encode(layers, get => {
    let img = null
    for (const [i, t] of layers.entries()) {
      const f = get(t); if (!f) continue
      const c = tintColour(tints[i]) || TINT[t.split('/').pop()]
      if (!img) img = { w: f.w, h: f.h, data: Buffer.alloc(f.data.length) }
      if (f.w !== img.w || f.h !== img.h) continue
      for (let k = 0; k < f.data.length; k += 4) {
        const a = f.data[k + 3] / 255; if (!a) continue
        for (let ch = 0; ch < 3; ch++) img.data[k + ch] = Math.round(f.data[k + ch] * (c ? c[ch] / 255 : 1) * a + img.data[k + ch] * (1 - a))
        img.data[k + 3] = Math.max(img.data[k + 3], f.data[k + 3])
      }
    }
    return img
  })
}
/** A block item: its block model (or several, for a composite like a bed) drawn at the inventory angle by block-render.mjs. */
/** An item model's transformation (translation, left_rotation, scale, right_rotation, as the game applies them) for points in pixels and directions. */
const quat = (q, v) => {   // rotate v by the quaternion [x, y, z, w]
  const [x, y, z, w] = q, [a, b, c] = v, ix = w * a + y * c - z * b, iy = w * b + z * a - x * c, iz = w * c + x * b - y * a, iw = -x * a - y * b - z * c
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]
}
function transformation(t = {}) {
  const tr = (t.translation || [0, 0, 0]).map(v => v * 16), L = t.left_rotation || [0, 0, 0, 1], R = t.right_rotation || [0, 0, 0, 1], S = t.scale || [1, 1, 1]
  const lin = v => quat(L, quat(R, v).map((n, i) => n * S[i]))
  return { pt: p => lin(p).map((n, i) => n + tr[i]), dir: v => { const d = lin(v), l = Math.hypot(...d) || 1; return d.map(n => n / l) } }
}
async function blockIcon(parts, tints = []) {   // tints: the item's own tint list (leaves, grass); a face with no colour there stays as it is
  const elements = [], names = new Map(); let gui = null
  for (const [pi, { ref, at }] of parts.entries()) {
    const c = chain(ref); if (c.flat || !c.elements) return null
    gui = gui || c.gui
    const place = transformation(at)
    for (const el of c.elements) {
      const faces = {}
      for (const [dir, f] of Object.entries(el.faces || {})) {
        const key = `${pi}:${f.texture}`, t = resolveRef(c.textures, f.texture)
        if (typeof t === 'string' && !t.startsWith('#')) names.set(key, t)
        faces[dir] = { ...f, texture: key }
      }
      elements.push({ ...el, faces, place })
    }
  }
  const textures = [...new Set(names.values())]
  return encode(textures, get => renderModel({ elements, gui, texture: k => (names.has(k) ? get(names.get(k)) : null), tint: (k, i) => tintColour(tints[i]) ?? TINT[names.get(k)?.split('/').pop()] ?? null }, 64))
}

// Items the game shows as a sequence: the clock's face turning, compasses spinning, the bow and crossbow being drawn, light levels.
const pad = i => String(i).padStart(2, '0')
const SERIES = {
  clock: Array.from({ length: 64 }, (_, i) => [`item/clock_${pad(i)}`, 100]),
  compass: Array.from({ length: 32 }, (_, i) => [`item/compass_${pad(i)}`, 70]),
  recovery_compass: Array.from({ length: 32 }, (_, i) => [`item/recovery_compass_${pad(i)}`, 70]),
  light: Array.from({ length: 16 }, (_, i) => [`item/light_${pad(i)}`, 180]),
  bow: [['item/bow', 900], ['item/bow_pulling_0', 250], ['item/bow_pulling_1', 250], ['item/bow_pulling_2', 700]],
  crossbow: [['item/crossbow_standby', 900], ['item/crossbow_pulling_0', 250], ['item/crossbow_pulling_1', 250], ['item/crossbow_pulling_2', 250], ['item/crossbow_arrow', 1100]],
}
async function seriesIcon(n) {
  const s = SERIES[n]; if (!s) return null
  const frames = []; for (const [t] of s) { const f = await loadTex(t); if (!f) return null; frames.push(f) }
  return apng(frames, s.map(([, ms]) => ms))
}

// Block entities (chests, shulker boxes, heads, banners) are drawn by the game from entity models, not block models.
// Their boxes are copied from the game's model code; each lists its texture, size and where its UVs start.
const DYE = { white: 0xF9FFFE, orange: 0xF9801D, magenta: 0xC74EBD, light_blue: 0x3AB3DA, yellow: 0xFED83D, lime: 0x80C71F, pink: 0xF38BAA, gray: 0x474F52, light_gray: 0x9D9D97,
  cyan: 0x169C9C, purple: 0x8932B8, blue: 0x3C44AA, brown: 0x835432, green: 0x5E7C16, red: 0xB02E26, black: 0x1D1D21 }
const rgb = c => [c >> 16 & 255, c >> 8 & 255, c & 255]
const entity = (gui, boxes, quads = []) => async () => {   // quads: extra flat panels { texture, pts, uv (in texture pixels) }
  const imgs = new Map(); for (const b of [...boxes, ...quads]) if (!imgs.has(b.texture)) imgs.set(b.texture, await loadTex(`minecraft:entity/${b.texture}`))
  if ([...imgs.values()].some(x => !x)) return null
  const panels = quads.map(q => { const im = imgs.get(q.texture); return { ...q, uv: q.uv.map(([u, v]) => [u * 16 / im.w, v * 16 / im.h]) } })
  return renderModel({ quads: [...boxes.flatMap(b => entityBox({ ...b, texW: imgs.get(b.texture).w, texH: imgs.get(b.texture).h })), ...panels], gui: guiOf(gui), frontLight: lightOf(gui) === 'front', texture: k => imgs.get(k) }, 64)
}
const asIs = p => p, flipX180 = (dx, dy, dz) => p => [p[0] + dx, dy - p[1], dz - p[2]]   // the item's 180 degree turn about X, then its translation (pixels)
const chest3d = t => entity('item/chest', [
  { texture: `chest/${t}`, u: 0, v: 19, from: [1, 0, 1], size: [14, 10, 14], place: asIs },
  { texture: `chest/${t}`, u: 0, v: 0, from: [1, 0, 0], size: [14, 5, 14], offset: [0, 9, 1], place: asIs },
  { texture: `chest/${t}`, u: 0, v: 0, from: [7, -2, 14], size: [2, 4, 1], offset: [0, 9, 1], place: asIs }])
const head3d = (t, hat) => entity('item/template_skull', [
  { texture: t, u: 0, v: 0, from: [-4, -8, -4], size: [8, 8, 8], place: flipX180(8, 0, 8) },
  ...(hat ? [{ texture: t, u: 32, v: 0, from: [-4, -8, -4], size: [8, 8, 8], inflate: 0.25, place: flipX180(8, 0, 8) }] : [])])
const shulker3d = t => entity('item/template_shulker_box', [
  { texture: t, u: 0, v: 28, from: [-8, -8, -8], size: [16, 8, 16], offset: [0, 24, 0], place: flipX180(8, 24, 8) },
  { texture: t, u: 0, v: 0, from: [-8, -16, -8], size: [16, 12, 16], offset: [0, 24, 0], place: flipX180(8, 24, 8) }])
const banner3d = c => {   // the item scales by 2/3 and flips Y and Z
  const k = 2 / 3, place = p => [p[0] * k + 8, -p[1] * k, -p[2] * k + 8]
  return entity('item/template_banner', [
    { texture: 'banner/banner_base', u: 44, v: 0, from: [-1, -42, -1], size: [2, 42, 2], place },
    { texture: 'banner/banner_base', u: 0, v: 42, from: [-10, -44, -1], size: [20, 2, 2], place },
    { texture: 'banner/base', u: 0, v: 0, from: [-10, 0, -2], size: [20, 40, 1], offset: [0, -44, 0], place, tint: rgb(DYE[c]) }])
}
const ENTITY = {
  chest: chest3d('normal'), trapped_chest: chest3d('trapped'), ender_chest: chest3d('ender'), copper_chest: chest3d('copper'),
  exposed_copper_chest: chest3d('copper_exposed'), weathered_copper_chest: chest3d('copper_weathered'), oxidized_copper_chest: chest3d('copper_oxidized'),
  skeleton_skull: head3d('skeleton/skeleton'), wither_skeleton_skull: head3d('skeleton/wither_skeleton'), zombie_head: head3d('zombie/zombie', true),
  creeper_head: head3d('creeper/creeper'), player_head: head3d('player/wide/steve', true), shulker_box: shulker3d('shulker/shulker'),
  piglin_head: entity('item/template_skull', [
    { texture: 'piglin/piglin', u: 0, v: 0, from: [-5, -8, -4], size: [10, 8, 8], place: flipX180(8, 0, 8) },
    { texture: 'piglin/piglin', u: 31, v: 1, from: [-2, -4, -5], size: [4, 4, 1], place: flipX180(8, 0, 8) },
    { texture: 'piglin/piglin', u: 2, v: 4, from: [2, -2, -5], size: [1, 2, 1], place: flipX180(8, 0, 8) },
    { texture: 'piglin/piglin', u: 2, v: 0, from: [-3, -2, -5], size: [1, 2, 1], place: flipX180(8, 0, 8) },
    { texture: 'piglin/piglin', u: 51, v: 6, from: [0, 0, -2], size: [1, 5, 4], offset: [4.5, -6, 0], rot: [0, 0, -Math.PI / 6], place: flipX180(8, 0, 8) },
    { texture: 'piglin/piglin', u: 39, v: 6, from: [-1, 0, -2], size: [1, 5, 4], offset: [-4.5, -6, 0], rot: [0, 0, Math.PI / 6], place: flipX180(8, 0, 8) }]),
}
for (const w of ['', 'exposed_', 'weathered_', 'oxidized_']) ENTITY[`waxed_${w}copper_chest`] = ENTITY[`${w}copper_chest`]
// The shield: a board and a handle, turned to face the viewer (the item flips Y and Z).
const shieldAt = p => { const q = flipX180(8, 8, 8)(p); return [8 + (q[0] - 8) * 0.85 - 2.5, 8 + (q[1] - 8) * 0.85 - 5.5, 8 + (q[2] - 8) * 0.85] }   // a little smaller, as the game shows it in a slot
ENTITY.shield = entity('item/shield', [
  { texture: 'shield/shield_base_nopattern', u: 0, v: 0, from: [-6, -11, -2], size: [12, 22, 1], place: shieldAt },
  { texture: 'shield/shield_base_nopattern', u: 26, v: 0, from: [-1, -3, -1], size: [2, 6, 6], place: shieldAt }])
// The dragon head: the head part is moved up and shrunk to 3/4 size, with the jaw hanging from it (from the game's DragonHeadModel).
{
  const t = 'enderdragon/dragon', item = flipX180(8, 0, 8)
  const head = p => item([p[0] * 0.75, p[1] * 0.75 - 7.986666, p[2] * 0.75]), jaw = p => head([p[0], p[1] + 4, p[2] - 8])
  ENTITY.dragon_head = entity('item/dragon_head', [
    { texture: t, u: 176, v: 44, from: [-6, -1, -24], size: [12, 5, 16], place: head },
    { texture: t, u: 112, v: 30, from: [-8, -8, -10], size: [16, 16, 16], place: head },
    { texture: t, u: 0, v: 0, from: [-5, -12, -4], size: [2, 4, 6], place: head },
    { texture: t, u: 112, v: 0, from: [-5, -3, -22], size: [2, 2, 4], place: head },
    { texture: t, u: 0, v: 0, from: [3, -12, -4], size: [2, 4, 6], place: head },
    { texture: t, u: 112, v: 0, from: [3, -3, -22], size: [2, 2, 4], place: head },
    { texture: t, u: 176, v: 65, from: [-6, 0, -16], size: [12, 4, 16], place: jaw }])
}
// Copper golem statues: the golem standing (body, head with nose, antenna and bulb, arms and legs), from the game's CopperGolemModel.
for (const [w, tex] of [['', 'copper_golem'], ['exposed_', 'copper_golem_exposed'], ['weathered_', 'copper_golem_weathered'], ['oxidized_', 'copper_golem_oxidized']]) {
  const t = `copper_golem/${tex}`, place = p => [p[0] + 8, p[1] + 24, p[2] + 8]   // the item flip and the 180 degree turn in its display cancel out
  ENTITY[`${w}copper_golem_statue`] = ENTITY[`waxed_${w}copper_golem_statue`] = entity('item/template_copper_golem_statue', [
    { texture: t, u: 0, v: 15, from: [-4, -6, -3], size: [8, 6, 6], offset: [0, -5, 0], place },
    { texture: t, u: 0, v: 0, from: [-4, -5, -5], size: [8, 5, 10], offset: [0, -11, 0], place },
    { texture: t, u: 56, v: 0, from: [-1, -2, -6], size: [2, 3, 2], offset: [0, -11, 0], place },
    { texture: t, u: 37, v: 8, from: [-1, -9, -1], size: [2, 4, 2], offset: [0, -11, 0], place },
    { texture: t, u: 37, v: 0, from: [-2, -13, -2], size: [4, 4, 4], offset: [0, -11, 0], place },
    { texture: t, u: 36, v: 16, from: [-3, -1, -2], size: [3, 10, 4], offset: [-4, -11, 0], place },
    { texture: t, u: 50, v: 16, from: [0, -1, -2], size: [3, 10, 4], offset: [4, -11, 0], place },
    { texture: t, u: 0, v: 27, from: [-4, 0, -2], size: [4, 5, 4], offset: [0, -5, 0], place },
    { texture: t, u: 16, v: 27, from: [0, 0, -2], size: [4, 5, 4], offset: [0, -5, 0], place }])
}
// The decorated pot: four painted sides, a top and bottom, and the neck (turned upside down onto the top, as the game does).
{
  const side = 'decorated_pot/decorated_pot_side', base = 'decorated_pot/decorated_pot_base'
  const sideUv = [[1, 0], [15, 0], [15, 16], [1, 16]], neck = p => [p[0], 37 - p[1], 16 - p[2]]
  ENTITY.decorated_pot = entity('item/decorated_pot', [
    { texture: base, u: 0, v: 0, from: [4, 17, 4], size: [8, 3, 8], inflate: -0.1, place: neck },
    { texture: base, u: 0, v: 5, from: [5, 20, 5], size: [6, 1, 6], place: neck }], [
    { texture: side, pts: [[1, 16, 15], [15, 16, 15], [15, 0, 15], [1, 0, 15]], uv: sideUv },   // south (front)
    { texture: side, pts: [[15, 16, 1], [1, 16, 1], [1, 0, 1], [15, 0, 1]], uv: sideUv },    // north
    { texture: side, pts: [[15, 16, 15], [15, 16, 1], [15, 0, 1], [15, 0, 15]], uv: sideUv }, // east
    { texture: side, pts: [[1, 16, 1], [1, 16, 15], [1, 0, 15], [1, 0, 1]], uv: sideUv },     // west
    { texture: base, pts: [[1, 16, 1], [15, 16, 1], [15, 16, 15], [1, 16, 15]], uv: [[14, 13], [28, 13], [28, 27], [14, 27]] },
    { texture: base, pts: [[1, 0, 15], [15, 0, 15], [15, 0, 1], [1, 0, 1]], uv: [[0, 13], [14, 13], [14, 27], [0, 27]] }])
}
for (const c of Object.keys(DYE)) { ENTITY[`${c}_shulker_box`] = shulker3d(`shulker/shulker_${c}`); ENTITY[`${c}_banner`] = banner3d(c) }

// Flat stand-ins for things drawn from entity models that aren't modelled above (the shield), or if a 3D one fails.
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
  SPECIAL[`${c}_banner`] = async () => { const e = tex(`block/${c}_wool`); return e ? px(e.getData()) : null }   // banners if the 3D one fails: their colour

// ---- one icon per item, trying the way the game draws it first
const toPng = async t => (t ? png(t.w, t.h, t.data) : null)
const tinted = (f, c) => (f && c ? { ...f, data: Buffer.from(f.data.map((v, i) => (i % 4 === 3 ? v : v * c[i % 4] / 255))) } : f)
async function iconFor(n) {
  if (ENTITY[n]) { const t = await ENTITY[n]().catch(() => null); if (t) return { buf: await toPng(t), kind: '3d' } }
  const s = await seriesIcon(n); if (s) return { buf: s, kind: 'animated' }
  const node = pick(readJson(`assets/minecraft/items/${n}.json`)?.model)
  if (node?.type === 'minecraft:composite') {
    const parts = (node.models || []).map(m => ({ ref: pick(m)?.model, at: m.transformation }))
    if (parts.every(p => typeof p.ref === 'string')) { const b = await blockIcon(parts); if (b) return { buf: b, kind: '3d' } }
  }
  if (node?.type === 'minecraft:model' && typeof node.model === 'string') {
    const c = chain(node.model)
    if (c.flat) { const f = await flatIcon(node.model, node.tints); if (f) return { buf: f, kind: 'flat' } }
    else if (c.elements) { const b = await blockIcon([{ ref: node.model, at: node.transformation }], node.tints); if (b) return { buf: b, kind: '3d' } }
  }
  if (SPECIAL[n]) { const t = await SPECIAL[n]().catch(() => null); if (t) return { buf: await toPng(t), kind: 'flat' } }
  if (node?.type === 'minecraft:special' && typeof node.base === 'string') {   // something we don't model (copper golem statues): the texture its model names
    const tx = chain(node.base).textures, t = resolveRef(tx, tx.particle)
    if (typeof t === 'string' && await anim(t)) return { buf: await encode([t], get => get(t)), kind: 'flat' }
  }
  // Last resort: a texture with the item's name, or the block's own side or front.
  for (const t of [`item/${n}`, `block/${n}`, `block/${n}_side`, `block/${n}_front`, `block/${n}_top`]) {
    if (await anim(t)) return { buf: await encode([t], get => tinted(get(t), TINT[t.split('/').pop()])), kind: 'flat' }
  }
  return null
}
// Items that always shimmer get the game's enchantment glint sliding across them, looping every couple of seconds.
const GLINT = new Set(['enchanted_book', 'written_book', 'enchanted_golden_apple', 'experience_bottle', 'nether_star', 'end_crystal', 'debug_stick'])
async function glint(buf) {
  const g = await loadTex('minecraft:misc/enchanted_glint_item'); if (!g) return buf
  let { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width < 64) {   // flat items: scale up (keeping their pixels sharp) so the glint can be smooth across them, like in game
    const up = await sharp(buf).ensureAlpha().resize(64, 64, { kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true }); data = up.data; info = up.info
  }
  // The game's glint (TextureTransform.setupGlintTexturing, at the default glint speed and strength): the 128px texture, turned 10 degrees,
  // slides up through one full repeat every 7.5 seconds (its slow sideways drift would take 27.5 s, so it's left out to loop cleanly),
  // and is added on top, about as strongly as it looks in game (checked against in-game screenshots).
  const texel = (x, y) => { const k = ((((y % g.h) + g.h) % g.h) * g.w + (((x % g.w) + g.w) % g.w)) * 4; return [g.data[k], g.data[k + 1], g.data[k + 2]] }
  const sample = (u, v) => {   // smooth (bilinear), like the game's blurred glint texture, wrapping at the edges
    const x = u * g.w - 0.5, y = v * g.h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
    const a = texel(x0, y0), b = texel(x0 + 1, y0), c = texel(x0, y0 + 1), d = texel(x0 + 1, y0 + 1)
    return [0, 1, 2].map(i => (a[i] * (1 - fx) + b[i] * fx) * (1 - fy) + (c[i] * (1 - fx) + d[i] * fx) * fy)
  }
  const w = info.width, h = info.height, N = 60, SPAN = 0.25, STRENGTH = 0.4, cos = Math.cos(0.1745), sin = Math.sin(0.1745), frames = []
  for (let f = 0; f < N; f++) {
    const out2 = Buffer.from(data), rise = f / N
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (!data[i + 3]) continue
      const u = (x + 0.5) / w * SPAN, v = (y + 0.5) / h * SPAN
      const s2 = sample(u * cos - v * sin, u * sin + v * cos + rise)
      for (let c = 0; c < 3; c++) out2[i + c] = Math.min(255, Math.round(data[i + c] + s2[c] * STRENGTH))   // added straight on, as bright as the game's
    }
    frames.push({ w, h, data: out2 })
  }
  return apng(frames, frames.map(() => 125))   // 60 frames x 125 ms = the game's 7.5 s cycle
}
const names = [], missing = [], counts = { '3d': 0, flat: 0, animated: 0 }
for (const n of itemDefs) {
  let r = null
  try { r = await iconFor(n) } catch (e) { console.log(`Couldn't draw ${n}: ${e.message}`) }
  if (!r?.buf) { missing.push(n); continue }
  if (GLINT.has(n)) r.buf = await glint(r.buf)
  fs.writeFileSync(path.join(out, n + '.png'), r.buf); names.push(n)
  counts[r.buf.includes(Buffer.from('acTL')) ? 'animated' : r.kind]++
}
// Coloured potions and tipped arrows, one per effect, named like potion_healing and tipped_arrow_poison.
// The colours are the effects' own (they live in the game's code, not its assets); turtle master mixes slowness and resistance.
const POTIONS = { night_vision: 0xC2FF66, invisibility: 0xF6F6F6, leaping: 0xFDFF84, fire_resistance: 0xFF9900, swiftness: 0x33EBFF, slowness: 0x8BAFE0,
  turtle_master: 0x8D7DE3, water_breathing: 0x98DAC0, healing: 0xF82423, harming: 0xA9656A, poison: 0x87A363, regeneration: 0xCD5CAB, strength: 0xFFC700,
  weakness: 0x484D48, luck: 0x59C106, slow_falling: 0xF3CFB9, wind_charged: 0xBDC9FF, weaving: 0x78695A, oozing: 0x99FFA3, infested: 0x8C9B8C }
if (!ONLY || [...ONLY].some(n => /potion|arrow/.test(n))) for (const base of ['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow']) {
  const node = pick(readJson(`assets/minecraft/items/${base}.json`)?.model); if (node?.type !== 'minecraft:model') continue
  for (const [effect, colour] of Object.entries(POTIONS)) {
    const tints = [{ type: 'minecraft:constant', value: colour }, ...(node.tints || []).slice(1)]
    const buf = await flatIcon(node.model, tints); if (!buf) continue
    fs.writeFileSync(path.join(out, `${base}_${effect}.png`), buf); names.push(`${base}_${effect}`); counts.flat++
  }
}
if (missing.length) console.log(`No icon for ${missing.length} item(s): ${missing.join(', ')}`)
if (!ONLY) fs.writeFileSync(path.join('public', 'mc', 'index.json'), JSON.stringify(names))
console.log(`Wrote ${names.length} item icons to public/mc/item: ${counts['3d']} 3D, ${counts.flat} flat, ${counts.animated} animated`)

// Default player faces (the game gives a player without a skin one of these, picked from their UUID): head plus hat layer, 8x8.
{
  const fdir = path.join('public', 'mc', 'face'); fs.mkdirSync(fdir, { recursive: true }); let made = 0
  for (const n of ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri']) {
    const e = zip.getEntry(`assets/minecraft/textures/entity/player/wide/${n}.png`); if (!e) continue
    const base = await px(e.getData(), [8, 8, 8, 8]), hat = await px(e.getData(), [40, 8, 8, 8])
    for (let i = 0; i < base.data.length; i += 4) if (hat.data[i + 3] > 8) for (let k = 0; k < 4; k++) base.data[i + k] = hat.data[i + k]
    fs.writeFileSync(path.join(fdir, n + '.png'), await png(8, 8, base.data)); made++
  }
  console.log(`Wrote ${made} default player faces to public/mc/face`)
}

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

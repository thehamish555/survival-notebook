// The pictures for things that look different in each world, or that have a texture of their own: a player head's skin, a banner's patterns,
// a villager's clothes, an item's icon, a painting and each mob's texture. Made once per key and shared.
import * as THREE from 'three'
import { apiBytes } from '@/lib/api'

// DyeColor's texture colours, as the game tints banner layers
const DYE: Record<string, string> = {
  white: '#F9FFFE', orange: '#F9801D', magenta: '#C74EBD', light_blue: '#3AB3DA', yellow: '#FED83D', lime: '#80C71F', pink: '#F38BAA', gray: '#474F52',
  light_gray: '#9D9D97', cyan: '#169C9C', purple: '#8932B8', blue: '#3C44AA', brown: '#835432', green: '#5E7C16', red: '#B02E26', black: '#1D1D21',
}
const SAFE = /^[a-z0-9_]+$/, SAFE_PATH = /^[a-z0-9_]+(\/[a-z0-9_]+)*$/

const image = (url: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url })
const canvasOf = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
/** A picture as a canvas, so all kinds come out the same. */
const copy = (pic: CanvasImageSource & { width: number; height: number }) => { const c = canvasOf(pic.width, pic.height); c.getContext('2d')!.drawImage(pic, 0, 0); return c }

/** A pattern layer in its dye colour, the way the game tints it: the grey picture times the colour, keeping its see-through parts. */
function paint(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, colour: string) {
  const t = canvasOf(w, h), g = t.getContext('2d')!
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = colour; g.fillRect(0, 0, w, h)
  g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0)
  ctx.drawImage(t, 0, 0)
}

async function banner(base: string, layers: [string, string][]) {
  const cloth = await image('/mc/entity/banner/base.png'), w = cloth.width, h = cloth.height
  const c = canvasOf(w, h), ctx = c.getContext('2d')!
  paint(ctx, cloth, w, h, DYE[base] || DYE.white)
  for (const [pattern, colour] of layers) {
    if (!SAFE.test(pattern)) continue
    try { paint(ctx, await image(`/mc/entity/banner/${pattern}.png`), w, h, DYE[colour] || DYE.white) } catch { /* a pattern from a newer version: skipped */ }
  }
  return c
}

async function skin(key: string) {
  try { return copy(await createImageBitmap(new Blob([await apiBytes(`/skins/${encodeURIComponent(key)}`)], { type: 'image/png' }))) }
  catch { return copy(await image('/mc/entity/steve.png')) }   // offline or unknown: Steve, like the game
}

/** A villager or zombie villager painted like the game: the base, its biome's clothes, then its job's (babies have their own biome clothes and no job). */
async function villager(kind: 'villager' | 'zombie_villager', type: string, job: string) {
  const baby = job === 'baby', base = await image(`/mc/entity/${kind}/${kind}${baby ? '_baby' : ''}.png`), w = base.width, h = base.height
  const c = canvasOf(w, h), ctx = c.getContext('2d')!
  ctx.drawImage(base, 0, 0)
  for (const layer of [SAFE.test(type) && `${baby ? 'baby' : 'type'}/${type}`, !baby && SAFE.test(job) && job !== 'none' && `profession/${job}`]) {
    if (layer) try { ctx.drawImage(await image(`/mc/entity/${kind}/${layer}.png`), 0, 0, w, h) } catch { /* a biome or job from a newer version: left plain */ }
  }
  return c
}

/** An item's icon, for what's in an item frame, at 64 pixels with its pixels kept sharp. */
async function item(id: string) {
  const c = canvasOf(64, 64), ctx = c.getContext('2d')!
  if (!SAFE.test(id)) return c
  const pic = await image(`/mc/item/${id}.png`)
  ctx.imageSmoothingEnabled = false; ctx.drawImage(pic, 0, 0, 64, 64)
  return c
}

/** A picture file as it is: a mob's texture ("tex:cow/cow_warm") or a painting ("paint:kebab"). */
async function file(dir: string, path: string) {
  if (!SAFE_PATH.test(path)) throw new Error('Bad picture name')
  return copy(await image(`/mc/${dir}/${path}.png`))
}

// DyeColor's text colours, for sign text
const TEXT: Record<string, number> = {
  white: 0xFFFFFF, orange: 0xFF681F, magenta: 0xFF00FF, light_blue: 0x9AC0CD, yellow: 0xFFFF00, lime: 0xBFFF00, pink: 0xFF69B4, gray: 0x808080,
  light_gray: 0xD3D3D3, cyan: 0x00FFFF, purple: 0xA020F0, blue: 0x0000FF, brown: 0x8B4513, green: 0x00FF00, red: 0xFF0000, black: 0x000000,
}
let font: Promise<{ img: HTMLImageElement; widths: number[] }> | null = null
/** The game's letters (font/ascii.png, 16 x 16 cells) and how wide each one is: up to its last coloured column, plus a gap. */
function loadFont() {
  font ||= image('/mc/font/ascii.png').then(img => {
    const c = canvasOf(img.width, img.height), g = c.getContext('2d')!, cell = img.width / 16
    g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, img.width, img.height).data, widths: number[] = []
    for (let ch = 0; ch < 256; ch++) {
      let w = 0
      for (let x = 0; x < cell; x++) for (let y = 0; y < cell; y++) if (px[(((ch >> 4) * cell + y) * img.width + (ch & 15) * cell + x) * 4 + 3] > 0) w = x + 1
      widths.push(ch === 32 ? 3 : w)
    }
    return { img, widths: widths.map(w => w * 8 / cell) }
  })
  font.catch(() => { font = null })
  return font
}
/** A sign's four lines in the game's letters: centred, line by line, at 4 canvas pixels to a letter pixel. Glowing text gets the light outline. */
async function sign(width: number, lineHeight: number, colour: string, glow: boolean, lines: string[]) {
  const { img, widths } = await loadFont(), S = 4, cell = img.width / 16
  const c = canvasOf(width * S, 4 * lineHeight * S), ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const base = TEXT[colour] ?? 0, scale = (v: number, f: number) => ((((v >> 16) & 255) * f) << 16) | ((((v >> 8) & 255) * f) << 8) | ((v & 255) * f)
  const dark = colour === 'black' && glow ? 0xF0EBCC : scale(base, 0.4), main = glow ? base : dark
  const tinted = (rgb: number) => {   // the letters in one colour
    const t = canvasOf(img.width, img.height), g = t.getContext('2d')!
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#' + rgb.toString(16).padStart(6, '0'); g.fillRect(0, 0, t.width, t.height)
    return t
  }
  const write = (sheet: HTMLCanvasElement, dx: number, dy: number) => lines.forEach((line, i) => {
    const chars = [...line], w = chars.reduce((n, ch) => n + (ch.charCodeAt(0) < 256 ? widths[ch.charCodeAt(0)] + 1 : 6), 0) - 1
    let x = Math.round((width - w) / 2)
    for (const ch of chars) {
      const code = ch.charCodeAt(0)
      if (code < 256) { ctx.drawImage(sheet, (code & 15) * cell, (code >> 4) * cell, cell, cell, (x + dx) * S, (i * lineHeight + dy) * S, 8 * S, 8 * S); x += widths[code] + 1 }
      else { ctx.font = `${8 * S}px monospace`; ctx.fillStyle = '#' + main.toString(16).padStart(6, '0'); ctx.fillText(ch, (x + dx) * S, (i * lineHeight + dy + 7) * S); x += 6 }   // a letter the pixel font doesn't have
    }
  })
  if (glow) { const o = tinted(dark); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) write(o, dx, dy) }
  write(tinted(main), 0, 0)
  return c
}

const made = new Map<string, Promise<THREE.Texture>>()
/** The texture for a mesh's custom part. Its uv is in picture pixels, so the texture scales them to fit; mob textures' uv is already 0..1. */
export function pictureFor(key: string): Promise<THREE.Texture> {
  if (!made.has(key)) {
    const [kind, a, b, ...rest] = key.replace(/#clear$/, '').split(':')
    const draw = kind === 'sign' ? sign(Number(a), Number(b), rest[0], rest[1] === '1', (rest[2] || '').split('|').map(decodeURIComponent)) : kind === 'skin' ? skin(a) : kind === 'villager' || kind === 'zombie_villager' ? villager(kind, a, b || 'none') : kind === 'item' ? item(a)
      : kind === 'tex' ? file('entity', a) : kind === 'paint' ? file('painting', a)
      : banner(a, [b, ...rest].join(':').split(',').filter(Boolean).map(p => p.split('/') as [string, string]))
    made.set(key, draw.then(c => {
      const t = new THREE.CanvasTexture(c)
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace
      const unit = kind === 'tex' || kind === 'villager' || kind === 'zombie_villager'
      t.repeat.set(unit ? 1 : 1 / c.width, unit ? -1 : -1 / c.height); t.offset.set(0, 1)
      return t
    }))
    made.get(key)!.catch(() => made.delete(key))   // try again next time
  }
  return made.get(key)!
}

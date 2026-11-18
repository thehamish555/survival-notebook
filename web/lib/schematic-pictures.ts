// The pictures for blocks that look different in each world: a player head's skin and a banner's patterns. Made once per key and shared.
import * as THREE from 'three'
import { apiBytes } from '@/lib/api'

// DyeColor's texture colours, as the game tints banner layers
const DYE: Record<string, string> = {
  white: '#F9FFFE', orange: '#F9801D', magenta: '#C74EBD', light_blue: '#3AB3DA', yellow: '#FED83D', lime: '#80C71F', pink: '#F38BAA', gray: '#474F52',
  light_gray: '#9D9D97', cyan: '#169C9C', purple: '#8932B8', blue: '#3C44AA', brown: '#835432', green: '#5E7C16', red: '#B02E26', black: '#1D1D21',
}
const SAFE = /^[a-z0-9_]+$/

const image = (url: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url })
const canvasOf = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

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
  let pic: CanvasImageSource & { width: number; height: number }
  try { pic = await createImageBitmap(new Blob([await apiBytes(`/skins/${encodeURIComponent(key)}`)], { type: 'image/png' })) } catch { pic = await image('/mc/entity/steve.png') }   // offline or unknown: Steve, like the game
  const c = canvasOf(pic.width, pic.height); c.getContext('2d')!.drawImage(pic, 0, 0)
  return c
}

/** A villager painted like the game: the base villager, its biome's clothes, then its job's. */
async function villager(type: string, job: string) {
  const base = await image('/mc/entity/villager/villager.png'), w = base.width, h = base.height
  const c = canvasOf(w, h), ctx = c.getContext('2d')!
  ctx.drawImage(base, 0, 0)
  for (const layer of [SAFE.test(type) && `type/${type}`, SAFE.test(job) && job !== 'none' && `profession/${job}`]) {
    if (layer) try { ctx.drawImage(await image(`/mc/entity/villager/${layer}.png`), 0, 0) } catch { /* a biome or job from a newer version: left plain */ }
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

const made = new Map<string, Promise<THREE.Texture>>()
/** The texture for a mesh's custom part. Its uv is in picture pixels, so the texture scales them to fit. */
export function pictureFor(key: string): Promise<THREE.Texture> {
  if (!made.has(key)) {
    const [kind, a, b] = key.split(':')
    const draw = kind === 'skin' ? skin(a) : kind === 'villager' ? villager(a, b || 'none') : kind === 'item' ? item(a)
      : banner(a, (b || '').split(',').filter(Boolean).map(p => p.split('/') as [string, string]))
    made.set(key, draw.then(c => {
      const t = new THREE.CanvasTexture(c)
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace
      t.repeat.set(1 / c.width, -1 / c.height); t.offset.set(0, 1)
      return t
    }))
  }
  return made.get(key)!
}

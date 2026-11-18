'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, apiBytes } from '@/lib/api'
import { DIM_LABEL, type Dim } from '@/lib/coords'
import { PACKED_RGBA } from '@/lib/mapcolors'
import { useConfirm } from '@/lib/ui'
import { Chips } from '@/components/notebook/widgets'
import { CAT_ICON } from '@/lib/data'
import { timeAgo } from '@/lib/time'

const TILE = 128
type TileInfo = { dim: Dim; tx: number; tz: number; updated: number }
type View = { x: number; z: number; scale: number }   // block at the centre, pixels per block
const COLOURS = ['#5aa9ff', '#ff7a6b', '#b07cff', '#f2c14e', '#4fd1c5', '#ff9ad5', '#9be15d', '#ffa94d']
/** Each player keeps the same colour everywhere (the arrow on the map and their chip). */
// The game's default skins, in its own order: a player with no skin gets DEFAULT[floorMod(uuid.hashCode(), 18)] (slim, then wide; the heads match).
const DEFAULT_FACES = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri']
export function defaultFace(uuid: string): string | null {
  const hex = uuid.replace(/-/g, ''); if (!/^[0-9a-f]{32}$/i.test(hex)) return null
  const hilo = BigInt.asIntN(64, BigInt('0x' + hex.slice(0, 16)) ^ BigInt('0x' + hex.slice(16)))
  const hash = Number(BigInt.asIntN(32, hilo >> 32n)) ^ Number(BigInt.asIntN(32, hilo))   // java.util.UUID.hashCode()
  return DEFAULT_FACES[(((hash % 18) + 18) % 18) % 9]
}
export const playerColour = (uid: string) => COLOURS[[...String(uid)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % COLOURS.length]

async function inflate(buf: ArrayBuffer): Promise<Uint8Array> {
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(s).arrayBuffer())
}
async function tileImage(bytes: Uint8Array): Promise<ImageBitmap | HTMLCanvasElement> {
  const img = new ImageData(TILE, TILE), px = new Uint32Array(img.data.buffer)
  for (let i = 0; i < TILE * TILE && i < bytes.length; i++) px[i] = PACKED_RGBA[bytes[i]]
  if (typeof createImageBitmap === 'function') return createImageBitmap(img)
  const c = document.createElement('canvas'); c.width = c.height = TILE; c.getContext('2d')!.putImageData(img, 0, 0); return c
}
const xyzOf = (s: string) => { const n = (s || '').trim().split(/\s+/).map(Number); return n.length === 3 && n.every(Number.isFinite) ? n : null }

/** The world map recorded by players' mods (opt-in), with saved places as pins. Drag to move, scroll or the buttons to zoom. */
export function MapView({ id, rev, places, role, onPlace, players = [], meId = '' }: { id: string; rev: number; places: any[]; role: string; onPlace: (pid: string) => void; players?: any[]; meId?: string }) {
  const confirm = useConfirm()
  const [tiles, setTiles] = useState<TileInfo[]>([]), [dim, setDim] = useState<Dim>('ow'), [err, setErr] = useState(''), [hover, setHover] = useState<[number, number] | null>(null)
  const view = useRef<View | null>(null), cache = useRef(new Map<string, { at: number; img: ImageBitmap | HTMLCanvasElement | null }>())
  const canvas = useRef<HTMLCanvasElement>(null), drag = useRef<{ x: number; y: number; moved: boolean } | null>(null), [, redraw] = useState(0)

  useEffect(() => { api(`/notebooks/${id}/map`).then((t: TileInfo[]) => { setTiles(t); if (t.length && !t.some(x => x.dim === dim)) setDim(t[0].dim) }).catch(e => setErr(e.message)) }, [id, rev])   // eslint-disable-line react-hooks/exhaustive-deps
  const dims = (['ow', 'nether', 'end'] as Dim[]).filter(k => tiles.some(t => t.dim === k) || players.some(p => p.dim === k))
  const here = players.filter(p => p.dim === dim)
  // Pictures the canvas draws: category icons for places, and each player's skin (their face is cut from it). Loaded once, then the map redraws.
  const pics = useRef(new Map<string, CanvasImageSource | null>())
  const pic = (key: string, load: () => Promise<CanvasImageSource>) => {
    if (!pics.current.has(key)) { pics.current.set(key, null); load().then(img => { pics.current.set(key, img); redraw(n => n + 1) }).catch(() => {}) }
    return pics.current.get(key) || null
  }
  const facePic = (name: string) => pic('face:' + name, () => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = `/mc/face/${name}.png` }))
  const iconPic = (name: string) => pic('icon:' + name, () => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = `/mc/item/${name}.png` }))
  // A face: the skin's head front plus its hat layer. Old 64x32 skins fill the hat with solid colour, and the game skips a hat with no see-through pixels, so we do too.
  const skinPic = (uuid: string) => (uuid ? pic('skin:' + uuid, () => apiBytes(`/notebooks/${id}/skin/${uuid}`).then(b => createImageBitmap(new Blob([b], { type: 'image/png' }))).then(img => {
    const c = document.createElement('canvas'); c.width = c.height = 8
    const g = c.getContext('2d')!; g.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8)
    const hat = document.createElement('canvas'); hat.width = hat.height = 8
    const h = hat.getContext('2d')!; h.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8)
    const a = h.getImageData(0, 0, 8, 8).data
    if ([...a.keys()].some(i => i % 4 === 3 && a[i] < 255)) g.drawImage(hat, 0, 0)
    return c
  })) : null)
  const mine = tiles.filter(t => t.dim === dim)

  // Start centred on the middle of what has been mapped in this dimension
  useEffect(() => {
    if (!mine.length) { const p = here[0]; if (p && !view.current) { view.current = { x: p.x, z: p.z, scale: 1 }; redraw(n => n + 1) } return }   // nothing mapped yet: start on a player
    const xs = mine.map(t => t.tx), zs = mine.map(t => t.tz)
    view.current = { x: ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * TILE, z: ((Math.min(...zs) + Math.max(...zs) + 1) / 2) * TILE, scale: 1 }
    redraw(n => n + 1)
  }, [dim, tiles.length > 0])   // eslint-disable-line react-hooks/exhaustive-deps

  const pins = places.map(p => ({ p, at: xyzOf(p[dim]) })).filter(x => x.at) as { p: any; at: number[] }[]

  const draw = useCallback(() => {
    const c = canvas.current, v = view.current; if (!c || !v) return
    const ctx = c.getContext('2d')!, w = c.width = c.clientWidth * devicePixelRatio, h = c.height = c.clientHeight * devicePixelRatio, k = v.scale * devicePixelRatio
    ctx.fillStyle = getComputedStyle(c).getPropertyValue('--field').trim() || '#0f1114'; ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = false
    const sx = (x: number) => (x - v.x) * k + w / 2, sz = (z: number) => (z - v.z) * k + h / 2
    for (const t of mine) {
      const x = sx(t.tx * TILE), y = sz(t.tz * TILE), size = TILE * k
      if (x > w || y > h || x + size < 0 || y + size < 0) continue
      const key = `${t.dim}/${t.tx}/${t.tz}`, got = cache.current.get(key)
      if (got?.img) ctx.drawImage(got.img, x, y, size, size)
      if (!got || got.at !== t.updated) {   // fetch (or refresh) this tile, then draw again
        cache.current.set(key, { at: t.updated, img: got?.img ?? null })
        apiBytes(`/notebooks/${id}/map/${key}?v=${t.updated}`).then(inflate).then(tileImage).then(img => { cache.current.set(key, { at: t.updated, img }); redraw(n => n + 1) }).catch(() => {})
      }
    }
    ctx.font = `${12 * devicePixelRatio}px system-ui, sans-serif`
    for (const { p, at } of pins) {
      const x = sx(at[0] + 0.5), y = sz(at[2] + 0.5), r = 9 * devicePixelRatio, img = iconPic(p.icon || CAT_ICON[p.cat] || 'paper')
      ctx.fillStyle = '#000a'; ctx.beginPath(); ctx.arc(x, y, r + 2 * devicePixelRatio, 0, Math.PI * 2); ctx.fill()
      if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2)
      else { ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x, y, 4 * devicePixelRatio, 0, Math.PI * 2); ctx.fill() }
      const label = p.name || 'Unnamed place'; ctx.lineWidth = 3 * devicePixelRatio; ctx.strokeText(label, x + r + 3, y + 4); ctx.fillStyle = '#fff'; ctx.fillText(label, x + r + 3, y + 4)
    }
    for (const pl of [...here].sort((a, b) => Number(a.online) - Number(b.online))) {   // offline first, so people online draw on top
      const d = devicePixelRatio, x = sx(pl.x), y = sz(pl.z), f = 18 * d, col = pl.online ? playerColour(pl.uid) : '#6b6f78', a = (pl.yaw || 0) * Math.PI / 180
      ctx.globalAlpha = pl.online ? 1 : 0.6
      if (pl.online) {   // pointer: a little triangle just outside the frame
        const dx = -Math.sin(a), dz = Math.cos(a), nx = -dz, nz = dx, r0 = f / 2 + 4 * d, r1 = r0 + 7 * d
        ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 * d
        ctx.beginPath(); ctx.moveTo(x + dx * r1, y + dz * r1); ctx.lineTo(x + dx * r0 + nx * 5 * d, y + dz * r0 + nz * 5 * d); ctx.lineTo(x + dx * r0 - nx * 5 * d, y + dz * r0 - nz * 5 * d); ctx.closePath(); ctx.fill(); ctx.stroke()
      }
      ctx.fillStyle = '#000'; ctx.fillRect(x - f / 2 - 3 * d, y - f / 2 - 3 * d, f + 6 * d, f + 6 * d)
      ctx.fillStyle = col; ctx.fillRect(x - f / 2 - 2 * d, y - f / 2 - 2 * d, f + 4 * d, f + 4 * d)
      const fallback = pl.mcUuid ? defaultFace(pl.mcUuid) : null
      const skin = skinPic(pl.mcUuid) || (fallback ? facePic(fallback) : null)   // no skin (offline-mode servers): the same default face the game shows
      if (skin) ctx.drawImage(skin, x - f / 2, y - f / 2, f, f)
      else { ctx.fillStyle = '#20232a'; ctx.fillRect(x - f / 2, y - f / 2, f, f); ctx.fillStyle = col; ctx.font = `700 ${11 * d}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText((pl.name || '?')[0].toUpperCase(), x, y + 4 * d); ctx.textAlign = 'left' }
      const label = (pl.uid === meId ? `${pl.name} (you)` : pl.name) + (pl.online ? '' : ` · ${timeAgo(pl.ts)}`)
      ctx.font = `600 ${12 * d}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3 * d; ctx.strokeStyle = '#000'
      ctx.strokeText(label, x, y - f / 2 - 8 * d); ctx.fillStyle = pl.online ? col : '#c8cbd2'; ctx.fillText(label, x, y - f / 2 - 8 * d); ctx.textAlign = 'left'
      ctx.globalAlpha = 1
    }
  }, [mine, pins, id, here, meId])
  useEffect(draw)
  useEffect(() => { const r = () => draw(); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [draw])

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const c = canvas.current!, v = view.current!, b = c.getBoundingClientRect()
    return [v.x + (e.clientX - b.left - b.width / 2) / v.scale, v.z + (e.clientY - b.top - b.height / 2) / v.scale]
  }
  const zoom = (f: number, at?: { clientX: number; clientY: number }) => {
    const v = view.current; if (!v) return
    const next = Math.min(16, Math.max(1 / 16, v.scale * f))
    if (at) { const [wx, wz] = toWorld(at); v.x = wx - (wx - v.x) * (v.scale / next); v.z = wz - (wz - v.z) * (v.scale / next) }
    v.scale = next; redraw(n => n + 1)
  }
  useEffect(() => {   // wheel zoom needs a non-passive listener so the page doesn't scroll
    const c = canvas.current; if (!c) return
    const h = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.25 : 0.8, e) }
    c.addEventListener('wheel', h, { passive: false }); return () => c.removeEventListener('wheel', h)
  })
  const pinAt = (e: React.PointerEvent) => {
    const v = view.current!, [wx, wz] = toWorld(e)
    return pins.find(({ at }) => Math.hypot(at[0] + 0.5 - wx, at[2] + 0.5 - wz) * v.scale < 9)
  }
  const prune = async () => {
    if (!(await confirm({ title: 'Clear old tiles?', body: 'Removes parts of the map nobody has been to for 90 days. Anything within 256 blocks of a saved place stays. This also happens by itself once a day.', ok: 'Clear old tiles' }))) return
    api(`/notebooks/${id}/map/prune`, 'POST').then((r: any) => setErr(r.removed ? '' : 'Nothing old enough to clear.')).catch(e => setErr(e.message))
  }
  const clear = async () => { if (await confirm({ title: 'Clear the map?', body: 'Every tile is deleted for everyone. It fills in again as players with map sharing on explore.', ok: 'Clear map', danger: true })) await api(`/notebooks/${id}/map`, 'DELETE').catch(e => setErr(e.message)) }

  return <div className="card">
    <div className="row"><h2 className="grow">Map</h2>
      {dims.length > 1 && <Chips label="Dimension" noAll value={dim} opts={dims.map(k => [k, DIM_LABEL[k]])} onChange={(v: Dim) => setDim(v)} />}
      <button className="ghost" onClick={() => zoom(1.5)} title="Zoom in">+</button><button className="ghost" onClick={() => zoom(1 / 1.5)} title="Zoom out">−</button></div>
    <p className="mut">Everywhere your team has explored, with your places and where everyone is. Click a place to open it.</p>
    {err && <p className="err">{err}</p>}
    {players.length > 0 && <div className="row" style={{ marginBottom: 8 }}><span className="mut small">Team</span>
      {[...players].sort((a, b) => Number(b.online) - Number(a.online) || b.ts - a.ts).map(p => <button key={p.uid} type="button" className={`chip playerchip ${p.online ? '' : 'off'}`} title={`${p.online ? 'Online now' : `Offline, last seen ${timeAgo(p.ts)}`}. ${DIM_LABEL[p.dim as Dim]} ${Math.floor(p.x)} ${p.y} ${Math.floor(p.z)}. Click to find them on the map.`}
        onClick={() => { setDim(p.dim); view.current = { x: p.x, z: p.z, scale: Math.max(1, view.current?.scale || 1) }; redraw(n => n + 1) }}>
        <i style={{ background: p.online ? playerColour(p.uid) : 'transparent', borderColor: playerColour(p.uid) }} />{p.uid === meId ? `${p.name} (you)` : p.name}<span className="mut small">{DIM_LABEL[p.dim as Dim]} {Math.floor(p.x)} {p.y} {Math.floor(p.z)}</span></button>)}</div>}
    <div className="mapwrap">
      <canvas ref={canvas} className="mapcanvas" onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; (e.target as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={e => {
          if (view.current) { const [x, z] = toWorld(e); setHover([Math.floor(x), Math.floor(z)]) }
          const d = drag.current, v = view.current; if (!d || !v) return
          const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
          v.x -= dx / v.scale; v.z -= dy / v.scale; d.x = e.clientX; d.y = e.clientY; redraw(n => n + 1)
        }}
        onPointerUp={e => { const d = drag.current; drag.current = null; if (d && !d.moved) { const hit = pinAt(e); if (hit) onPlace(hit.p.id) } }}
        onPointerLeave={() => setHover(null)} />
      {hover && <span className="mapcoord">x {hover[0]} · z {hover[1]}</span>}
    </div>
    {role === 'owner' && <div className="row" style={{ marginTop: 10 }}><span className="grow mut small">{tiles.length} tile{tiles.length === 1 ? '' : 's'} recorded.</span><button className="ghost" onClick={prune}>Clear old tiles</button><button className="ghost" onClick={clear}>Clear map</button></div>}
  </div>
}

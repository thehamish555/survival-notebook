'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, apiBytes } from '@/lib/api'
import { DIM_LABEL, type Dim } from '@/lib/coords'
import { PACKED_RGBA } from '@/lib/mapcolors'
import { useConfirm } from '@/lib/ui'
import { Chips } from '@/components/notebook/widgets'

const TILE = 128
type TileInfo = { dim: Dim; tx: number; tz: number; updated: number }
type View = { x: number; z: number; scale: number }   // block at the centre, pixels per block

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
export function MapView({ id, rev, places, role, onPlace }: { id: string; rev: number; places: any[]; role: string; onPlace: (pid: string) => void }) {
  const confirm = useConfirm()
  const [tiles, setTiles] = useState<TileInfo[]>([]), [dim, setDim] = useState<Dim>('ow'), [err, setErr] = useState(''), [hover, setHover] = useState<[number, number] | null>(null)
  const view = useRef<View | null>(null), cache = useRef(new Map<string, { at: number; img: ImageBitmap | HTMLCanvasElement | null }>())
  const canvas = useRef<HTMLCanvasElement>(null), drag = useRef<{ x: number; y: number; moved: boolean } | null>(null), [, redraw] = useState(0)

  useEffect(() => { api(`/notebooks/${id}/map`).then((t: TileInfo[]) => { setTiles(t); if (t.length && !t.some(x => x.dim === dim)) setDim(t[0].dim) }).catch(e => setErr(e.message)) }, [id, rev])   // eslint-disable-line react-hooks/exhaustive-deps
  const dims = (['ow', 'nether', 'end'] as Dim[]).filter(k => tiles.some(t => t.dim === k))
  const mine = tiles.filter(t => t.dim === dim)

  // Start centred on the middle of what has been mapped in this dimension
  useEffect(() => {
    if (!mine.length) return
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
      const x = sx(at[0] + 0.5), y = sz(at[2] + 0.5), r = 5 * devicePixelRatio
      ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * devicePixelRatio
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      const label = p.name || 'Unnamed place'; ctx.lineWidth = 3 * devicePixelRatio; ctx.strokeText(label, x + r + 3, y + 4); ctx.fillStyle = '#fff'; ctx.fillText(label, x + r + 3, y + 4)
    }
  }, [mine, pins, id])
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
    <p className="mut">Drawn by the mod as players explore. Anyone can turn it off with Share map in the mod's Settings. Pins are your saved places in {DIM_LABEL[dim]}. Click one to open it.</p>
    {err && <p className="err">{err}</p>}
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

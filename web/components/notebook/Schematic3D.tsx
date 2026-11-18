'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { fetchFile } from '@/lib/api'
import { readLitematic, type Schematic } from '@/lib/litematic'
import { buildMesh, type BlockData, type MeshPart } from '@/lib/schematic-mesh'

let blockData: Promise<{ data: BlockData; sheet: THREE.Texture }> | null = null
/** The game's block models and textures, loaded once the first time a schematic is opened. */
function loadBlocks() {
  blockData ||= Promise.all([
    fetch('/mc/blocks.json').then(r => { if (!r.ok) throw new Error('Block models are missing'); return r.json() }),
    new THREE.TextureLoader().loadAsync('/mc/blocks.png'),
  ]).then(([data, sheet]) => {
    sheet.magFilter = THREE.NearestFilter; sheet.minFilter = THREE.NearestMipmapLinearFilter; sheet.generateMipmaps = true; sheet.anisotropy = 4;   // close up: crisp pixels; far away: no shimmer
    sheet.colorSpace = THREE.SRGBColorSpace
    return { data, sheet }
  })
  blockData.catch(() => { blockData = null })
  return blockData
}

/** The box around every block that isn't air: [minX, minY, minZ, maxX, maxY, maxZ]. */
function bounds(s: Schematic) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (let y = 0; y < s.Y; y++) for (let z = 0; z < s.Z; z++) for (let x = 0; x < s.X; x++) if (s.data[(y * s.Z + z) * s.X + x]) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z; if (x + 1 > b[3]) b[3] = x + 1; if (y + 1 > b[4]) b[4] = y + 1; if (z + 1 > b[5]) b[5] = z + 1
  }
  return b[0] === Infinity ? [0, 0, 0, s.X, s.Y, s.Z] : b
}

const geometry = (m: MeshPart) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(m.col, 3))
  g.setIndex(new THREE.BufferAttribute(m.idx, 1))
  return g
}

/** A farm's Litematica file in 3D: drag to turn it, scroll to zoom, right-drag to move. The layer slider shows it up to one height, for building it layer by layer. */
export function Schematic3D({ nb, file, title, onClose }: { nb: string; file: { id: string; name: string }; title: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [schem, setSchem] = useState<Schematic | null>(null), [err, setErr] = useState(''), [layer, setLayer] = useState(0), [faces, setFaces] = useState(0)
  const view = useRef<{ scene: THREE.Scene; group: THREE.Group; sheet: THREE.Texture; data: BlockData; render: () => void; follow: (y: number) => void } | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchFile(nb, file.id).then(readLitematic), loadBlocks()])
      .then(([s, b]) => { if (!alive) return; setLayer(s.Y); setSchem(s); start(s, b) })
      .catch(e => alive && setErr(e?.message || 'Couldn’t open this file'))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nb, file.id])

  const cleanup = useRef<() => void>(() => {})
  useEffect(() => () => cleanup.current(), [])
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  function start(s: Schematic, { data, sheet }: { data: BlockData; sheet: THREE.Texture }) {
    const el = host.current!; const w = el.clientWidth, h = el.clientHeight
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h); renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group)
    // Frame the blocks themselves (files often have empty space around the build), seen from above at an angle
    const b = bounds(s), cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2
    const radius = Math.max(2, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2), fov = 40
    const camera = new THREE.PerspectiveCamera(fov, w / h, 0.05, radius * 40 + 100)
    const dist = radius / Math.sin((fov * Math.PI / 180) / 2) * (w < h ? 1.25 : 0.95)
    camera.position.set(cx, cy, cz).add(new THREE.Vector3(1, 0.75, 1.3).normalize().multiplyScalar(dist))
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(cx, cy, cz); controls.enableDamping = true; controls.maxDistance = dist * 4; controls.update()
    const span = Math.ceil(Math.max(b[3] - b[0], b[5] - b[2])) + 4, grid = new THREE.GridHelper(span, span, 0x4a5563, 0x272e36)
    grid.position.set(cx, b[1] - 0.01, cz); scene.add(grid)
    let frame = 0
    const render = () => { renderer.render(scene, camera) }
    const loop = () => { frame = requestAnimationFrame(loop); if (controls.update()) render() }
    controls.addEventListener('change', render); loop()
    const resize = () => { const W = el.clientWidth, H = el.clientHeight; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); render() }
    const ro = new ResizeObserver(resize); ro.observe(el)
    // The layer slider moves the view down with the cut, so the layer you're building stays in the middle
    const follow = (y: number) => { const want = Math.min(cy, Math.max(b[1] + 1, y - 2)), dy = want - controls.target.y; controls.target.y += dy; camera.position.y += dy; controls.update(); render() }
    view.current = { scene, group, sheet, data, render, follow }
    cleanup.current = () => { cancelAnimationFrame(frame); ro.disconnect(); controls.dispose(); clear(group); renderer.dispose(); renderer.domElement.remove() }
  }

  const clear = (group: THREE.Group) => { for (const c of [...group.children]) { group.remove(c); (c as THREE.Mesh).geometry?.dispose() } }

  // (Re)build the model whenever the layer changes, cutting everything above it
  useEffect(() => {
    const v = view.current; if (!v || !schem) return
    const cut = layer >= schem.Y ? schem : { ...schem, data: schem.data.slice(0, layer * schem.X * schem.Z), Y: layer }
    const m = buildMesh(cut, v.data); setFaces(m.faces)
    clear(v.group)
    const solid = new THREE.MeshBasicMaterial({ map: v.sheet, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide })
    const glass = new THREE.MeshBasicMaterial({ map: v.sheet, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    v.group.add(new THREE.Mesh(geometry(m.solid), solid)); if (m.glass.idx.length) v.group.add(new THREE.Mesh(geometry(m.glass), glass))
    v.follow(layer); v.render()
  }, [layer, schem])

  const counts = useMemo(() => schem ? `${schem.X} × ${schem.Y} × ${schem.Z} · ${schem.count.toLocaleString()} blocks` : '', [schem])
  return <div className="modal" onClick={onClose}><div className="card schem" onClick={e => e.stopPropagation()}>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div><h2 style={{ margin: 0 }}>{title}</h2><p className="mut small" style={{ margin: '2px 0 0' }}>{file.name}{counts && ` · ${counts}`}</p></div>
      <button className="ghost" onClick={onClose}>Close</button>
    </div>
    <div className="schemview" ref={host}>{!schem && !err && <p className="mut schemmsg">Loading…</p>}{err && <p className="err schemmsg">{err}</p>}</div>
    {schem && <div className="row schemctl">
      <label className="mut small">Layer</label>
      <input type="range" min={1} max={schem.Y} value={layer} onChange={e => setLayer(Number(e.target.value))} className="grow" />
      <span className="small" style={{ minWidth: 70, textAlign: 'right' }}>{layer >= schem.Y ? 'All' : `${layer} of ${schem.Y}`}</span>
    </div>}
    <p className="mut small" style={{ margin: '6px 0 0' }}>Drag to turn, scroll to zoom, right-drag to move.{faces > 400_000 ? ' This one is big, so it may be slow.' : ''}</p>
  </div></div>
}

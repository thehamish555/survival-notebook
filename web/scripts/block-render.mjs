// Draws a block item the way the inventory does: the block's own model (its cuboids, faces and UVs) turned to the model's "gui" angle.
// Pure JS, nearest-pixel sampling, a depth buffer and simple face shading. Used by extract-icons.mjs.
const DIRS = ['down', 'up', 'north', 'south', 'west', 'east']
const NORMAL = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }

// The four corners of a face, in the order that matches the UV corners (u0,v0) (u1,v0) (u1,v1) (u0,v1).
function corners(dir, [x0, y0, z0], [x1, y1, z1]) {
  switch (dir) {
    case 'up': return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
    case 'down': return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]]
    case 'north': return [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]]
    case 'south': return [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]
    case 'west': return [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]]
    case 'east': return [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]]
  }
}
function defaultUv(dir, [x0, y0, z0], [x1, y1, z1]) {
  switch (dir) {
    case 'down': return [x0, 16 - z1, x1, 16 - z0]
    case 'up': return [x0, z0, x1, z1]
    case 'north': return [16 - x1, 16 - y1, 16 - x0, 16 - y0]
    case 'south': return [x0, 16 - y1, x1, 16 - y0]
    case 'west': return [z0, 16 - y1, z1, 16 - y0]
    case 'east': return [16 - z1, 16 - y1, 16 - z0, 16 - y0]
  }
}
const rad = d => d * Math.PI / 180
const rotX = (a, [x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]
const rotY = (a, [x, y, z]) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]
const rotZ = (a, [x, y, z]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]
const ROT = { x: rotX, y: rotY, z: rotZ }

// An element's own rotation (one axis, about an origin, optionally stretched back to full size).
function elementRot(p, r) {
  if (!r || !r.angle) return p
  const o = r.origin || [8, 8, 8], a = rad(r.angle)
  let q = ROT[r.axis]?.(a, [p[0] - o[0], p[1] - o[1], p[2] - o[2]]) ?? [p[0] - o[0], p[1] - o[1], p[2] - o[2]]
  if (r.rescale) { const s = 1 / Math.cos(Math.abs(a)); q = q.map((v, i) => ('xyz'[i] === r.axis ? v : v * s)) }
  return [q[0] + o[0], q[1] + o[1], q[2] + o[2]]
}

/** model: { elements, textures(name -> {w,h,data} | null), gui: {rotation, translation, scale}, tint(textureName, tintindex) -> [r,g,b] | null }
 *  Returns { w, h, data } RGBA at size x size, or null if nothing was drawn. */
export function renderModel({ elements, texture, gui, tint }, size = 64) {
  const rot = gui?.rotation || [30, 225, 0], tr = gui?.translation || [0, 0, 0], sc = gui?.scale || [0.625, 0.625, 0.625]
  // Model space (0..16) -> centred -> gui scale and rotation (Z, then Y, then X, as the game applies them) -> screen pixels.
  const view = p => {
    let q = [(p[0] - 8) * sc[0], (p[1] - 8) * sc[1], (p[2] - 8) * sc[2]]
    q = rotZ(rad(rot[2]), q); q = rotY(rad(rot[1]), q); q = rotX(rad(rot[0]), q)
    q = [q[0] + tr[0], q[1] + tr[1], q[2] + tr[2]]
    const k = size / 16
    return [size / 2 + q[0] * k, size / 2 - q[1] * k, q[2]]   // screen y goes down
  }
  const turn = n => rotX(rad(rot[0]), rotY(rad(rot[1]), rotZ(rad(rot[2]), n)))
  const data = Buffer.alloc(size * size * 4), depth = new Float32Array(size * size).fill(-Infinity)
  let drawn = 0
  for (const el of elements || []) {
    for (const dir of DIRS) {
      const f = el.faces?.[dir]; if (!f) continue
      const tex = texture(f.texture); if (!tex) continue
      const pts = corners(dir, el.from, el.to).map(p => view(elementRot(p, el.rotation)))
      // Lighting by where the face points after turning: tops brightest, the left side a little darker, the right side darker still.
      let n = NORMAL[dir]; if (el.rotation?.angle) { const o = elementRot([0, 0, 0], { ...el.rotation, origin: [0, 0, 0], rescale: false }); n = elementRot(n, { ...el.rotation, origin: [0, 0, 0], rescale: false }).map((v, i) => v - o[i]) }
      const nn = turn(n)
      if (nn[2] < -1e-4) continue   // facing away
      const shade = el.shade === false ? 1 : Math.min(1, 0.6 + 0.4 * Math.max(0, nn[1]) + 0.25 * Math.max(0, -nn[0]))
      const tc = f.tintindex !== undefined && f.tintindex >= 0 ? tint(f.texture, f.tintindex) : null
      const uv = f.uv || defaultUv(dir, el.from, el.to)
      let uvc = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]
      const steps = ((f.rotation || 0) / 90) & 3
      for (let i = 0; i < steps; i++) uvc = [uvc[3], uvc[0], uvc[1], uvc[2]]   // a rotated face turns its texture clockwise
      // The face is a parallelogram on screen: p = p0 + s*(p1-p0) + t*(p3-p0).
      const [p0, p1, , p3] = pts, ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx = p3[0] - p0[0], by = p3[1] - p0[1], det = ax * by - ay * bx
      if (Math.abs(det) < 1e-6) continue
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
      const minX = Math.max(0, Math.floor(Math.min(...xs))), maxX = Math.min(size - 1, Math.ceil(Math.max(...xs)))
      const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(size - 1, Math.ceil(Math.max(...ys)))
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - p0[0], dy = y + 0.5 - p0[1]
        const s = (dx * by - dy * bx) / det, t = (ax * dy - ay * dx) / det
        if (s < -1e-6 || s > 1 + 1e-6 || t < -1e-6 || t > 1 + 1e-6) continue
        const z = p0[2] + s * (p1[2] - p0[2]) + t * (p3[2] - p0[2]), i = y * size + x
        if (z < depth[i] - 1e-4) continue
        const u = uvc[0][0] + s * (uvc[1][0] - uvc[0][0]) + t * (uvc[3][0] - uvc[0][0])
        const v = uvc[0][1] + s * (uvc[1][1] - uvc[0][1]) + t * (uvc[3][1] - uvc[0][1])
        const tx = Math.min(tex.w - 1, Math.max(0, Math.floor(u / 16 * tex.w - 1e-6))), ty = Math.min(tex.h - 1, Math.max(0, Math.floor(v / 16 * tex.h - 1e-6)))
        const k = (ty * tex.w + tx) * 4, a = tex.data[k + 3]
        if (a < 16) continue   // cut-out pixels (leaves, glass edges) let what's behind show
        depth[i] = z
        const o = i * 4
        for (let c = 0; c < 3; c++) data[o + c] = Math.round(tex.data[k + c] * shade * (tc ? tc[c] / 255 : 1))
        data[o + 3] = a
        drawn++
      }
    }
  }
  return drawn ? { w: size, h: size, data } : null
}

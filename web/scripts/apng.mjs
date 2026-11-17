// A tiny animated PNG (APNG) writer. Browsers play APNG in a normal <img>, and a browser that can't just shows the first frame.
// frames: [{ w, h, data }] RGBA, all the same size; delays: milliseconds per frame.
import { crc32, deflateSync } from 'node:zlib'

const chunk = (type, body) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
const scanlines = ({ w, h, data }) => {   // filter type 0 (none) on every row
  const out = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) data.copy(out, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return deflateSync(out, { level: 9 })
}

export function apng(frames, delays) {
  const { w, h } = frames[0]
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6   // 8-bit RGBA
  const actl = Buffer.alloc(8); actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(0, 4)              // loop forever
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('acTL', actl)]
  let seq = 0
  frames.forEach((f, i) => {
    const fc = Buffer.alloc(26)
    fc.writeUInt32BE(seq++, 0); fc.writeUInt32BE(w, 4); fc.writeUInt32BE(h, 8); fc.writeUInt32BE(0, 12); fc.writeUInt32BE(0, 16)
    fc.writeUInt16BE(Math.max(1, Math.round(delays[i])), 20); fc.writeUInt16BE(1000, 22); fc[24] = 0; fc[25] = 0   // replace the whole frame each time
    parts.push(chunk('fcTL', fc))
    const z = scanlines(f)
    if (i === 0) parts.push(chunk('IDAT', z))
    else { const s = Buffer.alloc(4); s.writeUInt32BE(seq++); parts.push(chunk('fdAT', Buffer.concat([s, z]))) }
  })
  parts.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

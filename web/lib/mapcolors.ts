// Vanilla map colours (net.minecraft.world.level.material.MapColor, Java 26.3), indexed by id. The mod stores id * 4 + shade per block.
export const MAP_COLORS = [0x000000, 0x7fb238, 0xf7e9a3, 0xc7c7c7, 0xff0000, 0xa0a0ff, 0xa7a7a7, 0x007c00, 0xffffff, 0xa4a8b8, 0x976d4d, 0x707070, 0x4040ff, 0x8f7748, 0xfffcf5, 0xd87f33,
  0xb24cd8, 0x6699d8, 0xe5e533, 0x7fcc19, 0xf27fa5, 0x4c4c4c, 0x999999, 0x4c7f99, 0x7f3fb2, 0x334cb2, 0x664c33, 0x667f33, 0x993333, 0x191919, 0xfaee4d, 0x5cdbd5,
  0x4a80ff, 0x00d93a, 0x815631, 0x700200, 0xd1b1a1, 0x9f5224, 0x95576c, 0x706c8a, 0xba8524, 0x677535, 0xa04d4e, 0x392923, 0x876b62, 0x575c5c, 0x7a4958, 0x4c3e5c,
  0x4c3223, 0x4c522a, 0x8e3c2e, 0x251610, 0xbd3031, 0x943f61, 0x5c191d, 0x167e86, 0x3a8e8c, 0x562c3e, 0x14b485, 0x646464, 0xd8af93, 0x7fa796]
const SHADE = [180, 220, 255, 135]   // MapColor.Brightness: LOW, NORMAL, HIGH, LOWEST

/** RGBA for each packed byte (0 = nothing seen, transparent). */
export const PACKED_RGBA: Uint32Array = (() => {
  const out = new Uint32Array(256)
  for (let p = 4; p < 256; p++) {
    const c = MAP_COLORS[p >> 2]; if (c === undefined) continue
    const m = SHADE[p & 3], r = (((c >> 16) & 255) * m / 255) | 0, g = (((c >> 8) & 255) * m / 255) | 0, b = ((c & 255) * m / 255) | 0
    out[p] = (255 << 24) | (b << 16) | (g << 8) | r   // little-endian ImageData order
  }
  return out
})()

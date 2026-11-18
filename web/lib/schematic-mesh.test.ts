import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMesh, modelsFor, type BlockData } from './schematic-mesh'

const cube = (t: number) => ({ b: [[[0, 0, 0], [16, 16, 16], 0, Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east'].map(d => [d, [t, null, 1, 0, 0]]))]] as any })
const data: BlockData = {
  cols: 4, rows: 1, tex: ['stone', 'glass', 'oak_log', 'fence'],
  models: [cube(0), cube(1), cube(2), { b: [[[6, 0, 6], [10, 16, 10], 0, { up: [3, null, 0, 0, 0] }]] as any }, { b: [[[7, 12, 0], [9, 15, 9], 0, { up: [3, null, 0, 0, 0] }]] as any }],
  blocks: {
    stone: { v: [['', { m: 0 }]] }, glass: { v: [['', { m: 1 }]] },
    oak_log: { v: [['axis=x', { m: 2, x: 90, y: 90 }], ['axis=y', { m: 2 }], ['axis=z', { m: 2, x: 90 }]] },
    oak_fence: { mp: [[null, { m: 3 }], [{ north: 'true' }, { m: 4 }], [{ OR: [{ east: 'true' }, { west: 'true' }] }, { m: 4, y: 90 }]] },
  },
}

test('schematic: the block state picks the matching variant or multipart pieces', () => {
  assert.deepEqual(modelsFor(data, { name: 'oak_log', props: { axis: 'z' } }), [{ m: 2, x: 90 }])
  assert.equal(modelsFor(data, { name: 'oak_fence', props: { north: 'true', east: 'false', west: 'false' } }).length, 2)
  assert.equal(modelsFor(data, { name: 'oak_fence', props: { north: 'false', east: 'false', west: 'true' } }).length, 2)
  assert.deepEqual(modelsFor(data, { name: 'unknown_mod_block', props: {} }), [])
})

test('schematic: faces between solid blocks and between glass are hidden', () => {
  const two = (a: number, b: number) => ({ X: 2, Y: 1, Z: 1, palette: [{ name: 'air', props: {} }, { name: 'stone', props: {} }, { name: 'glass', props: {} }], data: new Uint16Array([a, b]), name: '', count: 2 })
  assert.equal(buildMesh(two(1, 0), data).faces, 6)
  assert.equal(buildMesh(two(1, 1), data).faces, 10)     // the two touching faces go
  assert.equal(buildMesh(two(2, 2), data).faces, 10)     // glass next to glass too
  const g = buildMesh(two(1, 2), data)
  assert.equal(g.faces, 11)                              // stone shows through glass, glass is hidden behind stone
  assert.equal(g.glass.idx.length / 6, 5)
})

test('schematic: block entities are baked quads on their full-size texture, tinted where marked', () => {
  const quad = (t: number, tint: number) => [t, tint, 0, 16, 0, 0, 0, 16, 16, 0, 16, 16, 16, 16, 0, 0, 16, 0, 16, 16, 0, 16, 0, 0, 0]
  const d: BlockData = { ...data, rows: 5, big: { 4: [0, 16, 64, 64] }, tex: [...data.tex, 'entity/banner/base'], models: [{ q: [quad(4, 1), quad(4, 0)] }],
    blocks: { red_banner: { v: [['rotation=0', { m: 0 }]], t: [255, 0, 0] } } }
  const m = buildMesh({ X: 1, Y: 1, Z: 1, palette: [{ name: 'air', props: {} }, { name: 'red_banner', props: { rotation: '0' } }], data: new Uint16Array([1]), name: '', count: 1 }, d)
  assert.equal(m.faces, 2)
  assert.deepEqual([...m.solid.uv.slice(0, 2)].map(v => +v.toFixed(4)), [0, +(1 - 16 / 80).toFixed(4)])   // texture pixel (0, 0) of the full-size picture at (0, 16) on an 80 px tall sheet
  assert.deepEqual([m.solid.col[1], m.solid.col[2]], [0, 0])                                              // the tinted one is red
  assert.equal(m.solid.col[12 + 1], m.solid.col[12])                                                     // the other isn't
})

test('schematic: a head with a skin and a banner with patterns get their own picture', () => {
  const quad = (tint: number) => [4, tint, 0, 16, 0, 8, 0, 16, 16, 0, 16, 16, 16, 16, 0, 0, 16, 0, 16, 16, 0, 16, 0, 0, 0]
  const d: BlockData = { ...data, rows: 5, big: { 4: [0, 16, 64, 64] }, tex: [...data.tex, 'x'], models: [{ q: [quad(1), quad(0)] }],
    blocks: { red_banner: { v: [['', { m: 0 }]], t: [255, 0, 0] }, player_head: { v: [['', { m: 0 }]] } } }
  const palette = [{ name: 'air', props: {} }, { name: 'red_banner', props: {} }, { name: 'player_head', props: {} }]
  const tiles = new Map([[0, { patterns: [['stripe_top', 'blue']] as [string, string][] }], [1, { skin: 'Notch' }]])
  const m = buildMesh({ X: 3, Y: 1, Z: 1, palette, data: new Uint16Array([1, 2, 1]), name: '', count: 3, tiles }, d)
  assert.deepEqual(Object.keys(m.custom).sort(), ['banner:red:stripe_top/blue', 'skin:Notch'])
  assert.equal(m.custom['banner:red:stripe_top/blue'].idx.length / 6, 1)   // only the cloth; the pole stays on the sheet
  assert.equal(m.custom['skin:Notch'].idx.length / 6, 2)                    // the whole head
  assert.equal(m.solid.idx.length / 6, 3)                                   // the plain banner, and the patterned one's pole
  assert.deepEqual([...m.custom['skin:Notch'].uv.slice(0, 2)], [8, 0])     // in the skin's own pixels
})

test('schematic: entities are turned to their yaw and placed; ones the viewer can’t draw are counted', () => {
  const front = [-2, 0, 4, 0, 16, 2, 0, 4, 16, 16, 2, 4, 4, 16, 0, -2, 4, 4, 0, 0]   // a square facing +z, at z = 4 px
  const d: BlockData = { ...data, rows: 5, entities: { iron_golem: { q: [[0, 0, ...front]] }, villager: { q: [[0, 0, ...front]], pic: 'villager' } } }
  const ent = (id: string, yaw: number) => ({ id, x: 1.5, y: 0, z: 1.5, yaw })
  const m = buildMesh({ X: 3, Y: 2, Z: 3, palette: [{ name: 'air', props: {} }], data: new Uint16Array(18), name: '', count: 0,
    entities: [ent('iron_golem', 90), { ...ent('villager', 0), villager: ['desert', 'farmer'] as [string, string] }, ent('experience_orb', 0), { ...ent('iron_golem', 0), y: 5 }] }, d)
  // yaw 90 (facing west): the corner 4 px in front (+z) and 2 px to the side (-x) ends up 4 px west and 2 px north
  assert.deepEqual([+(m.solid.pos[0] * 16).toFixed(3), +(m.solid.pos[2] * 16).toFixed(3)], [24 - 4, 24 - 2])
  assert.deepEqual(Object.keys(m.custom), ['villager:desert:farmer'])
  assert.deepEqual(m.missing, { experience_orb: 1 })               // the one above the top isn't drawn or counted
})

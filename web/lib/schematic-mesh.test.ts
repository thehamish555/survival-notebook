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

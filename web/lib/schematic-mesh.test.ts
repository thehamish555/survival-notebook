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
  const d: BlockData = { ...data, rows: 5, entities: { iron_golem: { q: [[0, 0, ...front]] }, 'm:villager': { q: [[-1, 0, ...front]] } } }
  const ent = (id: string, yaw: number) => ({ id, x: 1.5, y: 0, z: 1.5, yaw })
  const m = buildMesh({ X: 3, Y: 2, Z: 3, palette: [{ name: 'air', props: {} }], data: new Uint16Array(18), name: '', count: 0,
    entities: [ent('iron_golem', 90), { ...ent('villager', 0), villager: ['desert', 'farmer'] as [string, string] }, ent('arrow', 0), ent('marker', 0), { ...ent('iron_golem', 0), y: 5 }] }, d)
  // yaw 90 (facing west): the corner 4 px in front (+z) and 2 px to the side (-x) ends up 4 px west and 2 px north
  assert.deepEqual([+(m.solid.pos[0] * 16).toFixed(3), +(m.solid.pos[2] * 16).toFixed(3)], [24 - 4, 24 - 2])
  assert.deepEqual(Object.keys(m.custom), ['villager:desert:farmer'])
  assert.deepEqual(m.missing, { arrow: 1 })                        // markers are invisible anyway; the one above the top isn't drawn or counted
})

test('schematic: slab sides that touch are hidden, like the game; full faces still show', () => {
  const slab = { b: [[[0, 0, 0], [16, 8, 16], 0, Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east'].map(d => [d, [0, null, d === 'up' ? 0 : 1, 0, 0]]))]] as any }
  const d: BlockData = { ...data, models: [...data.models, slab], blocks: { ...data.blocks, stone_slab: { v: [['type=bottom', { m: 5 }]] } } }
  const row = (n: number) => ({ X: n, Y: 1, Z: 1, palette: [{ name: 'air', props: {} }, { name: 'stone_slab', props: { type: 'bottom' } }], data: new Uint16Array(n).fill(1), name: '', count: n })
  assert.equal(buildMesh(row(1), d).faces, 6)
  assert.equal(buildMesh(row(2), d).faces, 10)   // the two half-height sides between them go
})

test('schematic: water is as high as its level, fills waterlogged blocks, and light and barriers are invisible', () => {
  const d: BlockData = { ...data, blocks: { ...data.blocks, water: { fluid: 0, t: [63, 118, 228] }, oak_slab: { v: [['', { m: 0 }]] }, light: { v: [['', { m: 1 }]] } }, models: [...data.models.slice(0, 1), { p: 2 }] }
  const palette = [{ name: 'air', props: {} }, { name: 'water', props: { level: '0' } }, { name: 'water', props: { level: '4' } }, { name: 'oak_slab', props: { waterlogged: 'true' } }, { name: 'light', props: {} }]
  const one = (id: number) => buildMesh({ X: 1, Y: 1, Z: 1, palette, data: new Uint16Array([id]), name: '', count: 1 }, d)
  const top = (m: ReturnType<typeof one>) => Math.max(...[...m.glass.pos].filter((_, i) => i % 3 === 1))
  assert.equal(+top(one(1)).toFixed(3), +(8 / 9).toFixed(3))     // a source block
  assert.equal(+top(one(2)).toFixed(3), +(4 / 9).toFixed(3))     // flowing, four steps from its source
  assert.equal(one(3).glass.idx.length / 6, 6)                    // the slab stands in water
  assert.equal(one(4).faces, 0)                                   // a light block can't be seen
  const two = buildMesh({ X: 2, Y: 1, Z: 1, palette, data: new Uint16Array([1, 3]), name: '', count: 2 }, d)
  assert.equal(two.glass.idx.length / 6, 10)                      // no water wall between the water and the waterlogged slab
})

test('schematic: mobs get their variant\'s texture, and a spawner shows its mob', () => {
  const front = [-2, 0, 4, 0, 16, 2, 0, 4, 16, 16, 2, 4, 4, 16, 0, -2, 4, 4, 0, 0]
  const d: BlockData = { ...data, entities: { 'm:cow': { q: [[-1, 0, ...front]], s: [64, 64] }, 'm:warm_cow_baby': { q: [[-1, 0, ...front]], s: [64, 64] }, 'm:zombie': { q: [[-1, 0, ...front]], s: [64, 64] } } }
  const tiles = new Map([[0, { spawn: 'zombie' }]])
  const m = buildMesh({ X: 2, Y: 1, Z: 1, palette: [{ name: 'air', props: {} }], data: new Uint16Array(2), name: '', count: 0, tiles,
    entities: [{ id: 'cow', x: 1, y: 0, z: 0.5, yaw: 0 }, { id: 'cow', x: 1, y: 0, z: 0.5, yaw: 0, variant: 'warm', baby: true }] }, d)
  assert.deepEqual(Object.keys(m.custom).sort(), ['tex:cow/cow_temperate', 'tex:cow/cow_warm_baby', 'tex:zombie/zombie'])
  assert.deepEqual([...m.custom['tex:cow/cow_temperate'].uv.slice(0, 2)], [0, 16 / 64])   // mob textures are mapped 0..1 of their model's texture size
  assert.ok(Math.max(...m.custom['tex:zombie/zombie'].pos.filter((_, i) => i % 3 === 0)) < 1)   // the zombie is inside its spawner block
  assert.deepEqual(m.missing, {})
})

test('schematic: signs get their text, and armour and held items are drawn on mobs that have them', () => {
  const front = [-2, 0, 4, 0, 16, 2, 0, 4, 16, 16, 2, 4, 4, 16, 0, -2, 4, 4, 0, 0], I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const d: BlockData = { ...data, blocks: { ...data.blocks, oak_sign: { v: [['', { m: 0 }]] } }, held: { t: [[0, 0, 0, 0, 0, 0, 1, 1, 1]], i: { iron_sword: [0, 0, 0, 0] } },
    entities: { 'm:zombie': { q: [[-1, 0, ...front]], s: [64, 64], hands: [I, I] }, 'armor:head': { q: [[-1, 0, ...front]], s: [64, 32] } } }
  const tiles = new Map([[0, { sign: { front: { lines: ['Hi', '', '', ''], colour: 'red', glow: true } } }]])
  const m = buildMesh({ X: 1, Y: 1, Z: 1, palette: [{ name: 'air', props: {} }, { name: 'oak_sign', props: { rotation: '4' } }], data: new Uint16Array([1]), name: '', count: 1, tiles,
    entities: [{ id: 'zombie', x: 0.5, y: 0, z: 0.5, yaw: 0, hands: ['iron_sword'], armor: { head: { id: 'iron_helmet' }, feet: { id: 'elytra' } } }] }, d)
  assert.ok(Object.keys(m.custom).includes('sign:94:10:red:1:Hi|||'))
  assert.ok(Object.keys(m.custom).includes('tex:equipment/humanoid/iron'))   // an elytra isn't armour, so only the helmet
  assert.ok(Object.keys(m.custom).includes('item:iron_sword'))
  assert.deepEqual(m.missing, {})
})

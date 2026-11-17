import test from 'node:test'
import assert from 'node:assert/strict'
import { looksPasted, parsePaste } from './coords'

test('F3+C: the dimension comes from the execute clause, decimals round down to the block', () => {
  assert.deepEqual(parsePaste('/execute in minecraft:overworld run tp @s 1303.46 60.00 -1888.91 6.34 20.58'), { xyz: '1303 60 -1889', dim: 'ow' })
  assert.deepEqual(parsePaste('/execute in minecraft:the_nether run tp @s -12.5 70.00 8.99 -90.0 0.0'), { xyz: '-13 70 8', dim: 'nether' })
  assert.deepEqual(parsePaste('execute in minecraft:the_end run tp @s 100.0 49.0 0.0'), { xyz: '100 49 0', dim: 'end' })
})

test('/tp and plain numbers have no dimension', () => {
  assert.deepEqual(parsePaste('/tp 10 64 -20'), { xyz: '10 64 -20', dim: null })
  assert.deepEqual(parsePaste('/tp @s 10.7 64 -20.2'), { xyz: '10 64 -21', dim: null })
  assert.deepEqual(parsePaste('/teleport Steve 1 2 3'), { xyz: '1 2 3', dim: null })
  assert.deepEqual(parsePaste('  5, 70, -3 '), { xyz: '5 70 -3', dim: null })
  assert.deepEqual(parsePaste('5 70 -3'), { xyz: '5 70 -3', dim: null })
})

test('things that are not a position', () => {
  assert.equal(parsePaste('/tp ~ ~1 ~'), null)          // relative coordinates can't be saved
  assert.equal(parsePaste('/tp @s Steve'), null)
  assert.equal(parsePaste('hello'), null)
  assert.equal(parsePaste('1 2'), null)
  assert.equal(parsePaste('/execute in minecraft:overworld run say hi'), null)
  assert.throws(() => parsePaste('/execute in mymod:moon run tp @s 1 2 3'), /no column/)
})

test('looksPasted spots game text but not plain typing', () => {
  assert.equal(looksPasted('/execute in minecraft:overworld run tp @s 1 2 3'), true)
  assert.equal(looksPasted('1.5 2 3'), true)
  assert.equal(looksPasted('1 64 -3'), false)
})

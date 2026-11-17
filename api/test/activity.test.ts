import test from 'node:test'
import assert from 'node:assert/strict'
import { describe, diffRows, mergeDetail } from '../src/activity'

const j = (v: any) => JSON.stringify(v)

test('activity names the rows and what changed', () => {
  assert.equal(describe('coords', diffRows('[]', [{ id: 'a', name: 'Base' }])), 'added the place Base')
  assert.equal(describe('coords', diffRows(j([{ id: 'a', name: 'Base', ow: '1 2 3', portal: 'No Portal' }]), [{ id: 'a', name: 'Base', ow: '4 5 6', portal: 'Portal' }])), 'edited the place Base (coordinates, portal)')
  assert.equal(describe('todos', diffRows(j([{ id: 't', project: 'Glass', progress: 'To-Do' }]), [{ id: 't', project: 'Glass', progress: 'Done', by: 'u' }])), 'finished the to-do Glass')
  assert.equal(describe('farms', diffRows(j([{ id: 'f', name: 'Iron farm', built: false }]), [{ id: 'f', name: 'Iron farm', built: true }])), 'built the farm Iron farm')
  assert.equal(describe('gear', diffRows(j([{ id: 'g', item: 'iron_helmet' }]), [])), 'removed the gear item Iron Helmet')
  const many = diffRows('[]', ['A', 'B', 'C', 'D', 'E'].map(n => ({ id: n, name: n })))
  assert.equal(describe('farms', many), 'added 5 farms: A, B, C and 2 more')
})

test('merged edits keep names and fields', () => {
  const a = diffRows(j([{ id: 'a', name: 'Base', ow: '1 2 3' }]), [{ id: 'a', name: 'Base', ow: '1 2 4' }])
  const b = diffRows(j([{ id: 'a', name: 'Base', ow: '1 2 4' }]), [{ id: 'a', name: 'Base', ow: '1 2 4', cat: 'Farms' }])
  assert.equal(describe('coords', mergeDetail(a, b)), 'edited the place Base (coordinates, category)')
})

test('entries saved before names were kept still read', () => {
  assert.equal(describe('todos', { added: ['x', 'y'], changed: [], removed: [] }), 'added 2 to-dos')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeRows, mergeSection } from './merge'

const r = (id: string, extra: Record<string, any> = {}) => ({ id, name: id, ...extra })

test('different fields of the same row both survive', () => {
  const base = [r('a', { priority: 'Low', progress: 'To-Do' })]
  const merged = mergeRows(base, [r('a', { priority: 'High', progress: 'To-Do' })], [r('a', { priority: 'Low', progress: 'Done' })])
  assert.deepEqual(merged, [r('a', { priority: 'High', progress: 'Done' })])
})
test('both sides adding rows keeps both', () => {
  const merged = mergeRows([r('a')], [r('a'), r('mine')], [r('a'), r('theirs')])
  assert.deepEqual(merged.map(x => x.id).sort(), ['a', 'mine', 'theirs'])
})
test('my delete wins over an untouched row, but not over their edit', () => {
  assert.deepEqual(mergeRows([r('a'), r('b')], [r('b')], [r('a'), r('b')]).map(x => x.id), ['b'])
  assert.deepEqual(mergeRows([r('a')], [], [r('a', { name: 'edited' })]), [r('a', { name: 'edited' })])
})
test('their delete wins unless I edited the row', () => {
  assert.deepEqual(mergeRows([r('a')], [r('a')], []), [])
  assert.deepEqual(mergeRows([r('a')], [r('a', { name: 'mine' })], []), [r('a', { name: 'mine' })])
})
test('same field edited on both sides: mine wins', () => {
  assert.equal(mergeRows([r('a')], [r('a', { name: 'mine' })], [r('a', { name: 'theirs' })])[0].name, 'mine')
})
test('notes: untouched takes theirs, edited keeps mine', () => {
  assert.equal(mergeSection('notes', 'x', 'x', 'server'), 'server')
  assert.equal(mergeSection('notes', 'x', 'mine', 'server'), 'mine')
})

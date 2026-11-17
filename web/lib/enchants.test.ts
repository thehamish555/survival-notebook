import test from 'node:test'
import assert from 'node:assert/strict'
import { analyse, analyseItem, bookList, kindOfItem, lvl } from './enchants'

const names = (a: { name: string }[]) => a.map(x => x.name).sort()

test('item ids map to kinds', () => {
  assert.equal(kindOfItem('netherite_pickaxe'), 'pickaxe'); assert.equal(kindOfItem('turtle_helmet'), 'helmet')
  assert.equal(kindOfItem('mace'), 'mace'); assert.equal(kindOfItem('diamond_spear'), 'spear'); assert.equal(kindOfItem('nonsense'), undefined)
})
test('sword: conflicting damage enchants are excluded, the rest are missing', () => {
  const a = analyse('sword', { Sharpness: 5, Looting: 3, Unbreaking: 3, Mending: 1 })
  assert.deepEqual(names(a.missing), ['Fire Aspect', 'Knockback', 'Sweeping Edge'])        // Smite / Bane excluded by Sharpness
  assert.equal(a.done, false); assert.equal(a.remaining, 3)
})
test('a maxed sword is done; below-max counts as an upgrade', () => {
  const full = { Sharpness: 5, Knockback: 2, 'Fire Aspect': 2, Looting: 3, 'Sweeping Edge': 3, Unbreaking: 3, Mending: 1 }
  assert.equal(analyse('sword', full).done, true)
  const low = analyse('sword', { ...full, Sharpness: 4 }); assert.equal(low.done, false); assert.equal(low.upgrades, 1); assert.equal(low.owned.find(o => o.name === 'Sharpness')!.state, 'low')
})
test('fresh sword: the damage alternatives count as one choice', () => {
  const a = analyse('sword', {})
  assert.equal(a.missing.filter(m => m.alt).length, 3)                                      // Sharpness, Smite, Bane
  assert.equal(a.remaining, 1 + 6)                                                          // one damage choice + knockback, fire, looting, sweeping, unbreaking, mending
})
test('bow: Infinity excludes Mending; trident: Loyalty + Channeling exclude Riptide; boots: Depth Strider excludes Frost Walker', () => {
  assert.ok(!analyse('bow', { Infinity: 1 }).missing.some(m => m.name === 'Mending'))
  assert.ok(!analyse('trident', { Loyalty: 3, Channeling: 1 }).missing.some(m => m.name === 'Riptide'))
  assert.ok(!analyse('boots', { 'Depth Strider': 3 }).missing.some(m => m.name === 'Frost Walker'))
})
test('curses are shown as owned but never required', () => {
  const a = analyse('helmet', { 'Curse of Binding': 1 }); assert.equal(a.owned[0].state, 'curse'); assert.ok(!a.missing.some(m => m.name.startsWith('Curse')))
})
test('unknown item type: no analysis, nothing breaks', () => {
  const a = analyse(undefined, { Sharpness: 5 }); assert.equal(a.known, false); assert.equal(a.owned.length, 1)
})
test('book list aggregates what is still needed, skipping alternatives', () => {
  const list = bookList([{ item: 'diamond_sword', enchants: { Sharpness: 4, Mending: 1 } }, { item: 'diamond_axe', enchants: { Mending: 1 } }])
  assert.equal(list.find(b => b.name === 'Mending'), undefined); assert.equal(list.find(b => b.name === 'Sharpness')!.count, 1)
  assert.equal(list.find(b => b.name === 'Unbreaking')!.count, 2)
})

test('per-item off: switched-off enchants go red (listed in off) and stop counting; others unaffected', () => {
  const base = analyse('sword', { Sharpness: 5 }), a = analyse('sword', { Sharpness: 5 }, { off: ['fire_aspect'] })
  assert.ok(base.missing.some(m => m.name === 'Fire Aspect'))
  assert.ok(!a.missing.some(m => m.name === 'Fire Aspect')); assert.ok(a.off.some(m => m.name === 'Fire Aspect')); assert.ok(a.remaining < base.remaining)
  assert.ok(a.missing.some(m => m.name === 'Knockback'))
})
test('goals: wanted enchants count as needed, can exclude conflicts, and lower the max of an owned one', () => {
  const a = analyse('sword', { Sharpness: 5 }, { goal: { Smite: 5 } })      // Smite is a goal even though Sharpness (its conflict) is on the item
  assert.ok(a.goals.some(g => g.name === 'Smite' && g.max === 5)); assert.ok(!a.missing.some(m => m.name === 'Bane of Arthropods'))
  const b = analyse('pickaxe', { Efficiency: 3 }, { goal: { Efficiency: 3 } }); assert.equal(b.owned[0].state, 'max')
})
test('planned items: everything is a goal; items merge into analyseItem', () => {
  const a = analyseItem({ plan: true, item: 'netherite_pickaxe', enchants: {}, goal: { Efficiency: 5, Mending: 1 } })
  assert.equal(a.goals.length, 2); assert.equal(a.owned.length, 0)
})
test('level numerals are dropped for max-I enchants', () => { assert.equal(lvl('Mending', 1, 1), 'Mending'); assert.equal(lvl('Sharpness', 5, 5), 'Sharpness V') })

import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync, gzipSync, inflateSync } from 'node:zlib'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { blockItems, litematicItems } from '../src/litematic'
import { TILE_BYTES, pruneMap } from '../src/routes/map'
import type { PushMsg, PushSub } from '../src/push'

// ---- a tiny NBT writer, just enough to build .litematic files for the tests
type Tag = { t: number; v: any }
const C = (v: Record<string, Tag>): Tag => ({ t: 10, v }), S = (v: string): Tag => ({ t: 8, v }), I = (v: number): Tag => ({ t: 3, v })
const L = (et: number, v: Tag[]): Tag => ({ t: 9, v: { et, items: v } }), LA = (v: bigint[]): Tag => ({ t: 12, v })
function enc(tag: Tag): Buffer {
  const { t, v } = tag
  if (t === 3) { const b = Buffer.alloc(4); b.writeInt32BE(v); return b }
  if (t === 8) { const s = Buffer.from(v, 'utf8'), b = Buffer.alloc(2); b.writeUInt16BE(s.length); return Buffer.concat([b, s]) }
  if (t === 9) { const h = Buffer.alloc(5); h.writeUInt8(v.et); h.writeInt32BE(v.items.length, 1); return Buffer.concat([h, ...v.items.map(enc)]) }
  if (t === 12) { const h = Buffer.alloc(4 + v.length * 8); h.writeInt32BE(v.length); v.forEach((x: bigint, i: number) => h.writeBigInt64BE(BigInt.asIntN(64, x), 4 + i * 8)); return h }
  const parts: Buffer[] = []
  for (const [k, x] of Object.entries<Tag>(v)) { const name = enc(S(k)); parts.push(Buffer.from([x.t]), name, enc(x)) }
  parts.push(Buffer.from([0])); return Buffer.concat(parts)
}
const nbtFile = (root: Tag) => gzipSync(Buffer.concat([Buffer.from([10]), enc(S('')), enc(root)]))

/** Packs palette indices LSB-first, letting values cross from one long into the next (Litematica's layout). */
function pack(idx: number[], bits: number): bigint[] {
  const longs = new Array(Math.ceil((idx.length * bits) / 64)).fill(0n)
  idx.forEach((v, i) => { for (let b = 0; b < bits; b++) if ((v >> b) & 1) { const p = i * bits + b; longs[p >> 6] |= 1n << BigInt(p & 63) } })
  return longs
}
function litematic(palette: Tag[], idx: number[], size: [number, number, number]) {
  const bits = Math.max(2, 32 - Math.clz32(palette.length - 1))
  return nbtFile(C({ Regions: C({ Main: C({ Size: C({ x: I(size[0]), y: I(size[1]), z: I(size[2]) }), BlockStatePalette: L(10, palette), BlockStates: LA(pack(idx, bits)) }) }) }))
}
const block = (name: string, props?: Record<string, string>) => C({ Name: S(name), ...(props ? { Properties: C(Object.fromEntries(Object.entries(props).map(([k, x]) => [k, S(x)]))) } : {}) })

test('litematic: counts items, including values that cross long boundaries', () => {
  // 5 palette entries -> 3 bits per block, so with 30 blocks several values straddle the first 64-bit boundary
  const palette = [block('minecraft:air'), block('minecraft:stone'), block('minecraft:oak_slab', { type: 'double' }), block('minecraft:oak_door', { half: 'upper' }), block('minecraft:oak_door', { half: 'lower' })]
  const idx = Array.from({ length: 30 }, (_, i) => [0, 1, 1, 2, 3, 4][i % 6])
  const items = litematicItems(litematic(palette, idx, [3, 2, -5]))   // negative sizes are normal in Litematica
  assert.deepEqual(items, { stone: 10, oak_slab: 10, oak_door: 5 })
})

test('litematic: block to item rules', () => {
  assert.deepEqual(blockItems('minecraft:redstone_wire', { power: '0' }), [['redstone', 1]])
  assert.deepEqual(blockItems('minecraft:oak_wall_sign'), [['oak_sign', 1]])
  assert.deepEqual(blockItems('minecraft:wall_torch'), [['torch', 1]])
  assert.deepEqual(blockItems('minecraft:sea_pickle', { pickles: '3' }), [['sea_pickle', 3]])
  assert.deepEqual(blockItems('minecraft:potted_cactus'), [['flower_pot', 1], ['cactus', 1]])
  assert.deepEqual(blockItems('minecraft:water', { level: '0' }), [['water_bucket', 1]])
  assert.deepEqual(blockItems('minecraft:water', { level: '3' }), [])
  assert.deepEqual(blockItems('minecraft:red_bed', { part: 'head' }), [])
  assert.deepEqual(blockItems('minecraft:cobblestone_wall'), [['cobblestone_wall', 1]])
  assert.deepEqual(blockItems('create:shaft'), [['create:shaft', 1]])
  assert.throws(() => litematicItems(Buffer.from('not a file')))
})

// ---- the app, with a fake push sender that records what would be sent
const base = { NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(32), DB_PATH: ':memory:' }
function mk() {
  const sent: { sub: PushSub; msg: PushMsg }[] = []
  const { app, db } = createApp(loadConfig(base), undefined, undefined, async (sub, msg) => { sent.push({ sub, msg }); return !sub.endpoint.includes('gone') })
  const call = async (method: string, path: string, body?: unknown, token?: string, raw?: Uint8Array) => {
    const res = await app.request(path, { method, headers: { 'content-type': raw ? 'application/octet-stream' : 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: (raw ? new Blob([new Uint8Array(raw)]) : body === undefined ? undefined : JSON.stringify(body)) })
    const buf = Buffer.from(await res.arrayBuffer()); let json: any; try { json = JSON.parse(buf.toString()) } catch { json = null }
    return { status: res.status, json, buf }
  }
  const user = async (name: string) => { const r = await call('POST', '/auth/google', { credential: `dev:${name}@x.com:${name}` }); return { token: r.json.token as string, id: r.json.user.id as string } }
  const notebook = async (token: string) => (await call('POST', '/notebooks', { title: 'World' }, token)).json.id as string
  const modToken = async (token: string) => (await call('POST', '/me/tokens', { name: 'mod' }, token)).json.token as string
  return { app, db, call, user, notebook, modToken, sent, tick: () => new Promise(r => setTimeout(r, 5)) }
}

test('files: block counts are stored on upload and listed per notebook', async () => {
  const { call, user, notebook, modToken } = mk(), a = await user('alice'), nb = await notebook(a.token)
  const file = litematic([block('minecraft:air'), block('minecraft:hopper')], [1, 1, 0, 1], [2, 2, 1])
  const up = await call('POST', `/notebooks/${nb}/files?name=farm.litematic`, undefined, a.token, file)
  assert.equal(up.status, 200)
  const broken = await call('POST', `/notebooks/${nb}/files?name=bad.litematic`, undefined, a.token, Buffer.from('nope'))
  const got = await call('GET', `/notebooks/${nb}/blocks`, undefined, await modToken(a.token))   // the mod can read them too
  assert.deepEqual(got.json[up.json.id], { items: { hopper: 3 } })
  assert.ok(got.json[broken.json.id].error)
})

test('map: tiles merge, list, download; caps and permissions', async () => {
  const { call, user, notebook, modToken, db } = mk(), a = await user('alice'), v = await user('vic'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'vic@x.com', role: 'viewer' }, a.token)
  const tile = (fill: (i: number) => number) => deflateSync(Buffer.from(Array.from({ length: TILE_BYTES }, (_, i) => fill(i))))
  const mod = await modToken(a.token)
  assert.equal((await call('PUT', `/notebooks/${nb}/map/ow/0/-1`, undefined, mod, tile(i => (i < 100 ? 5 : 0)))).status, 200)
  assert.equal((await call('PUT', `/notebooks/${nb}/map/ow/0/-1`, undefined, mod, tile(i => (i >= 50 && i < 60 ? 9 : 0)))).status, 200)
  const px = inflateSync((await call('GET', `/notebooks/${nb}/map/ow/0/-1`, undefined, a.token)).buf)
  assert.equal(px[0], 5); assert.equal(px[55], 9); assert.equal(px[99], 5); assert.equal(px[100], 0)   // the second upload only replaced what it had seen
  assert.deepEqual((await call('GET', `/notebooks/${nb}/map`, undefined, v.token)).json.map((t: any) => [t.dim, t.tx, t.tz]), [['ow', 0, -1]])
  assert.equal((await call('GET', `/notebooks/${nb}`, undefined, a.token)).json.mapTiles, 1)
  assert.equal((await call('PUT', `/notebooks/${nb}/map/ow/0/0`, undefined, v.token, tile(() => 1))).status, 403)        // viewers can't add to it
  assert.equal((await call('PUT', `/notebooks/${nb}/map/mars/0/0`, undefined, mod, tile(() => 1))).status, 403)        // not a mod route at all
  assert.equal((await call('PUT', `/notebooks/${nb}/map/ow/0/0`, undefined, a.token, deflateSync(Buffer.alloc(10)))).status, 400)   // wrong size
  assert.equal((await call('DELETE', `/notebooks/${nb}/map`, undefined, v.token)).status, 403)
  assert.equal((await call('DELETE', `/notebooks/${nb}/map`, undefined, a.token)).status, 200)
  assert.equal((db.prepare('select count(*) n from map_tiles').get() as { n: number }).n, 0)
})

test('inventory: per member, the mod can write it, nobody else, and it is not in the activity feed', async () => {
  const { call, user, notebook, modToken } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)
  const row = [{ id: 'inv', ts: 1, items: { stone: 64 } }]
  assert.equal((await call('PUT', `/notebooks/${nb}/s/inv:${a.id}`, { data: row }, await modToken(a.token))).status, 200)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/inv:${a.id}`, { data: row }, b.token)).status, 403)
  assert.deepEqual((await call('GET', `/notebooks/${nb}`, undefined, b.token)).json.sections[`inv:${a.id}`].data, row)
  assert.equal((await call('GET', `/notebooks/${nb}/activity`, undefined, a.token)).json.length, 0)
})

test('push: subscribe, assignment and invite notifications, dead subscriptions removed', async () => {
  const { call, user, notebook, sent, tick, db } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  assert.ok((await call('GET', '/push/key')).json.key)
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } })
  assert.equal((await call('POST', '/push/subscribe', sub('http://insecure.example/x'), b.token)).status, 400)
  assert.equal((await call('POST', '/push/subscribe', sub('https://push.example/bob'), b.token)).status, 200)
  await call('POST', '/push/subscribe', sub('https://push.example/gone-alice'), a.token)

  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token); await tick()
  assert.equal(sent.length, 1); assert.match(sent[0].msg.body, /alice added you to “World”/)

  const todo = { id: 't1', project: 'Iron farm', assignee: b.id, progress: 'To-Do' }
  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [todo] }, a.token); await tick()
  assert.equal(sent.length, 2); assert.match(sent[1].msg.body, /assigned you “Iron farm”/); assert.equal(sent[1].msg.url, `/n/${nb}#todo`)
  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [{ ...todo, notes: 'more' }] }, a.token); await tick()
  assert.equal(sent.length, 2)                                                                    // same assignee: no repeat
  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [{ ...todo, assignee: a.id }] }, b.token); await tick()
  assert.equal(sent.length, 3)                                                                    // bob handed it to alice...
  assert.equal((db.prepare('select count(*) n from push_subs where user=?').get(a.id) as { n: number }).n, 0)   // ...whose browser had unsubscribed, so it was dropped
  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [{ ...todo, assignee: b.id }] }, b.token); await tick()
  assert.equal(sent.length, 3)                                                                    // assigning yourself sends nothing
  assert.equal((await call('DELETE', '/push/subscribe', { endpoint: 'https://push.example/bob' }, b.token)).status, 200)
})

test('push: finished to-dos tell their maker, built farms and deaths tell everyone else', async () => {
  const { call, user, notebook, sent, tick, db } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)
  for (const u of [a, b]) await call('POST', '/push/subscribe', { endpoint: `https://push.example/${u.id}`, keys: { p256dh: 'p', auth: 'a' } }, u.token)
  sent.length = 0
  const to = (u: { id: string }) => sent.filter(x => x.sub.endpoint.endsWith(u.id)).map(x => x.msg.body)

  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [{ id: 't1', project: 'Glass', progress: 'To-Do' }] }, a.token)
  const stored = (db.prepare("select data from sections where nb=? and name='todos'").get(nb) as { data: string }).data
  assert.equal(JSON.parse(stored)[0].by, a.id)                                                              // the maker is remembered
  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [{ id: 't1', project: 'Glass', progress: 'Done' }] }, b.token); await tick()   // bob's copy has no "by"...
  assert.deepEqual(to(a), ['bob finished “Glass”'])
  assert.equal(JSON.parse((db.prepare("select data from sections where nb=? and name='todos'").get(nb) as { data: string }).data)[0].by, a.id)   // ...but it's kept

  await call('PUT', `/notebooks/${nb}/s/farms`, { data: [{ id: 'f1', name: 'Iron farm', built: false }] }, a.token)
  await call('PUT', `/notebooks/${nb}/s/farms`, { data: [{ id: 'f1', name: 'Iron farm', built: true }] }, a.token); await tick()
  assert.deepEqual(to(b), ['alice built the farm “Iron farm”']); assert.equal(to(a).length, 1)

  await call('PUT', `/notebooks/${nb}/s/deaths`, { data: [{ id: 'd1', uid: b.id, cause: 'bob was slain by Zombie', ow: '1 2 3' }] }, b.token); await tick()
  assert.deepEqual(to(a), ['bob finished “Glass”', 'bob was slain by Zombie']); assert.equal(to(b).length, 1)
})

test('shop claims: anyone can claim, the mod too, and it stays out of the activity feed', async () => {
  const { call, user, notebook, modToken } = mk(), a = await user('alice'), nb = await notebook(a.token)
  const claim = [{ id: 'book:Sharpness:5', uid: a.id, ts: 1 }]
  assert.equal((await call('PUT', `/notebooks/${nb}/s/shop`, { data: claim }, await modToken(a.token))).status, 200)
  assert.deepEqual((await call('GET', `/notebooks/${nb}`, undefined, a.token)).json.sections.shop.data, claim)
  assert.equal((await call('GET', `/notebooks/${nb}/activity`, undefined, a.token)).json.length, 0)
})

test('map clean-up: old tiles go unless near a place; the mod can read the map', async () => {
  const { call, user, notebook, modToken, db } = mk(), a = await user('alice'), nb = await notebook(a.token), mod = await modToken(a.token)
  const tile = deflateSync(Buffer.alloc(TILE_BYTES, 4))
  for (const [tx, tz] of [[0, 0], [5, 5], [-3, 0]]) await call('PUT', `/notebooks/${nb}/map/ow/${tx}/${tz}`, undefined, mod, tile)
  await call('PUT', `/notebooks/${nb}/map/nether/5/5`, undefined, mod, tile)
  await call('PUT', `/notebooks/${nb}/s/coords`, { data: [{ id: 'p', name: 'Base', ow: '700 64 700', nether: '', end: '' }, { id: 'q', name: 'Hub', ow: '', nether: '-500 70 10', end: '' }] }, a.token)
  db.prepare('update map_tiles set updated=0 where not (tx=-3)').run()           // everything but (-3,0) is old
  assert.equal((await call('POST', `/notebooks/${nb}/map/prune`, undefined, mod)).status, 403)   // owner only, and not with a mod token
  assert.equal((await call('POST', `/notebooks/${nb}/map/prune`, undefined, a.token)).json.removed, 2)
  const left = (await call('GET', `/notebooks/${nb}/map`, undefined, mod)).json.map((t: any) => `${t.dim}/${t.tx}/${t.tz}`).sort()
  assert.deepEqual(left, ['ow/-3/0', 'ow/5/5'])                                   // (5,5) holds Base at 700,700; (0,0) and the Nether tile were old and far from anything
  assert.equal((await call('GET', `/notebooks/${nb}/map/ow/5/5`, undefined, mod)).status, 200)
  assert.equal(pruneMap(db, { now: Date.now() + 200 * 86_400_000 }), 1)          // much later, the recent tile ages out too
})

test('push: choices per kind, and new places are gathered into one notification with their final names', async () => {
  const { call, user, notebook, sent, db } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)
  await call('POST', '/push/subscribe', { endpoint: 'https://push.example/bob', keys: { p256dh: 'p', auth: 'a' } }, b.token)
  sent.length = 0
  const prefs = (await call('GET', '/push/prefs', undefined, b.token)).json
  assert.equal(prefs.assigned, true); assert.equal(prefs.places, false)
  const put = (await call('PUT', '/push/prefs', { assigned: false, places: true, nonsense: true }, b.token)).json
  assert.equal(put.assigned, false); assert.equal(put.places, true); assert.equal('nonsense' in put, false)
  assert.equal(JSON.parse((db.prepare('select notify from users where id=?').get(b.id) as { notify: string }).notify).places, true)

  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [{ id: 't1', project: 'Glass', assignee: b.id }] }, a.token)
  await call('PUT', `/notebooks/${nb}/s/coords`, { data: [{ id: 'p1', name: '' }] }, a.token)                         // the website adds a blank row...
  await call('PUT', `/notebooks/${nb}/s/coords`, { data: [{ id: 'p1', name: 'Mesa' }, { id: 'p2', name: 'Base' }] }, a.token)   // ...then it's named
  await new Promise(r => setTimeout(r, 60))
  assert.deepEqual(sent.map(x => x.msg.body), ['alice added 2 places: Mesa and Base'])   // no assignment push: bob turned those off
  assert.equal(sent[0].msg.url, `/n/${nb}#coordinates`)
})

test('play time, "is playing" and the weekly recap', async () => {
  const { call, user, notebook, sent, db } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)
  await call('POST', '/push/subscribe', { endpoint: 'https://push.example/bob', keys: { p256dh: 'p', auth: 'a' } }, b.token)
  await call('PUT', '/push/prefs', { online: true }, b.token)
  sent.length = 0
  const pos = (x: number, z: number) => call('PUT', `/notebooks/${nb}/pos`, { dim: 'ow', x, y: 64, z }, a.token)
  await pos(0, 0); assert.deepEqual(sent.map(x => x.msg.body), ['alice is playing'])
  await new Promise(r => setTimeout(r, 15)); await pos(30, 40)
  assert.equal(sent.length, 1)                                                           // still playing: no repeat
  const row = db.prepare('select ms, dist from play where nb=? and user=?').get(nb, a.id) as { ms: number; dist: number }
  assert.ok(row.ms > 0); assert.equal(row.dist, 50)
  db.prepare('update play set ms=? where nb=?').run(2 * 3_600_000, nb)                 // pretend it was a long session

  await call('PUT', `/notebooks/${nb}/s/coords`, { data: [{ id: 'p1', name: 'Mesa' }] }, a.token)
  await call('PUT', `/notebooks/${nb}/s/farms`, { data: [{ id: 'f1', name: 'Iron farm', built: false }] }, b.token)
  await call('PUT', `/notebooks/${nb}/s/farms`, { data: [{ id: 'f1', name: 'Iron farm', built: true }] }, b.token)
  await call('PUT', `/notebooks/${nb}/s/deaths`, { data: [{ id: 'd1', uid: a.id, ts: Date.now(), cause: 'alice fell from a high place' }, { id: 'd0', uid: a.id, ts: Date.now() - 30 * 86_400_000, cause: 'old' }] }, a.token)
  const r = (await call('GET', `/notebooks/${nb}/recap`, undefined, b.token)).json
  assert.deepEqual(r.totals, { ms: 2 * 3_600_000, dist: 50, places: 1, todos: 0, farms: 1, deaths: 1, players: 1 })
  assert.deepEqual(r.places, [{ name: 'Mesa', by: 'alice' }]); assert.deepEqual(r.farms, [{ name: 'Iron farm', by: 'bob' }])
  assert.equal(r.days.length, 7); assert.equal(r.days[6].ms, 2 * 3_600_000)
  assert.deepEqual(r.highlights.map((h: any) => `${h.key}:${h.name}`), ['ms:alice', 'places:alice', 'farms:bob', 'deaths:alice'])   // 50 blocks is too little to count as a highlight
  assert.equal((await call('GET', `/notebooks/${nb}/recap?back=1`, undefined, b.token)).json.totals.places, 0)
  assert.equal((await call('GET', `/notebooks/${nb}/recap`)).status, 401)

  const { recap, recapLine, sendWeeklyRecaps } = await import('../src/recap')
  assert.equal(recapLine(recap(db, nb)), '2h 0m played, 1 new place, 1 farm built and 1 death')
  const got: string[] = [], notify = (u: string, m: { body: string }) => { got.push(`${u === a.id ? 'alice' : 'bob'}: ${m.body}`) }
  // Sunday at 7pm in each person's timezone: alice is in New Zealand, bob never sent one (so UTC)
  assert.equal((await call('PUT', '/me/tz', { tz: 'Mars/Olympus' }, a.token)).status, 400)
  await call('PUT', '/me/tz', { tz: 'Pacific/Auckland' }, a.token)
  const { localTime } = await import('../src/recap')
  const next = (tz: string) => { let t = Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 60_000; while (!(localTime(tz, new Date(t)).day === 0 && localTime(tz, new Date(t)).hour === 19)) t += 3_600_000; return new Date(t) }
  const nz = next('Pacific/Auckland'), utc = next('UTC')
  assert.equal(sendWeeklyRecaps(db, notify, new Date(nz.getTime() - 3_600_000)), 0)          // 6pm: not yet
  sendWeeklyRecaps(db, notify, nz); sendWeeklyRecaps(db, notify, new Date(nz.getTime() + 600_000))   // 7pm, and again a bit later: once
  assert.deepEqual(got, ['alice: 2h 0m played, 1 new place, 1 farm built and 1 death'])
  sendWeeklyRecaps(db, notify, utc)
  assert.deepEqual(got.map(g => g.split(':')[0]), ['alice', 'bob'])
})

test('head skins: only texture hashes, UUIDs and names, and only when signed in', async () => {
  const { call, user } = mk(), a = await user('alice')
  assert.equal((await call('GET', '/skins/Notch')).status, 401)
  for (const bad of ['..%2Fetc', 'a'.repeat(17) + '!', 'http:%2F%2Fevil']) assert.equal((await call('GET', `/skins/${bad}`, undefined, a.token)).status, 400)
})

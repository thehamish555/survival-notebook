import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'

const base = { NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(32), DB_PATH: ':memory:' }
function mk(extra: Record<string, string> = {}) {
  const { app, db } = createApp(loadConfig({ ...base, ...extra }))
  const call = async (method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text(); let json: any; try { json = JSON.parse(text) } catch { json = null }
    return { status: res.status, json, text }
  }
  const user = async (name: string) => { const r = await call('POST', '/auth/google', { credential: `dev:${name}@x.com:${name}` }); return { token: r.json.token as string, id: r.json.user.id as string } }
  const notebook = async (token: string) => (await call('POST', '/notebooks', { title: 'World' }, token)).json.id as string
  return { app, db, call, user, notebook }
}

test('auth: google sign-in creates, reuses and links accounts', async () => {
  const { call, user, db } = mk(), a = await user('alice')
  const again = await call('POST', '/auth/google', { credential: 'dev:alice@x.com:Alice Again' })
  assert.equal(again.status, 200); assert.equal(again.json.user.id, a.id)                               // same Google account, same user
  assert.equal((db.prepare('select count(*) n from users').get() as { n: number }).n, 1)
  db.prepare("insert into users(id,email,name,hash) values('old','old@x.com','Old','legacy-hash')").run()   // a pre-Google account
  const linked = await call('POST', '/auth/google', { credential: 'dev:old@x.com:Old' })
  assert.equal(linked.json.user.id, 'old')                                                              // matched by email, notebooks kept
  assert.equal((await call('POST', '/auth/google', { credential: 'garbage-token-value' })).status, 401)
  assert.equal((await call('POST', '/auth/google', {})).status, 400)
  assert.equal((await call('POST', '/auth/login', { email: 'alice@x.com', password: 'x' })).status, 404)   // passwords are gone
  assert.equal((await call('GET', '/me', undefined, a.token)).json.name, 'alice')
  assert.equal((await call('GET', '/me')).status, 401)
})

test('notebooks start blank; sections validate and bump rev', async () => {
  const { call, user, notebook } = mk(), a = await user('alice'), nb = await notebook(a.token)
  const got = (await call('GET', `/notebooks/${nb}`, undefined, a.token)).json
  assert.deepEqual(got.sections.coords.data, []); assert.equal(got.sections.notes.data, ''); assert.equal(got.role, 'owner')
  const row = { id: 'r1', name: 'Base', ow: '0 64 0' }
  assert.equal((await call('PUT', `/notebooks/${nb}/s/coords`, { data: [row] }, a.token)).json.rev, 2)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/coords`, { data: 'nope' }, a.token)).status, 400)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/hax`, { data: [] }, a.token)).status, 400)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/notes`, { data: 'hello' }, a.token)).status, 200)
  assert.equal((await call('GET', `/notebooks/${nb}`, undefined, a.token)).json.sections.coords.data[0].name, 'Base')
})

test('sharing: access, roles, privacy of emails, nicknames', async () => {
  const { call, user, notebook } = mk(), a = await user('alice'), b = await user('bob'), c = await user('carol'), nb = await notebook(a.token)
  assert.equal((await call('GET', `/notebooks/${nb}`, undefined, b.token)).status, 404)
  assert.equal((await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)).status, 200)
  assert.equal((await call('POST', `/notebooks/${nb}/members`, { email: 'carol@x.com', role: 'viewer' }, a.token)).status, 200)
  assert.equal((await call('POST', `/notebooks/${nb}/members`, { email: 'carol@x.com' }, b.token)).status, 403)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/todos`, { data: [] }, b.token)).status, 200)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/todos`, { data: [] }, c.token)).status, 403)   // viewer
  await call('PATCH', `/notebooks/${nb}/nick`, { nick: 'Builder Bob' }, b.token)
  const asBob = (await call('GET', `/notebooks/${nb}`, undefined, b.token)).json.members
  const asOwner = (await call('GET', `/notebooks/${nb}`, undefined, a.token)).json.members
  assert.equal(asBob[0].role, 'owner'); assert.equal(asBob[0].email, '')                       // owner listed first, email hidden from others
  assert.equal(asBob.find((m: any) => m.id === b.id).name, 'Builder Bob')
  assert.equal(asOwner.find((m: any) => m.id === b.id).realName, 'bob'); assert.equal(asOwner.find((m: any) => m.id === b.id).email, 'bob@x.com')
})

test('gear is per member; removing a member unassigns their tasks', async () => {
  const { call, user, notebook } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/gear:${a.id}`, { data: [{ id: 'g1' }] }, b.token)).status, 403)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/gear:${b.id}`, { data: [{ id: 'g1' }] }, b.token)).status, 200)
  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [{ id: 't1', assignee: b.id }, { id: 't2', assignee: a.id }] }, a.token)
  assert.equal((await call('DELETE', `/notebooks/${nb}/members/${a.id}`, undefined, a.token)).status, 400)   // owner can't be removed
  await call('DELETE', `/notebooks/${nb}/members/${b.id}`, undefined, a.token)
  const todos = (await call('GET', `/notebooks/${nb}`, undefined, a.token)).json.sections.todos.data
  assert.equal(todos[0].assignee, ''); assert.equal(todos[1].assignee, a.id)
})

test('files: type, size, round-trip, access', async () => {
  const { app, call, user, notebook } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  const up = (name: string, bytes: Uint8Array, token = a.token) => app.request(`/notebooks/${nb}/files?name=${name}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body: bytes as any })
  assert.equal((await up('x.txt', new Uint8Array(10))).status, 400)
  assert.equal((await up('big.litematic', new Uint8Array(101 * 1024))).status, 413)
  const ok = await up('farm.litematic', new Uint8Array([1, 2, 3])); assert.equal(ok.status, 200)
  const f = await ok.json() as any
  const dl = await app.request(`/notebooks/${nb}/files/${f.id}`, { headers: { authorization: `Bearer ${a.token}` } })
  assert.deepEqual([...new Uint8Array(await dl.arrayBuffer())], [1, 2, 3])
  assert.equal((await call('GET', `/notebooks/${nb}/files/${f.id}`, undefined, b.token)).status, 404)   // not a member
})

test('origin secret and rate limiting', async () => {
  const guarded = mk({ ORIGIN_SECRET: 's'.repeat(32) })
  assert.equal((await guarded.call('GET', '/health')).status, 200)
  assert.equal((await guarded.call('POST', '/auth/google', { credential: 'dev:a@x.com:A' })).status, 403)
  assert.equal((await guarded.call('POST', '/auth/google', { credential: 'dev:a@x.com:A' }, undefined, { 'x-origin-secret': 's'.repeat(32) })).status, 200)
  const { call } = mk(); let last = 0
  for (let i = 0; i < 40; i++) last = (await call('POST', '/auth/google', { credential: 'dev:a@x.com:A' })).status
  assert.equal(last, 429)
})

test('API tokens: mod scope, optimistic revisions, revocation', async () => {
  const { call, user, notebook } = mk(), a = await user('alice'), nb = await notebook(a.token)
  const made = (await call('POST', '/me/tokens', { name: 'Gaming PC' }, a.token)).json
  assert.match(made.token, /^snp_/)
  const listed = (await call('GET', '/me/tokens', undefined, a.token)).json
  assert.equal(listed.length, 1); assert.equal(listed[0].token, undefined)                          // secret never listed again
  const t = made.token as string
  assert.equal((await call('GET', '/notebooks', undefined, t)).status, 200)
  assert.equal((await call('GET', `/notebooks/${nb}/s/coords`, undefined, t)).json.rev, 1)
  assert.equal((await call('GET', `/notebooks/${nb}/s/gear:${a.id}`, undefined, t)).json.rev, 0)    // missing gear reads as empty, rev 0
  assert.equal((await call('POST', '/notebooks', { title: 'x' }, t)).status, 200)                  // mod tokens can create a notebook per world
  assert.equal((await call('POST', '/me/tokens', { name: 'x' }, t)).status, 403)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/notes`, { data: 'x', baseRev: 1 }, t)).status, 200)       // the mod edits notes too
  assert.equal((await call('PUT', `/notebooks/${nb}/s/farms`, { data: [{ id: 'f1', name: 'Iron' }] }, t)).status, 200)
  assert.equal((await call('PATCH', `/notebooks/${nb}/nick`, { nick: 'Modder' }, t)).status, 200)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/stats:${a.id}`, { data: [{ id: 'stats', deaths: 3 }], baseRev: 0 }, t)).status, 200)   // the mod shares your own stats
  assert.equal((await call('GET', `/notebooks/${nb}`, undefined, a.token)).json.sections[`stats:${a.id}`].data[0].deaths, 3)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/stats:00000000-0000-0000-0000-000000000000`, { data: [] }, t)).status, 403)         // never someone else's
  assert.equal((await call('GET', `/notebooks/${nb}/activity`, undefined, t)).status, 200)
  assert.equal((await call('POST', `/notebooks/${nb}/members`, { email: 'nobody@x.com' }, t)).status, 404)   // allowed route, unknown account
  assert.equal((await call('PUT', `/notebooks/${nb}/s/gear:${a.id}`, { data: [{ id: 'g' }], baseRev: 0 }, t)).status, 200)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/coords`, { data: [{ id: 'p' }], baseRev: 1 }, t)).json.rev, 2)
  const stale = await call('PUT', `/notebooks/${nb}/s/coords`, { data: [], baseRev: 1 }, t)
  assert.equal(stale.status, 409); assert.equal(stale.json.rev, 2)
  await call('DELETE', `/me/tokens/${made.id}`, undefined, a.token)
  assert.equal((await call('GET', '/notebooks', undefined, t)).status, 401)
})

test('activity feed coalesces edits and names people by nickname; list shows stats', async () => {
  const { call, user, notebook } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)
  await call('PATCH', `/notebooks/${nb}/nick`, { nick: 'Builder Bob' }, b.token)
  await call('PUT', `/notebooks/${nb}/s/coords`, { data: [{ id: 'p1', name: 'A' }] }, b.token)
  await call('PUT', `/notebooks/${nb}/s/coords`, { data: [{ id: 'p1', name: 'AB' }, { id: 'p2', name: 'C' }] }, b.token)   // same person, same minute: one entry
  await call('PUT', `/notebooks/${nb}/s/notes`, { data: 'hi' }, a.token)
  await call('PUT', `/notebooks/${nb}/s/gear:${a.id}`, { data: [{ id: 'g1' }] }, a.token)
  const feed = (await call('GET', `/notebooks/${nb}/activity`, undefined, a.token)).json
  assert.deepEqual(feed.map((x: any) => `${x.name}: ${x.text}`), ['alice: added a gear item', 'alice: edited the notes', 'Builder Bob: added 2 places: AB, C'])
  assert.equal((await call('GET', `/notebooks/${nb}/activity`, undefined, (await user('carol')).token)).status, 404)
  const list = (await call('GET', '/notebooks', undefined, a.token)).json
  assert.equal(list[0].memberCount, 2); assert.ok(list[0].lastActive > 0)
})

test('account: rename, delete cleans everything up', async () => {
  const { call, user, notebook } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token), mine = await notebook(b.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)
  await call('PUT', `/notebooks/${nb}/s/todos`, { data: [{ id: 't', assignee: b.id }] }, a.token)
  await call('PUT', `/notebooks/${nb}/s/gear:${b.id}`, { data: [{ id: 'g' }] }, b.token)
  assert.equal((await call('PATCH', '/me', { name: 'Robert' }, b.token)).status, 200)
  assert.equal((await call('GET', '/me', undefined, b.token)).json.name, 'Robert')
  assert.equal((await call('DELETE', '/me', { email: 'someone@else.com' }, b.token)).status, 403)
  assert.equal((await call('DELETE', '/me', { email: 'Bob@x.com' }, b.token)).status, 200)
  assert.equal((await call('GET', '/me', undefined, b.token)).status, 401)                               // session dies with the account
  const left = (await call('GET', `/notebooks/${nb}`, undefined, a.token)).json
  assert.equal(left.members.length, 1); assert.equal(left.sections.todos.data[0].assignee, '')            // unassigned, not dangling
  assert.equal((await call('GET', `/notebooks/${mine}`, undefined, a.token)).status, 404)                 // their own notebook is gone
})

test('deaths + prefs sections: mod can write deaths, prefs are owner-only, every mod token can manage members', async () => {
  const { call, user, notebook } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'editor' }, a.token)
  assert.deepEqual((await call('GET', `/notebooks/${nb}`, undefined, a.token)).json.sections.deaths.data, [])           // new notebooks have a deaths list
  const plain = (await call('POST', '/me/tokens', { name: 'plain' }, a.token)).json
  const admin = (await call('POST', '/me/tokens', { name: 'admin' }, a.token)).json
  assert.equal((await call('PUT', `/notebooks/${nb}/s/deaths`, { data: [{ id: 'd1', uid: a.id, cause: 'fell', items: 12 }] }, plain.token)).status, 200)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/prefs:${a.id}`, { data: [{ id: 'prefs', global: ['thorns'], kinds: { sword: ['fire_aspect'] } }] }, plain.token)).status, 200)
  assert.equal((await call('PUT', `/notebooks/${nb}/s/prefs:${a.id}`, { data: [] }, b.token)).status, 403)            // someone else's prefs
  const feed = (await call('GET', `/notebooks/${nb}/activity`, undefined, a.token)).json
  assert.ok(feed.some((x: any) => x.text === 'added a death') && !feed.some((x: any) => /prefs/.test(x.text)))        // deaths are logged, prefs aren't
  assert.equal((await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'viewer' }, admin.token)).status, 200)
  assert.equal((await call('DELETE', `/notebooks/${nb}/members/${b.id}`, undefined, admin.token)).status, 200)
  assert.equal((await call('DELETE', `/notebooks/${nb}`, undefined, admin.token)).status, 403)                        // still can't delete the notebook
})

test('files: unattached uploads are swept after the grace period, attached ones are kept, owners can delete', async () => {
  const { sweepFiles } = await import('../src/routes/files')
  const { app, db, call, user, notebook } = mk(), o = await user('filer'), nb = await notebook(o.token)
  const up = async (name: string) => (await (app.request(`/notebooks/${nb}/files?name=${name}`, { method: 'POST', headers: { authorization: `Bearer ${o.token}` }, body: new Uint8Array(10) }))).json() as any
  const kept = await up('keep.litematic'), orphan = await up('orphan.litematic'), gone = await up('gone.litematic')
  await call('PUT', `/notebooks/${nb}/s/farms`, { data: [{ id: 'f1', name: 'x', file: kept }], baseRev: 1 }, o.token)
  const del = await app.request(`/notebooks/${nb}/files/${gone.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${o.token}` } })
  assert.equal(del.status, 200)
  assert.equal(sweepFiles(db, 60_000, Date.now()), 0)                                  // too new: nothing swept yet
  assert.equal(sweepFiles(db, 60_000, Date.now() + 3 * 60 * 60 * 1000), 1)             // later: only the orphan goes
  const left = (db.prepare('select id from files where nb=?').all(nb) as any[]).map(r => r.id)
  assert.deepEqual(left, [kept.id]); assert.ok(!left.includes(orphan.id))
})

test('invite links: owner makes one, a stranger joins with it, expiry and revoke work', async () => {
  const { call, user, notebook, db } = mk(), a = await user('alice'), b = await user('bob'), nb = await notebook(a.token)
  assert.equal((await call('POST', `/notebooks/${nb}/invites`, { role: 'editor', days: 7 }, b.token)).status, 403)       // not the owner
  const made = await call('POST', `/notebooks/${nb}/invites`, { role: 'viewer', days: 7 }, a.token); assert.equal(made.status, 200)
  const code = made.json.code as string
  const peek = await call('GET', `/invites/${code}`); assert.equal(peek.json.title, 'World'); assert.equal(peek.json.role, 'viewer')
  assert.equal((await call('POST', `/invites/${code}`, undefined, b.token)).json.id, nb)
  assert.equal((await call('GET', `/notebooks/${nb}`, undefined, b.token)).json.role, 'viewer')
  assert.equal((await call('POST', `/invites/${code}`, undefined, a.token)).status, 200)                                // the owner opening it changes nothing
  assert.equal((await call('GET', `/notebooks/${nb}`, undefined, a.token)).json.role, 'owner')
  const feed = (await call('GET', `/notebooks/${nb}/activity`, undefined, a.token)).json; assert.equal(feed[0].text, 'joined the notebook')
  assert.equal((await call('GET', `/notebooks/${nb}/invites`, undefined, a.token)).json[0].uses, 1)
  db.prepare('update invites set expires=? where code=?').run(Date.now() - 1, code)
  assert.equal((await call('GET', `/invites/${code}`)).status, 404)                                                      // expired
  const again = (await call('POST', `/notebooks/${nb}/invites`, { days: 1 }, a.token)).json.code
  assert.equal((await call('DELETE', `/notebooks/${nb}/invites/${again}`, undefined, a.token)).status, 200)
  assert.equal((await call('GET', `/invites/${again}`)).status, 404)                                                     // revoked
  assert.equal((await call('POST', `/notebooks/${nb}/invites`, { days: 3 }, a.token)).status, 400)                      // only 1, 7 or 30
})
test('positions: members share where they are, the last spot stays after they leave, outsiders cannot', async () => {
  const { call, user, notebook } = mk(), a = await user('alice'), b = await user('bob'), c = await user('carol'), nb = await notebook(a.token)
  await call('POST', `/notebooks/${nb}/members`, { email: 'bob@x.com', role: 'viewer' }, a.token)
  const mod = (await call('POST', '/me/tokens', { name: 'mod' }, b.token)).json.token
  assert.equal((await call('PUT', `/notebooks/${nb}/pos`, { dim: 'nether', x: 12.345, y: 70.6, z: -8, yaw: 91.4, mcName: 'Bob_1', mcUuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5' }, mod)).status, 200)
  let list = (await call('GET', `/notebooks/${nb}/pos`, undefined, a.token)).json
  assert.equal(list.length, 1); assert.deepEqual([list[0].name, list[0].dim, list[0].x, list[0].y, list[0].yaw, list[0].online, list[0].mcName], ['bob', 'nether', 12.3, 71, 91, true, 'Bob_1'])
  assert.equal((await call('PUT', `/notebooks/${nb}/pos`, { dim: 'ow', x: 0, y: 0, z: 0 }, c.token)).status, 404)                        // not a member
  assert.equal((await call('PUT', `/notebooks/${nb}/pos`, { dim: 'moon', x: 0, y: 0, z: 0 }, b.token)).status, 400)
  assert.equal((await call('GET', `/notebooks/${nb}/pos`, undefined, c.token)).status, 404)
  assert.equal((await call('GET', `/notebooks/${nb}/skin/0123`, undefined, a.token)).status, 404)                                    // not a uuid
  assert.equal((await call('GET', `/notebooks/${nb}/skin/11111111-2222-3333-4444-555555555555`, undefined, a.token)).status, 404)    // nobody here has it
  await call('DELETE', `/notebooks/${nb}/pos`, undefined, mod)                                                                        // left the world
  list = (await call('GET', `/notebooks/${nb}/pos`, undefined, a.token)).json
  assert.equal(list.length, 1); assert.equal(list[0].online, false); assert.equal(list[0].mcName, 'Bob_1')
  await call('DELETE', `/notebooks/${nb}/pos/me`, undefined, mod)                                                                     // sharing off: gone
  assert.equal((await call('GET', `/notebooks/${nb}/pos`, undefined, a.token)).json.length, 0)
  await call('PUT', `/notebooks/${nb}/pos`, { dim: 'ow', x: 1, y: 2, z: 3 }, mod)
  await call('DELETE', `/notebooks/${nb}/members/${b.id}`, undefined, a.token)                                                        // removed from the notebook
  assert.equal((await call('GET', `/notebooks/${nb}/pos`, undefined, a.token)).json.length, 0)
})

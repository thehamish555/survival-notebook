import type { DB } from './db'
import { listOf, rowsIn } from './push'

const DAY = 86_400_000
export type Recap = {
  from: number; to: number; title: string
  days: { day: string; ms: number }[]
  members: { uid: string; name: string; mcUuid: string; ms: number; dist: number; places: number; todos: number; farms: number; deaths: number }[]
  totals: { ms: number; dist: number; places: number; todos: number; farms: number; deaths: number; players: number }
  places: { name: string; by: string }[]; todos: { name: string; by: string }[]; farms: { name: string; by: string }[]
  deaths: { cause: string; by: string; ts: number }[]
  highlights: { key: string; label: string; uid: string; name: string; value: number }[]
}

/** What a notebook's team did in the 7 days before `to`: time played, distance, places, finished to-dos, built farms and deaths. */
export function recap(db: DB, nb: string, to = Date.now()): Recap {
  const from = to - 7 * DAY
  const title = (db.prepare('select title from notebooks where id=?').get(nb) as { title: string } | undefined)?.title || 'Notebook'
  const people = db.prepare(`select m.user uid, coalesce(nullif(m.nick,''), u.name, 'Someone') name, coalesce(p.mc_uuid, '') mcUuid
    from members m join users u on u.id=m.user left join positions p on p.nb=m.nb and p.user=m.user where m.nb=?`).all(nb) as { uid: string; name: string; mcUuid: string }[]
  const stats = new Map(people.map(p => [p.uid, { ...p, ms: 0, dist: 0, places: 0, todos: 0, farms: 0, deaths: 0 }]))
  const nameOf = (uid: string) => stats.get(uid)?.name || 'Someone'

  // Time and distance: whole days, oldest first
  const dayKeys = Array.from({ length: 7 }, (_, i) => new Date(to - (6 - i) * DAY).toISOString().slice(0, 10))
  const perDay = new Map(dayKeys.map(d => [d, 0]))
  for (const r of db.prepare('select user, day, ms, dist from play where nb=? and day>=? and day<=?').all(nb, dayKeys[0], dayKeys[6]) as { user: string; day: string; ms: number; dist: number }[]) {
    perDay.set(r.day, (perDay.get(r.day) || 0) + r.ms)
    const s = stats.get(r.user); if (s) { s.ms += r.ms; s.dist += r.dist }
  }

  // Places added, to-dos finished and farms built, from the activity log. A row counts once, for whoever did it first.
  const places: (Recap['places'][number] & { id: string })[] = [], todos: Recap['todos'] = [], farms: Recap['farms'] = [], seen = new Set<string>()
  for (const a of db.prepare("select user, section, detail from activity where nb=? and ts>=? and ts<? and section in ('coords','todos','farms') order by id").all(nb, from, to) as { user: string; section: string; detail: string }[]) {
    let d: any; try { d = JSON.parse(a.detail) } catch { continue }
    const s = stats.get(a.user), names: Record<string, string> = d.names || {}
    if (a.section === 'coords') for (const id of d.added || []) {
      if (seen.has('c' + id)) continue; seen.add('c' + id)
      places.push({ name: names[id] || '', by: a.user, id }); if (s) s.places++
    }
    for (const [id, m] of Object.entries(d.marks || {}) as [string, string][]) {
      if (a.section === 'todos' && m === 'finished' && !seen.has('t' + id)) { seen.add('t' + id); todos.push({ name: names[id] || '', by: a.user }); if (s) s.todos++ }
      if (a.section === 'farms' && m === 'built' && !seen.has('f' + id)) { seen.add('f' + id); farms.push({ name: names[id] || '', by: a.user }); if (s) s.farms++ }
    }
  }
  // Places named after they were added (the website adds a blank row first) get their name as it is now
  const current = new Map(rowsIn((db.prepare("select data from sections where nb=? and name='coords'").get(nb) as { data: string } | undefined)?.data).map(r => [r?.id, String(r?.name || '')]))
  const deaths: Recap['deaths'] = []
  for (const r of rowsIn((db.prepare("select data from sections where nb=? and name='deaths'").get(nb) as { data: string } | undefined)?.data)) {
    const ts = Number(r?.ts); if (!(ts >= from && ts < to)) continue
    const by = typeof r.uid === 'string' ? r.uid : ''
    deaths.push({ cause: String(r.cause || '').slice(0, 120), by, ts }); const s = stats.get(by); if (s) s.deaths++
  }
  deaths.sort((a, b) => b.ts - a.ts)

  const members = [...stats.values()].map(s => ({ ...s, dist: Math.round(s.dist) }))
    .filter(s => s.ms || s.dist || s.places || s.todos || s.farms || s.deaths)
    .sort((a, b) => b.ms - a.ms || b.places + b.todos + b.farms - (a.places + a.todos + a.farms))
  const sum = (k: 'ms' | 'dist' | 'places' | 'todos' | 'farms' | 'deaths') => members.reduce((n, m) => n + m[k], 0)
  const top = (key: string, label: string, k: 'ms' | 'dist' | 'places' | 'todos' | 'farms' | 'deaths', min = 1) => {
    const best = [...members].sort((a, b) => b[k] - a[k])[0]
    return best && best[k] >= min ? [{ key, label, uid: best.uid, name: best.name, value: best[k] }] : []
  }
  const highlights = members.length < 2 ? [] : [
    ...top('ms', 'Played the most', 'ms', 60_000), ...top('dist', 'Travelled the furthest', 'dist', 100), ...top('places', 'Found the most places', 'places'),
    ...top('todos', 'Finished the most to-dos', 'todos'), ...top('farms', 'Built the most farms', 'farms'), ...top('deaths', 'Died the most', 'deaths'),
  ]
  return {
    from, to, title, days: dayKeys.map(day => ({ day, ms: perDay.get(day) || 0 })), members,
    totals: { ms: sum('ms'), dist: sum('dist'), places: places.length, todos: todos.length, farms: farms.length, deaths: deaths.length, players: members.filter(m => m.ms > 0).length },
    places: places.map(p => ({ name: current.get(p.id) || p.name || 'Unnamed place', by: nameOf(p.by) })), todos: todos.map(p => ({ ...p, by: nameOf(p.by) })), farms: farms.map(p => ({ ...p, by: nameOf(p.by) })),
    deaths: deaths.map(d => ({ ...d, by: nameOf(d.by) })), highlights,
  }
}

const hours = (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m` }

/** One line for the weekly notification, or null if nothing happened. */
export function recapLine(r: Recap): string | null {
  const t = r.totals
  if (!t.ms && !t.places && !t.todos && !t.farms && !t.deaths) return null
  const bits = [t.ms >= 60_000 && `${hours(t.ms)} played`, t.places && `${t.places} new place${t.places === 1 ? '' : 's'}`,
    t.farms && `${t.farms} farm${t.farms === 1 ? '' : 's'} built`, t.todos && `${t.todos} to-do${t.todos === 1 ? '' : 's'} done`, t.deaths && `${t.deaths} death${t.deaths === 1 ? '' : 's'}`].filter(Boolean) as string[]
  return bits.length ? listOf(bits, 4) : null
}

/** Sunday evening (New Zealand time is what most of the current players use, so it's 7 UTC Sunday): sends each notebook's recap once a week. */
export function sendWeeklyRecaps(db: DB, notify: (user: string, msg: { title: string; body: string; url: string }, kind: 'recap') => void, now = new Date()) {
  if (now.getUTCDay() !== 0 || now.getUTCHours() < 7) return 0
  const week = now.toISOString().slice(0, 10)
  let sent = 0
  for (const { id } of db.prepare('select id from notebooks').all() as { id: string }[]) {
    const key = `recap:${id}`
    if ((db.prepare('select v from kv where k=?').get(key) as { v: string } | undefined)?.v === week) continue
    db.prepare('insert into kv(k,v) values(?,?) on conflict(k) do update set v=excluded.v').run(key, week)
    const r = recap(db, id, now.getTime()), line = recapLine(r)
    if (!line) continue
    for (const { user } of db.prepare('select user from members where nb=?').all(id) as { user: string }[]) notify(user, { title: `Your week in ${r.title}`, body: line, url: `/n/${id}/recap` }, 'recap')
    sent++
  }
  return sent
}

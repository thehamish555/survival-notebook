import webpush from 'web-push'
import type { Config } from './config'
import type { DB } from './db'

export type PushMsg = { title: string; body: string; url: string }
export type PushSub = { endpoint: string; p256dh: string; auth: string }
/** Sends one notification. Resolves to false when the browser has dropped the subscription (it gets removed). */
export type PushSender = (sub: PushSub, msg: PushMsg, keys: Vapid) => Promise<boolean>
export type Vapid = { publicKey: string; privateKey: string; subject: string }

/** The server's VAPID keys: from the environment if set, otherwise made once and kept in the database. */
export function vapidKeys(db: DB, config: Config): Vapid {
  const subject = config.VAPID_SUBJECT || 'https://notebook.hamish555.com'
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) return { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY, subject }
  const row = db.prepare("select v from kv where k='vapid'").get() as { v: string } | undefined
  if (row) return { ...JSON.parse(row.v), subject }
  const k = webpush.generateVAPIDKeys()
  db.prepare("insert into kv(k,v) values('vapid',?)").run(JSON.stringify({ publicKey: k.publicKey, privateKey: k.privateKey }))
  return { publicKey: k.publicKey, privateKey: k.privateKey, subject }
}

export const webPushSender: PushSender = async (sub, msg, keys) => {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(msg),
      { vapidDetails: keys, TTL: 6 * 3600, timeout: 10_000 })
    return true
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) return false
    console.error('push failed', e?.statusCode || e?.message)
    return true
  }
}

/** How a member shows up in a notebook (their nickname there, else their account name), and the notebook's title. */
export const whoAndWhere = (db: DB, nb: string, uid: string) => {
  const r = db.prepare("select coalesce(nullif(m.nick,''), u.name, 'Someone') name, n.title from notebooks n left join members m on m.nb=n.id and m.user=? left join users u on u.id=? where n.id=?").get(uid, uid, nb) as { name: string; title: string } | undefined
  return { name: r?.name || 'Someone', title: r?.title || 'a notebook' }
}

export const rowsIn = (raw: string | undefined): any[] => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }

/** Remembers who made each to-do or farm (`by`), so they can hear when it's finished. Clients don't send it, so it's kept from the stored copy. */
export function stampBy(prevRaw: string | undefined, next: any[], uid: string): any[] {
  const before = new Map(rowsIn(prevRaw).map(r => [r?.id, r]))
  return next.map(r => {
    if (!r || typeof r !== 'object' || r.auto || typeof r.by === 'string') return r
    const old = before.get(r.id)
    return { ...r, by: old ? (typeof old.by === 'string' ? old.by : '') : uid }   // rows from before this existed stay unowned
  })
}

/** To-dos someone other than their maker just moved to Done. */
export const newlyDone = (prevRaw: string | undefined, next: any[], by: string) => {
  const before = new Map(rowsIn(prevRaw).map(r => [r?.id, r?.progress]))
  return next.filter(r => r && !r.auto && r.progress === 'Done' && before.has(r.id) && before.get(r.id) !== 'Done' && r.by && r.by !== by)
}
/** Farms that just got marked built. */
export const newlyBuilt = (prevRaw: string | undefined, next: any[]) => {
  const before = new Map(rowsIn(prevRaw).map(r => [r?.id, !!r?.built]))
  return next.filter(r => r && r.built && before.has(r.id) && !before.get(r.id))
}
/** Rows that weren't there before. */
export const newRows = (prevRaw: string | undefined, next: any[]) => { const ids = new Set(rowsIn(prevRaw).map(r => r?.id)); return next.filter(r => r && !ids.has(r.id)) }
export const newDeaths = newRows
/** "A, B and C", or "A, B, C and 4 more". */
export const listOf = (names: string[], max = 3) => names.length <= max ? names.slice(0, -1).join(', ') + (names.length > 1 ? ' and ' : '') + names[names.length - 1] : `${names.slice(0, max).join(', ')} and ${names.length - max} more`

/** Rows (to-dos or farms) that were just assigned to someone other than the person saving. Unchanged assignments are ignored. */
export function newAssignments(prevRaw: string | undefined, next: any[], by: string, members: Set<string>) {
  let prev: any[] = []; try { const v = JSON.parse(prevRaw ?? '[]'); if (Array.isArray(v)) prev = v } catch { /* treat as empty */ }
  const before = new Map(prev.map(r => [r?.id, r?.assignee]))
  return next.filter(r => r && !r.auto && typeof r.assignee === 'string' && r.assignee && r.assignee !== by && members.has(r.assignee) && before.get(r.id) !== r.assignee)
}

/** The kinds of notification, and whether each is on until someone changes it. The busier ones start off. */
export const KINDS = {
  assigned: true,   // someone assigned you a to-do or farm
  finished: true,   // someone finished a to-do you made
  built: true,      // someone built a farm
  deaths: true,     // a teammate died
  invited: true,    // you were added to a notebook
  recap: true,      // the weekly recap is ready
  online: false,    // a teammate started playing
  places: false,    // a teammate added places
  todos: false,     // a teammate added to-dos
} as const
export type Kind = keyof typeof KINDS

/** A person's notification choices, with the defaults filled in. */
export function notifyPrefs(db: DB, user: string): Record<Kind, boolean> {
  let saved: Record<string, unknown> = {}
  try { saved = JSON.parse((db.prepare('select notify from users where id=?').get(user) as { notify: string } | undefined)?.notify || '{}') } catch { /* bad JSON: defaults */ }
  return Object.fromEntries(Object.entries(KINDS).map(([k, d]) => [k, typeof saved[k] === 'boolean' ? saved[k] : d])) as Record<Kind, boolean>
}

/** Notifies every device a user has turned notifications on for, if they want this kind. Fire and forget: never slows down or fails the request. */
export function makeNotify(db: DB, config: Config, send: PushSender) {
  let keys: Vapid | undefined
  return (user: string, msg: PushMsg, kind?: Kind) => {
    if (kind && !notifyPrefs(db, user)[kind]) return
    const subs = db.prepare('select endpoint, p256dh, auth from push_subs where user=?').all(user) as PushSub[]
    if (!subs.length) return
    keys ||= vapidKeys(db, config)
    for (const s of subs) void send(s, msg, keys).then(ok => { if (!ok) db.prepare('delete from push_subs where endpoint=?').run(s.endpoint) }).catch(() => {})
  }
}

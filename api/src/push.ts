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

/** Rows (to-dos or farms) that were just assigned to someone other than the person saving. Unchanged assignments are ignored. */
export function newAssignments(prevRaw: string | undefined, next: any[], by: string, members: Set<string>) {
  let prev: any[] = []; try { const v = JSON.parse(prevRaw ?? '[]'); if (Array.isArray(v)) prev = v } catch { /* treat as empty */ }
  const before = new Map(prev.map(r => [r?.id, r?.assignee]))
  return next.filter(r => r && !r.auto && typeof r.assignee === 'string' && r.assignee && r.assignee !== by && members.has(r.assignee) && before.get(r.id) !== r.assignee)
}

/** Notifies every device a user has turned notifications on for. Fire and forget: never slows down or fails the request. */
export function makeNotify(db: DB, config: Config, send: PushSender) {
  let keys: Vapid | undefined
  return (user: string, msg: PushMsg) => {
    const subs = db.prepare('select endpoint, p256dh, auth from push_subs where user=?').all(user) as PushSub[]
    if (!subs.length) return
    keys ||= vapidKeys(db, config)
    for (const s of subs) void send(s, msg, keys).then(ok => { if (!ok) db.prepare('delete from push_subs where endpoint=?').run(s.endpoint) }).catch(() => {})
  }
}

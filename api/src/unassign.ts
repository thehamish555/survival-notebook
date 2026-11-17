import type { EventEmitter } from 'node:events'
import type { DB } from './db'

/** Clears a user's assignee on every to-do/farm of a notebook (used when they leave, are removed, or delete their account). */
export function unassign(db: DB, bus: EventEmitter, nb: string, user: string) {
  for (const name of ['todos', 'farms']) {
    const row = db.prepare('select data from sections where nb=? and name=?').get(nb, name) as { data: string } | undefined; if (!row) continue
    const arr = JSON.parse(row.data) as any[]; if (!arr.some(x => x?.assignee === user)) continue
    db.prepare('update sections set data=?, rev=rev+1 where nb=? and name=?').run(JSON.stringify(arr.map(x => (x?.assignee === user ? { ...x, assignee: '' } : x))), nb, name)
    bus.emit(nb, { section: name, by: 'server' })
  }
}

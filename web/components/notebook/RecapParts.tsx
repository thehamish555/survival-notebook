'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { defaultFace, playerColour, skinFace } from '@/components/notebook/MapView'

export type Recap = {
  from: number; to: number; title: string
  days: { day: string; ms: number }[]
  members: { uid: string; name: string; mcUuid: string; ms: number; dist: number; places: number; todos: number; farms: number; deaths: number }[]
  totals: { ms: number; dist: number; places: number; todos: number; farms: number; deaths: number; players: number }
  places: { name: string; by: string }[]; todos: { name: string; by: string }[]; farms: { name: string; by: string }[]
  deaths: { cause: string; by: string; ts: number }[]
  highlights: { key: string; label: string; uid: string; name: string; value: number }[]
}

export const playTime = (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }
export const blocks = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString())
const dayName = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short' })

/** Time played each day: one bar per day, hover for the exact time. */
export function DayBars({ days, height = 120 }: { days: Recap['days']; height?: number }) {
  const max = Math.max(...days.map(d => d.ms), 1)
  return <div className="daybars" style={{ height: height + 22 }} role="img" aria-label={days.map(d => `${dayName(d.day)} ${playTime(d.ms)}`).join(', ')}>
    {days.map(d => <div key={d.day} className="daybar" title={`${dayName(d.day)}: ${d.ms ? playTime(d.ms) : 'nobody played'}`}>
      <div className="col" style={{ height }}><div className="fill" style={{ height: d.ms ? `${Math.max(3, (d.ms / max) * 100)}%` : 0 }} /></div>
      <span className="mut small">{dayName(d.day)}</span></div>)}
  </div>
}

/** A player's head: their real skin's face (like the map), the game's default face for their UUID while it loads or if there's no skin, else their initial. */
export function Face({ nb, uuid, uid, name, size = 28 }: { nb: string; uuid: string; uid: string; name: string; size?: number }) {
  const [real, setReal] = useState('')
  useEffect(() => { setReal(''); if (uuid) skinFace(nb, uuid).then(c => setReal(c.toDataURL())).catch(() => {}) }, [nb, uuid])
  const f = uuid ? defaultFace(uuid) : null, src = real || (f ? `/mc/face/${f}.png` : '')
  return src ? <img className="rface" src={src} width={size} height={size} alt="" />
    : <span className="rface" style={{ width: size, height: size, background: playerColour(uid) }}>{name.slice(0, 1).toUpperCase()}</span>
}


/** Home tab: the last 7 days at a glance, linking to the full recap. Hidden until something has happened. */
export function WeekCard({ id }: { id: string }) {
  const [r, setR] = useState<Recap | null>(null)
  useEffect(() => { api(`/notebooks/${id}/recap`).then(setR).catch(() => setR(null)) }, [id])
  if (!r) return null
  const t = r.totals
  const bits = [t.ms >= 60_000 && `${playTime(t.ms)} played`, t.dist >= 100 && `${blocks(t.dist)} blocks travelled`, t.places && `${t.places} new place${t.places === 1 ? '' : 's'}`,
    t.farms && `${t.farms} farm${t.farms === 1 ? '' : 's'} built`, t.todos && `${t.todos} to-do${t.todos === 1 ? '' : 's'} done`, t.deaths && `${t.deaths} death${t.deaths === 1 ? '' : 's'}`].filter(Boolean)
  return <div className="card weekcard"><div className="row"><h2 className="grow">This week</h2><Link className="btn ghost" href={`/n/${id}/recap`}>See the recap</Link></div>
    <p className="mut">{bits.length ? bits.join(' · ') : 'Nothing yet this week. Play time shows up for anyone playing with the mod and Share play time on.'}</p>
    <DayBars days={r.days} height={64} />
  </div>
}

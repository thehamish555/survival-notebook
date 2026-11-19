'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Footer, Loading, McIcon } from '@/lib/ui'
import { DayBars, Face, blocks, playTime, type Recap } from '@/components/notebook/RecapParts'

const range = (r: Recap) => { const f = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); return `${f(r.from)} to ${f(r.to)}` }
const HIGHLIGHT_ICON: Record<string, string> = { ms: 'clock', dist: 'leather_boots', places: 'filled_map', todos: 'writable_book', farms: 'wheat', deaths: 'skeleton_skull' }
const value = (h: Recap['highlights'][number]) => h.key === 'ms' ? playTime(h.value) : h.key === 'dist' ? `${blocks(h.value)} blocks` : String(h.value)

/** The weekly recap: what the team did in the last 7 days, with the weeks before one click away. */
export default function RecapPage() {
  const { id } = useParams<{ id: string }>()
  const [back, setBack] = useState(0), [r, setR] = useState<Recap | null>(null), [err, setErr] = useState('')
  useEffect(() => { setR(null); setErr(''); api(`/notebooks/${id}/recap?back=${back}`).then(setR).catch(e => setErr(e.message)) }, [id, back])

  if (err) return <div className="wrap"><p className="err">{err}</p><Link href={`/n/${id}`}>← Back to the notebook</Link></div>
  if (!r) return <Loading label="Adding up the week…" />
  const t = r.totals, quiet = !t.ms && !t.places && !t.todos && !t.farms && !t.deaths
  const tiles: [string, string, string][] = [['clock', 'Time played', playTime(t.ms)], ['leather_boots', 'Blocks travelled', blocks(t.dist)], ['filled_map', 'New places', String(t.places)],
    ['wheat', 'Farms built', String(t.farms)], ['writable_book', 'To-dos done', String(t.todos)], ['skeleton_skull', 'Deaths', String(t.deaths)]]
  return <>
    <div className="hero"><div className="grow">
      <Link href={`/n/${id}`} className="back">← {r.title}</Link>
      <h1>{back === 0 ? 'This week' : back === 1 ? 'Last week' : `${back} weeks ago`}</h1>
      <p className="mut" style={{ margin: 0 }}>{range(r)}</p>
    </div><div className="row">
      <button className="ghost" disabled={back >= 12} onClick={() => setBack(b => b + 1)}>← Earlier</button>
      <button className="ghost" disabled={back === 0} onClick={() => setBack(b => b - 1)}>Later →</button>
    </div></div>
    <div className="wrap recap">
      {quiet ? <div className="card"><div className="empty">Nothing happened this week. Time played shows up once someone plays with the mod and Share play time on.</div></div> : <>
        <div className="statgrid">{tiles.map(([icon, label, v]) => <div key={label} className="card stat"><span className="si"><McIcon name={icon} size={28} /></span><div className="lbl">{label}</div><div className="big">{v}</div></div>)}</div>
        <div className="recapgrid">
          <div className="card"><h2>Time played each day</h2><DayBars days={r.days} /></div>
          {r.highlights.length > 0 && <div className="card"><h2>Highlights</h2>
            {r.highlights.map(h => { const m = r.members.find(x => x.uid === h.uid)!; return <div className="hl" key={h.key}>
              <McIcon name={HIGHLIGHT_ICON[h.key]} size={24} /><div className="grow"><div className="mut small">{h.label}</div><div className="row" style={{ gap: 8 }}><Face nb={id} uuid={m?.mcUuid || ''} uid={h.uid} name={h.name} size={20} /><b>{h.name}</b></div></div><b>{value(h)}</b></div> })}
          </div>}
        </div>
        <div className="card"><h2>Players</h2><div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>Player</th><th>Played</th><th>Travelled</th><th>Places</th><th>Farms</th><th>To-dos</th><th>Deaths</th></tr></thead>
          <tbody>{r.members.map(m => <tr key={m.uid}><td><span className="row" style={{ gap: 8 }}><Face nb={id} uuid={m.mcUuid} uid={m.uid} name={m.name} />{m.name}</span></td>
            <td>{m.ms ? playTime(m.ms) : '-'}</td><td>{m.dist ? blocks(m.dist) : '-'}</td><td>{m.places || '-'}</td><td>{m.farms || '-'}</td><td>{m.todos || '-'}</td><td>{m.deaths || '-'}</td></tr>)}</tbody>
        </table></div></div>
        <div className="recapgrid">
          {r.places.length > 0 && <List title="New places" icon="filled_map" rows={r.places.map(p => [p.name, p.by])} />}
          {r.farms.length > 0 && <List title="Farms built" icon="wheat" rows={r.farms.map(p => [p.name || 'Unnamed farm', p.by])} />}
          {r.todos.length > 0 && <List title="To-dos done" icon="writable_book" rows={r.todos.map(p => [p.name || 'Untitled to-do', p.by])} />}
          {r.deaths.length > 0 && <List title="Deaths" icon="skeleton_skull" rows={r.deaths.map(d => [d.cause || `${d.by} died`, new Date(d.ts).toLocaleDateString(undefined, { weekday: 'short' })])} />}
        </div>
      </>}
    </div><Footer />
  </>
}

function List({ title, icon, rows }: { title: string; icon: string; rows: [string, string][] }) {
  const [all, setAll] = useState(false), shown = all ? rows : rows.slice(0, 8)
  return <div className="card"><h2 className="row" style={{ gap: 10 }}><McIcon name={icon} size={22} />{title}</h2>
    {shown.map(([a, b], i) => <div className="ench tl" key={i}><b className="grow">{a}</b><span className="mut small">{b}</span></div>)}
    {rows.length > 8 && <button className="ghost" onClick={() => setAll(v => !v)}>{all ? 'Show less' : `Show all ${rows.length}`}</button>}
  </div>
}

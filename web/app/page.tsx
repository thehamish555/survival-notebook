'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/PixelIcon'
import { GoogleSignIn } from '@/components/GoogleSignIn'
import { api, getToken, isOffline, readLocal, saveLocal, setToken } from '@/lib/api'
import { TONES, VERSION } from '@/lib/data'
import { MODRINTH_URL, TAGLINE } from '@/lib/site'
import { timeAgo } from '@/lib/time'
import { Footer, Loading, useConfirm, useToast } from '@/lib/ui'
import { TabIcon } from '@/components/PixelIcon'

const FEATURES: [string, string, string][] = [
  ['places', 'Places', 'Save coordinates for the Overworld, Nether and End. Convert between them and copy a /tp command.'],
  ['gear', 'Enchantments', 'See what each player\'s gear has and which enchantments are still missing.'],
  ['deaths', 'Deaths', 'Where everyone died and what they lost. Tick it off once you get your stuff back.'],
  ['todo', 'To-dos and farms', 'Give jobs to people and tick them off. Farms keep a tutorial video and a Litematica file.'],
  ['stats', 'Stats', 'Play time, blocks mined and distance travelled, taken from each player\'s own game.'],
  ['notes', 'Notes and live sync', 'One shared notes page, and everyone in the notebook sees changes as they happen.'],
]

export default function Home() {
  const confirm = useConfirm(), toast = useToast()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [nbs, setNbs] = useState<any[]>([]), [title, setTitle] = useState('')
  const [err, setErr] = useState(''), [offline, setOffline] = useState(0)
  const load = () => api('/notebooks').then(l => { setNbs(l); setOffline(0); saveLocal('sn_nbs', l) }).then(() => setAuthed(true)).catch((e: any) => {
    if (e.status === 401 || !getToken()) { setToken(''); setAuthed(false); return }
    const copy = isOffline(e) ? readLocal('sn_nbs') : null   // offline: show the list as it was last seen
    if (copy) { setNbs(copy.v); setOffline(copy.at); setAuthed(true) } else { setErr(e.message); setAuthed(false) }
  })
  useEffect(() => { getToken() ? load() : setAuthed(false) }, [])
  const create = async () => { const { id } = await api('/notebooks', 'POST', { title: title.trim() || 'My World' }); location.href = `/n/${id}` }
  const logout = async () => { if (await confirm({ title: 'Log out?', ok: 'Log out' })) { setToken(''); setAuthed(false) } }
  const del = async (n: any) => {
    const owner = n.role === 'owner'
    if (!(await confirm({ title: owner ? `Delete “${n.title}”?` : `Leave “${n.title}”?`, danger: true, ok: owner ? 'Delete forever' : 'Leave',
      body: owner ? 'This permanently deletes the notebook and its data for everyone it is shared with.' : 'You will lose access unless the owner invites you again.' }))) return
    try { const me = await api('/me'); await api(owner ? `/notebooks/${n.id}` : `/notebooks/${n.id}/members/${me.id}`, 'DELETE'); toast(owner ? 'Notebook deleted' : 'You left the notebook', 'ok'); load() } catch (e: any) { toast(e.message, 'err') }
  }
  if (authed === null) return <Loading />

  if (!authed) return <>
    <div className="hero big"><div className="hero-in"><div className="hero-copy"><Logo size={72} />
      <h1>The Survival Notebook</h1><p className="tag">{TAGLINE}</p>
      <div className="row"><a className="btn" href="#join">Start a notebook</a><a className="btn ghost" href={MODRINTH_URL} target="_blank" rel="noreferrer noopener">Get the mod</a></div>
</div>
      <div className="pv" aria-hidden>
        <div className="pv-bar"><i /><i /><i /><b>Survival Notebook</b><span>› Coordinates</span></div>
        <div className="pv-body">
          <div className="pv-side">{[['Home', 'home', ''], ['Coordinates', 'places', '5'], ['Enchantments', 'gear', '4'], ['Deaths', 'deaths', '1'], ['Stats', 'stats', ''], ['To-Do', 'todo', '3'], ['Farms', 'farms', '3'], ['Notes', 'notes', '']].map(([t, ic, n], i) => <div key={t} className={i === 1 ? 'on' : ''}><span><TabIcon name={ic} size={13} /> {t}</span><em>{n}</em></div>)}</div>
          <div className="pv-main">
            <div className="pv-th"><span>Place</span><span>Overworld</span><span>Nether</span><span>End</span></div>
            {[['Base', '120 64 -33', '15 64 -4', ''], ['Fortress', '', '464 61 189', ''], ['Shulker farm', '', '', '100 101 66'], ['Ancient city', '88 -51 -64', '', '']].map(([n, o, ne, e]) => <div className="pv-row" key={n}>
              <b>{n}</b>{[o, ne, e].map((c, k) => <code key={k} className={c ? '' : 'none'}>{c || '·'}</code>)}</div>)}
          </div></div></div></div></div>
    <div className="wrap">
      <div className="landing" id="join">
        <div className="card"><h2>Welcome</h2>
          <p>Make a notebook for each world or server and invite your friends by email.</p>
          <p className="mut">Updated {VERSION.updated} for Minecraft Java {VERSION.java} · Bedrock {VERSION.bedrock}. Ideas or bugs? <a href="mailto:hamishlester555@gmail.com">hamishlester555@gmail.com</a></p></div>
        <div className="card"><h2>Sign in</h2>
          <p className="mut">One click with your Google account. New here? It creates your account.</p>
          <GoogleSignIn onDone={load} onError={setErr} />
          <p className="mut small" style={{ marginTop: 12 }}>By signing in you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link> page.</p>
          {err && <div className="err" role="alert">{err}</div>}</div>
      </div>
      <div className="features">{FEATURES.map(([icon, head, text]) => <div className="card feat" key={head}><span className="fi"><TabIcon name={icon} size={30} /></span><h3>{head}</h3><p className="mut">{text}</p></div>)}</div>
    </div>
    <Footer />
  </>

  return <>
    <div className="hero"><div className="hero-in"><Logo size={64} /><div><h1>Your notebooks</h1><div className="mut">Pick up where you left off.</div></div></div></div>
    <div className="wrap">
      <div className="row" style={{ marginBottom: 14 }}><span className="grow" />
        <button className="ghost" onClick={() => { location.href = '/account' }}>Account &amp; mod</button>
        <button className="ghost" onClick={logout}>Log out</button></div>
      {offline > 0 && <p className="pill t-amber">You're offline. This list was saved {timeAgo(offline)}. Open a notebook you've visited on this device to see its saved copy.</p>}
      <div className="card row"><input className="grow" placeholder="New notebook (a world or server name)" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} /><button onClick={create}>Create</button></div>
      {err && <p className="err">{err}</p>}
      <div className="grid">{nbs.map((n, i) => <div key={n.id} className="card nb" style={{ borderTopColor: ['#5da83a', '#f2c14e', '#3c6fd1', '#d9473a'][i % 4] }}>
        <Link href={`/n/${n.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><h3>{n.title}</h3></Link>
        <div className="mut small" style={{ marginBottom: 8 }}>{n.memberCount} member{n.memberCount === 1 ? '' : 's'} · {n.lastActive ? `active ${timeAgo(n.lastActive)}` : 'no activity yet'}</div>
        <div className="row"><span className={`pill t-${TONES.role[n.role]}`}>{n.role === 'owner' ? 'owner' : `shared · ${n.role}`}</span><span className="grow" />
          <Link className="btn ghost" href={`/n/${n.id}`}>Open</Link>
          <button className="x" onClick={() => del(n)}>{n.role === 'owner' ? 'Delete' : 'Leave'}</button></div></div>)}</div>
      {!nbs.length && <div className="empty"><Logo size={56} /><p>No notebooks yet. Create one above, or ask a friend to invite your email.</p></div>}
    </div>
    <Footer />
  </>
}
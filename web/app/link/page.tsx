'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, getToken } from '@/lib/api'
import { GoogleSignIn } from '@/components/GoogleSignIn'
import { Footer } from '@/lib/ui'

/** Linking the Minecraft mod: the game shows a code (and opens this page with it), you approve it here, and the game connects by itself. */
export default function LinkGame() {
  const [code, setCode] = useState(''), [typed, setTyped] = useState(''), [info, setInfo] = useState<any>(null), [err, setErr] = useState('')
  const [signed, setSigned] = useState(false), [busy, setBusy] = useState(false), [done, setDone] = useState(false)

  useEffect(() => { setSigned(!!getToken()); const c = new URLSearchParams(location.search).get('code') || ''; setCode(c); setTyped(c) }, [])
  useEffect(() => {
    if (!signed || !code) return
    setErr(''); setInfo(null)
    api(`/link/${encodeURIComponent(code)}`).then(i => { setInfo(i); if (i.done) setDone(true) }).catch(e => { if (e.status === 401) setSigned(false); else setErr(e.message) })
  }, [signed, code])

  const approve = async () => {
    setBusy(true)
    try { await api(`/link/${encodeURIComponent(code)}/approve`, 'POST'); setDone(true) }
    catch (e: any) { if (e.status === 401) setSigned(false); else setErr(e.message) }
    setBusy(false)
  }
  const look = () => { const c = typed.trim(); if (c) { setCode(c); history.replaceState(null, '', `/link?code=${encodeURIComponent(c)}`) } }

  return <>
    <div className="hero" style={{ minHeight: 170 }}><div><Link href="/" className="back">← Home</Link><h1>Link Minecraft</h1></div></div>
    <div className="wrap" style={{ maxWidth: 560 }}>
      <div className="card">
        {!signed ? <>
          <h2>Sign in first</h2>
          <p className="mut">Sign in with the Google account you want your notebooks on. The game connects to that account.</p>
          <GoogleSignIn onDone={() => setSigned(true)} onError={setErr} />
        </> : done ? <>
          <h2>Linked</h2>
          <p>Go back to Minecraft. It connects by itself in a few seconds.</p>
          <p className="mut">You can see and remove linked games on your <Link href="/account">Account page</Link>.</p>
        </> : info ? <>
          <h2>Link this game?</h2>
          <p>Check the code matches the one in Minecraft:</p>
          <p className="linkcode">{code.toUpperCase()}</p>
          <p className="mut">{info.name} will be able to sync your places, gear, to-dos, map and stats to your notebooks, as you.</p>
          <div className="row"><button disabled={busy} onClick={approve}>{busy ? 'Linking…' : 'Link this game'}</button><Link href="/" className="btn ghost">Cancel</Link></div>
        </> : <>
          <h2>Enter the code from Minecraft</h2>
          <p className="mut">Press N in game and choose Link this game. The code looks like ABCD-1234.</p>
          <div className="row"><input className="grow" placeholder="ABCD-1234" maxLength={12} value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => e.key === 'Enter' && look()} /><button onClick={look}>Continue</button></div>
        </>}
        {err && <p className="err">{err}</p>}
      </div>
    </div><Footer />
  </>
}

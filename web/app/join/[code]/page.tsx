'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api, getToken } from '@/lib/api'
import { GoogleSignIn } from '@/components/GoogleSignIn'
import { Footer, Loading } from '@/lib/ui'

export default function Join() {
  const { code } = useParams<{ code: string }>()
  const [info, setInfo] = useState<any>(null), [err, setErr] = useState(''), [signed, setSigned] = useState(false), [busy, setBusy] = useState(false)
  useEffect(() => { setSigned(!!getToken()); api(`/invites/${code}`).then(setInfo).catch(e => setErr(e.message)) }, [code])

  const accept = async () => {
    setBusy(true)
    try { const r = await api(`/invites/${code}`, 'POST'); location.href = `/n/${r.id}` }
    catch (e: any) { setBusy(false); if (e.status === 401) { setSigned(false) } else setErr(e.message) }
  }
  if (!info && !err) return <Loading />
  return <>
    <div className="hero" style={{ minHeight: 170 }}><div><Link href="/">← Home</Link><h1>Join a notebook</h1></div></div>
    <div className="wrap" style={{ maxWidth: 560 }}>
      {err && <div className="card"><div className="err">{err}</div><p className="mut">Ask the owner for a new link.</p></div>}
      {info && <div className="card">
        <h2>{info.title}</h2>
        <p className="mut">{info.owner} invited you to this notebook. You will be able to {info.role === 'viewer' ? 'view it' : 'view and edit it'}.</p>
        {signed ? <button disabled={busy} onClick={accept}>{busy ? 'Joining…' : 'Join notebook'}</button>
          : <><p className="mut">Sign in to join.</p><GoogleSignIn onDone={() => { setSigned(true); accept() }} onError={setErr} /></>}
      </div>}
    </div><Footer />
  </>
}
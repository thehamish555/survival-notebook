'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, getToken, setToken } from '@/lib/api'
import { MODRINTH_URL } from '@/lib/site'
import { timeAgo } from '@/lib/time'
import { Footer, Loading, useConfirm, useToast } from '@/lib/ui'
import { AppCard } from '@/components/Pwa'

export default function Account() {
  const confirm = useConfirm(), toast = useToast()
  const [me, setMe] = useState<any>(null), [tokens, setTokens] = useState<any[]>([]), [name, setName] = useState(''), [tokName, setTokName] = useState('')
  const [fresh, setFresh] = useState<any>(null), [delEmail, setDelEmail] = useState(''), [showDel, setShowDel] = useState(false)
  const bad = (e: any) => { if (e.status === 401) { setToken(''); location.href = '/' } else toast(e.message, 'err') }
  const loadTokens = () => api('/me/tokens').then(setTokens).catch(bad)
  useEffect(() => { if (!getToken()) { location.href = '/'; return } api('/me').then(u => { setMe(u); setName(u.name) }).catch(bad); loadTokens() }, [])
  if (!me) return <Loading />

  const saveName = () => api('/me', 'PATCH', { name }).then(() => { toast('Display name updated', 'ok'); setMe({ ...me, name: name.trim() }) }).catch(bad)
  const create = () => api('/me/tokens', 'POST', { name: tokName }).then(t => { setFresh(t); setTokName(''); loadTokens() }).catch(bad)
  const revoke = async (t: any) => { if (await confirm({ title: `Revoke “${t.name}”?`, body: 'The mod using this token will stop syncing until you give it a new one.', ok: 'Revoke', danger: true })) { await api(`/me/tokens/${t.id}`, 'DELETE').catch(bad); loadTokens() } }
  const copy = (txt: string) => { navigator.clipboard.writeText(txt); toast('Copied', 'ok') }
  const destroy = async () => {
    if (!(await confirm({ title: 'Delete your account?', danger: true, ok: 'Delete everything', body: 'This permanently deletes your account, every notebook you own (for everyone it’s shared with), your gear and your tokens. This cannot be undone.' }))) return
    try { await api('/me', 'DELETE', { email: delEmail }); setToken(''); location.href = '/' } catch (e: any) { bad(e) }
  }

  return <>
    <div className="hero" style={{ minHeight: 170 }}><div><Link href="/" className="back">← All notebooks</Link><h1>Account</h1></div></div>
    <div className="wrap">
      <div className="card"><h2>Profile</h2><p className="mut">Signed in with Google as {me.email}. Your display name is what people see unless you set a nickname inside a notebook.</p>
        <div className="row"><input className="grow" maxLength={40} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()} /><button disabled={!name.trim() || name.trim() === me.name} onClick={saveName}>Save</button></div></div>

      <div className="card"><h2>Minecraft mod</h2>
        <p>The mod syncs your enchanted gear, saves coordinates and shows your to-dos in game. Get it on <a href={MODRINTH_URL} target="_blank" rel="noreferrer noopener">Modrinth</a>, then press <kbd>N</kbd> in game and choose <b>Link this game</b>. It opens a page here to approve it, with nothing to copy. You can also make a token below and paste it into the mod’s Settings.</p>
        <div className="row"><input className="grow" placeholder="Token name, e.g. Gaming PC" maxLength={40} value={tokName} onChange={e => setTokName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} /><button onClick={create}>Create token</button></div>
        {fresh && <div className="card" style={{ marginTop: 14, borderColor: '#f2c14e' }}><h3>Copy it now, it won’t be shown again</h3>
          <div className="row"><code className="grow" style={{ wordBreak: 'break-all' }}>{fresh.token}</code><button onClick={() => copy(fresh.token)}>Copy</button></div>
          <p className="mut">A token can sync and edit your notebooks and members as you. It can’t delete notebooks or your account.</p></div>}
        <h3 style={{ marginTop: 18 }}>Your tokens</h3>
        {!tokens.length && <div className="empty">No tokens yet.</div>}
        {tokens.map(t => <div className="ench" key={t.id}><b>{t.name}</b><span className="pill t-gray">created {new Date(t.created).toLocaleDateString()}</span>
          <span className={`pill ${t.lastUsed ? 't-green' : 't-gray'}`}>{t.lastUsed ? `used ${timeAgo(t.lastUsed)}` : 'never used'}</span><span className="grow" /><button className="x" onClick={() => revoke(t)}>Revoke</button></div>)}</div>

      <AppCard />

      <div className="card"><h2>Danger zone</h2>
        {!showDel ? <button className="danger" onClick={() => setShowDel(true)}>Delete my account…</button> : <div className="row">
          <input className="grow" placeholder={`Type ${me.email} to confirm`} value={delEmail} onChange={e => setDelEmail(e.target.value)} />
          <button className="danger" disabled={delEmail.trim().toLowerCase() !== me.email} onClick={destroy}>Delete account</button><button className="ghost" onClick={() => { setShowDel(false); setDelEmail('') }}>Cancel</button></div>}</div>
    </div>
    <Footer />
  </>
}
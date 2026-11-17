'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { downloadFile, uploadFile } from '@/lib/api'
import Link from 'next/link'
import { Logo, TabIcon } from '@/components/PixelIcon'
import { MODRINTH_URL } from '@/lib/site'
import { CHANGELOG, LINKS, clipWords } from '@/lib/data'
import { getVolume, play, setSound, setVolume, soundOn } from '@/lib/sound'
import { looksPasted, parsePaste, type Pasted } from '@/lib/coords'

type Opts = { title: string; body?: string; ok?: string; danger?: boolean }
const Ctx = createContext<(o: Opts) => Promise<boolean>>(async () => false)
export const useConfirm = () => useContext(Ctx)
export const NbId = createContext('')

export function ConfirmProvider({ children }: any) {
  const [s, setS] = useState<any>(null)
  const ask = (o: Opts) => new Promise<boolean>(res => setS({ ...o, res }))
  const close = (v: boolean) => { if (v && s.danger) play('del'); s.res(v); setS(null) }
  useEffect(() => {
    if (!s) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close(false)
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [s])
  return <Ctx.Provider value={ask}>{children}{s && <div className="modal" onClick={() => close(false)}>
    <div className="card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
      <h3>{s.title}</h3>{s.body && <p className="mut">{s.body}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="ghost" onClick={() => close(false)}>Cancel</button>
        <button autoFocus className={s.danger ? 'danger' : ''} onClick={() => close(true)}>{s.ok || 'Confirm'}</button></div>
    </div></div>}</Ctx.Provider>
}

/** Minecraft item icon (extracted from your game by `npm run icons`). Hidden if the texture isn't there. */
/** A clear map pin (replaces the tiny ⌖ glyph). */
export const PinIcon = ({ size = 18 }: { size?: number }) => <svg width={size * 0.8} height={size * 1.15} viewBox="0 0 20 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 26s7.5-7.2 7.5-14.5a7.5 7.5 0 1 0-15 0C2.5 18.8 10 26 10 26z" /><circle cx="10" cy="11.5" r="2.6" /></svg>
/** Copy-a-/tp-command icon: a terminal prompt. */
export const TpIcon = ({ size = 18 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 10 3 2-3 2M13 15h4" /></svg>

export function McIcon({ name, size = 20 }: { name?: string; size?: number }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [name])
  if (!name || bad) return null
  return <img className="mc" src={`/mc/item/${name}.png`} width={size} height={size} alt="" onError={() => setBad(true)} />
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') }, [])
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('sn_theme', next) } catch { /* private mode */ }
    setTheme(next)
  }
  const [snd, setSnd] = useState(true), [vol, setVol] = useState(0.7), [pop, setPop] = useState(false)
  useEffect(() => { setSnd(soundOn()); setVol(getVolume()) }, [])
  // a soft tick on every button press, anywhere on the site
  useEffect(() => {
    const h = (e: MouseEvent) => { if ((e.target as HTMLElement)?.closest?.('button, a, select, summary')) play('click') }
    document.addEventListener('click', h); return () => document.removeEventListener('click', h)
  }, [])
  return <div className="themebtns">
    <button className="ghost themebtn" onClick={flip} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label="Toggle light or dark mode"><TabIcon name={theme === 'dark' ? 'sun' : 'moon'} size={20} /></button>
    <button className="ghost themebtn" onClick={() => setPop(!pop)} title="Sound" aria-label="Sound settings"><TabIcon name={snd && vol > 0 ? 'sound' : 'mute'} size={20} /></button>
    {pop && <div className="volume volpop">
      <button className="x" onClick={() => { setSound(!snd); setSnd(!snd) }}>{snd ? 'Mute' : 'Unmute'}</button>
      <input type="range" min={0} max={100} value={Math.round(vol * 100)} aria-label="Volume" onChange={e => { const v = Number(e.target.value) / 100; setVol(v); setVolume(v); if (!snd && v > 0) { setSound(true); setSnd(true) } }} onMouseUp={() => play('ok')} onKeyUp={() => play('ok')} />
      <span>{Math.round(vol * 100)}%</span></div>}
  </div>
}

// Smart-chip style dropdown: coloured tag that is a real <select>. opts: strings or [value, label]; icons: value -> item texture
export function Pill({ value, opts, tones, icons, onChange }: any) {
  if (opts.length === 2) {
    const vals = opts.map((o: any) => (Array.isArray(o) ? o : [o, o])), cur = vals.find((o: any) => o[0] === value) || vals[0], nxt = vals.find((o: any) => o[0] !== cur[0])
    return <button type="button" className={`pill togglepill t-${tones?.[value] || 'gray'}`} onClick={() => onChange(nxt[0])}>{icons?.[value] && <McIcon name={icons[value]} size={16} />}{cur[1]}</button>
  }
  return <span className={`pill t-${tones?.[value] || 'gray'}`}>{icons?.[value] && <McIcon name={icons[value]} size={16} />}
    <select value={value} onChange={e => onChange(e.target.value)}>{opts.map((o: any) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option> })}</select></span>
}

let iconIndex: Promise<string[]> | null = null
const loadIcons = () => (iconIndex ||= fetch('/mc/index.json').then(r => (r.ok ? r.json() : [])).catch(() => []))
export function IconPicker({ value, onChange, compact }: any) {
  const [open, setOpen] = useState(false), [list, setList] = useState<string[] | null>(null), [q, setQ] = useState('')
  useEffect(() => { if (open && !list) loadIcons().then(setList) }, [open])
  const shown = (list || []).filter(n => n.includes(q.trim().toLowerCase().replace(/\s+/g, '_'))).slice(0, 400)
  return <>
    <button type="button" className={`ghost icobtn${compact ? ' compact' : ''}`} title="Change icon" onClick={() => setOpen(true)}>{value ? <McIcon name={value} size={compact ? 20 : 30} /> : <span className="mut">+</span>}</button>
    {open && <div className="modal" onClick={() => setOpen(false)}><div className="card" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
      <div className="row"><h3 className="grow">Pick an icon</h3><button className="x" onClick={() => setOpen(false)}>✕</button></div>
      <input autoFocus style={{ width: '100%' }} placeholder="Search items, e.g. pickaxe, helmet" value={q} onChange={e => setQ(e.target.value)} />
      {list && !list.length && <div className="empty" style={{ marginTop: 12 }}>No icons installed yet. Run <code>npm run icons</code> in the web folder (see README).</div>}
      <div className="icogrid">{shown.map(n => <button key={n} className="ico" title={n.replace(/_/g, ' ')} onClick={() => { onChange(n); setOpen(false) }}><McIcon name={n} size={32} /></button>)}</div>
      {value && <button className="ghost" onClick={() => { onChange(''); setOpen(false) }}>Clear icon</button>}
    </div></div>}</>
}

type ToastKind = 'ok' | 'err' | 'info'
const ToastCtx = createContext<(msg: string, kind?: ToastKind, action?: { label: string; run: () => void }) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: any) {
  const [list, setList] = useState<{ id: number; msg: string; kind: ToastKind; action?: { label: string; run: () => void } }[]>([]), n = useRef(0)
  const push = useCallback((msg: string, kind: ToastKind = 'info', action?: { label: string; run: () => void }) => {
    const id = ++n.current
    play(kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : 'open')
    setList(l => [...l.slice(-3), { id, msg, kind, action }])
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), action ? 7000 : 4500)
  }, [])
  return <ToastCtx.Provider value={push}>{children}
    <div className="toasts" role="status" aria-live="polite">{list.map(t => <div key={t.id} className={`toast ${t.kind}`}><span>{t.msg}</span>
      {t.action && <button className="ghost" onClick={() => { t.action!.run(); setList(l => l.filter(x => x.id !== t.id)) }}>{t.action.label}</button>}</div>)}</div></ToastCtx.Provider>
}

export function Loading({ label = 'Loading world…' }: { label?: string }) {
  return <div className="loading"><Logo size={64} /><div className="loadbar"><i /></div><div className="mut">{label}</div></div>
}

export function Footer() {
  const [v, date, items] = CHANGELOG[0], { text, cut } = clipWords(items, 100)
  return <footer className="foot"><div className="footin">
    <div className="fcol links"><h3>Links</h3>{LINKS.map(([g, ls]) => <div key={g}><div className="lbl">{g}</div>
      {ls.map(([n, u, desc]) => <div key={u}><a href={u} target="_blank" rel="noreferrer noopener">{n}</a> <span className="mut">· {desc}</span></div>)}</div>)}</div>
    <div className="fcol"><h3>Changelog</h3><div className="lbl">Version {v} · {date}</div><p className="clip">{text}</p>
      <Link href="/changelog">{cut ? 'Read more →' : 'Full changelog →'}</Link></div>
    <div className="fnav"><Logo size={22} /><Link href="/">Home</Link><Link href="/changelog">Changelog</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/account">Account</Link>
      <a href={MODRINTH_URL} target="_blank" rel="noreferrer noopener">Minecraft mod</a></div>
    <p className="mut small">The Survival Notebook v{v} · by Hamish Lester · Not an official Minecraft product. Not approved by or associated with Mojang Studios or Microsoft.</p>
  </div></footer>
}

export const ytId = (u: string) => {
  try {
    const x = new URL(u); let id: string | null = null
    if (x.hostname === 'youtu.be') id = x.pathname.slice(1)
    else if (/(^|\.)youtube\.com$/.test(x.hostname)) id = x.searchParams.get('v') || x.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/)?.[2] || null
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch { return null }
}
const ytTitle = async (u: string) => { try { const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`); return (await r.json()).title as string } catch { return '' } }

// patch(objOrFn): fn receives the row's latest state, so async title lookups never clobber newer edits
export function YtCell({ r, patch }: any) {
  const id = ytId(r.tutorial || ''), bad = r.tutorial && !id
  const [editing, setEditing] = useState(false), [open, setOpen] = useState(false)
  const change = async (v: string) => {
    patch({ tutorial: v, ttl: '' })
    if (!ytId(v)) return
    const t = await ytTitle(v); if (!t) return
    patch((cur: any) => cur.tutorial !== v ? {} : { ttl: t, ...(String(cur.name || '').trim() ? {} : { name: t }) })   // name the farm after the video only if it has no name yet
  }
  if (id && !editing) return <div>
    <button type="button" className="ghost ytbtn" onClick={() => setOpen(true)} title={r.ttl || 'YouTube video'}>▶ {r.ttl || 'YouTube video'}</button>
    {open && <div className="modal" onClick={() => setOpen(false)}><div className="card ytcard" onClick={e => e.stopPropagation()}>
      <img className="ytthumb" src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" />
      <h3>{r.ttl || 'YouTube video'}</h3>
      <div className="row"><a className="btn" href={r.tutorial} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)}>Watch on YouTube</a>
        <button className="ghost" onClick={() => { setOpen(false); setEditing(true) }}>Edit link</button><span className="grow" /><button className="x" onClick={() => setOpen(false)}>Close</button></div></div></div>}
  </div>
  return <div className="inl">
    <input className={bad ? 'bad' : ''} placeholder="Paste a YouTube link" value={r.tutorial || ''} autoFocus={editing} onChange={e => change(e.target.value)} />
    {editing && <button className="ghost" onClick={() => setEditing(false)}>Done</button>}
    {bad && <div className="err" style={{ fontSize: 12 }}>Not a YouTube link</div>}
  </div>
}

export function FileCell({ r, patch }: any) {
  const nb = useContext(NbId), confirm = useConfirm(), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const pick = async (f?: File) => {
    if (!f) return; setErr('')
    if (!/\.litematic$/i.test(f.name)) return setErr('Only .litematic files')
    if (f.size > 102400) return setErr(`${Math.ceil(f.size / 1024)} KB. The limit is 100 KB.`)
    setBusy(true); try { patch({ file: await uploadFile(nb, f) }) } catch (e: any) { setErr(e.message) } setBusy(false)
  }
  const drop = async () => { if (await confirm({ title: 'Remove this file?', body: `“${r.file.name}” will be deleted from the notebook.`, ok: 'Remove', danger: true })) patch({ file: null }) }
  return <div>
    {r.file
      ? <span className="chip t-teal file"><span className="x" role="button" title="Download" onClick={() => downloadFile(nb, r.file).catch(e => setErr(e.message))}>⭳ {r.file.name} · {Math.max(1, Math.round(r.file.size / 1024))} KB</span><button className="x" title="Remove file" onClick={drop}>✕</button></span>
      : <label className="upl">{busy ? 'Uploading…' : '+ Upload .litematic'}<input type="file" accept=".litematic" hidden disabled={busy} onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} /></label>}
    {err && <div className="err" style={{ fontSize: 12 }}>{err}</div>}
  </div>
}

const PREFIX: any = { ow: '/', nether: '/execute in minecraft:the_nether run ', end: '/execute in minecraft:the_end run ' }
/** onOther: called when pasted game text names a different dimension than this column (it never goes in this one). */
export function CoordCell({ v = '', dim, onChange, onOther }: { v?: string; dim: string; onChange: (v: string) => void; onOther?: (p: Pasted) => void }) {
  const [done, setDone] = useState(''), toast = useToast()
  const change = (text: string) => {
    if (!looksPasted(text)) return onChange(text)
    let p: Pasted | null = null
    try { p = parsePaste(text) } catch (e: any) { toast(e.message, 'err'); return }
    if (!p) return onChange(text)
    if (p.dim && p.dim !== dim) return onOther ? onOther(p) : undefined
    onChange(p.xyz)
  }
  const ok = !v || /^-?\d+\s+-?\d+\s+-?\d+$/.test(v.trim())
  const copy = (txt: string, tag: string) => { navigator.clipboard.writeText(txt); setDone(tag); setTimeout(() => setDone(''), 1000) }
  return <div className="row" style={{ flexWrap: 'nowrap', gap: 2 }}>
    <input className={`c-${dim} ${ok ? '' : 'bad'}`} placeholder="x y z" value={v} onChange={e => change(e.target.value)} title="Type x y z, or paste from F3 + C" />
    {v && ok && <>{/* spans, not buttons, so viewers can still copy */}
      <span className="x" role="button" title="Copy coordinates" onClick={() => copy(v.trim(), 'c')}>{done === 'c' ? '✓' : '⧉'}</span>
      <span className="x" role="button" title="Copy /tp command" onClick={() => copy(`${PREFIX[dim]}tp @s ${v.trim()}`, 't')}>{done === 't' ? '✓' : <TpIcon />}</span></>}
  </div>
}
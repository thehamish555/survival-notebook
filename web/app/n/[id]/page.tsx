'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { CAT_ICON, CATS, TAB_ICON, TONES } from '@/lib/data'
import { ENCH, KIND_GROUPS, KINDS, analyseItem, kindOfItem, prettyItem } from '@/lib/enchants'
import { timeAgo } from '@/lib/time'
import { useNotebook } from '@/lib/useNotebook'
import { Footer, Loading, McIcon, NbId, PinIcon, useConfirm, useToast } from '@/lib/ui'
import { TAB_KEY, TabIcon } from '@/components/PixelIcon'
import { BookList, Chips, Deaths, EnchantItem, FS, Legend, Table, uid } from '@/components/notebook/widgets'
import { Stats } from '@/components/notebook/Stats'
import { Shopping } from '@/components/notebook/Shopping'
import { MapView } from '@/components/notebook/MapView'
import { DIM_LABEL, parsePaste, type Dim, type Pasted } from '@/lib/coords'

const isXYZ = (s: string) => /^-?\d+\s+-?\d+\s+-?\d+$/.test((s || '').trim())
const blank = (s: string) => !(s || '').trim()
const conv = (s: string, f: number) => { const n = s.trim().split(/\s+/).map(Number); return [Math.floor(n[0] * f), n[1], Math.floor(n[2] * f)].join(' ') }
const TABS = ['Home', 'Coordinates', 'Map', 'Enchantments', 'Deaths', 'Stats', 'To-Do', 'Farms', 'Shopping', 'Notes']
const ITEM_TAB: Record<string, string> = { Map: 'filled_map', Shopping: 'bundle' }   // tabs drawn with a Minecraft item icon
const SLUG: Record<string, string> = { Home: 'home', Coordinates: 'coordinates', Map: 'map', Enchantments: 'enchantments', Deaths: 'deaths', Stats: 'stats', 'To-Do': 'todo', Farms: 'farms', Shopping: 'shopping', Notes: 'notes' }
// The URL hash remembers where you are (#todo, #enchantments/<player>) so a refresh — or a link from the mod — lands in the same place.
const fromHash = () => {
  if (typeof window === 'undefined') return { tab: 'Home', player: '', members: false }
  const [slug, extra] = location.hash.replace(/^#/, '').split('/')
  return { tab: TABS.find(t => SLUG[t] === slug) || 'Home', player: extra || '', members: slug === 'members' }
}
const PRIO: any = { High: 0, Medium: 1, Low: 2 }, PROG: any = { 'In Progress': 0, 'To-Do': 1, Done: 2 }
const MEMBER_TONES = ['blue', 'amber', 'teal', 'purple', 'red', 'green', 'yellow']

export default function Notebook() {
  const { id } = useParams<{ id: string }>(), confirm = useConfirm(), toast = useToast()
  const { nb, role, d, members, meId, live, err, setErr, activity, mapTiles, mapRev, savedAt, save, reload, edit } = useNotebook(id)
  const [tab, setTab] = useState(() => fromHash().tab), [q, setQ] = useState(''), [fs, setFs] = useState<any>({}), [gp, setGp] = useState(() => fromHash().player), [shareOpen, setShareOpen] = useState(() => fromHash().members), [helpOpen, setHelpOpen] = useState(false)
  const [inv, setInv] = useState({ email: '', role: 'editor' }), [nick, setNick] = useState('')
  const [links, setLinks] = useState<any[]>([]), [lk, setLk] = useState({ role: 'editor', days: '7' })
  const [actOpen, setActOpen] = useState(false), [allAct, setAllAct] = useState<any[]>([]), [actUser, setActUser] = useState('All'), [actSec, setActSec] = useState('All')
  const [since, setSince] = useState(0), seenSet = useRef(false)
  const [paste, setPaste] = useState<{ text: string; dim: string; to: string; name: string } | null>(null)
  const tabs = TABS.filter(t => t !== 'Map' || mapTiles > 0)   // the map only shows once someone's mod has sent some of it
  const go = (t: string) => { setTab(t); setQ(''); history.replaceState(null, '', `#${SLUG[t]}`) }
  const pickPlayer = (uid: string) => { setGp(uid); history.replaceState(null, '', `#enchantments/${uid}`) }
  const F = (k: string) => fs[k] || 'All', setF = (k: string, v: string) => setFs((p: any) => ({ ...p, [k]: v }))

  const tabsRef = useRef(TABS); tabsRef.current = tabs
  useEffect(() => {   // keyboard: 1-9 and 0 tabs, / search, m members, ? help, Esc closes
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === 'Escape') { setShareOpen(false); setHelpOpen(false); return }
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))) return
      if (e.key === '/') { e.preventDefault(); document.querySelector<HTMLInputElement>('input[data-search]')?.focus() }
      else if (e.key === '?') setHelpOpen(h => !h)
      else if (e.key === 'm') setShareOpen(true)
      else if (/^[0-9]$/.test(e.key)) { const t = tabsRef.current[e.key === '0' ? 9 : +e.key - 1]; if (t) go(t) }
    }
    const onHash = () => { const h = fromHash(); setTab(h.tab); if (h.player) setGp(h.player); if (h.members) setShareOpen(true) }
    window.addEventListener('keydown', onKey); window.addEventListener('hashchange', onHash)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onHash) }
  }, [])
  useEffect(() => { if (shareOpen) setNick(members.find(m => m.id === meId)?.nick || '') }, [shareOpen])   // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps farms linked to the place with the same name.
  useEffect(() => {
    if (!edit || !d) return
    const farms: any[] = d.farms || [], places: any[] = d.coords || []
    const norm = (x: string) => (x || '').toLowerCase().replace(/farm/g, '').replace(/[^a-z0-9]/g, '')
    let changed = false
    const linked = farms.map(f => {
      if (f.place || !norm(f.name)) return f
      const c = places.find(p => norm(p.name) && norm(p.name) === norm(f.name)); if (!c) return f
      changed = true; return { ...f, place: c.id }
    })
    if (changed) { save('farms', linked); return }
  }, [d?.farms, d?.coords, edit])   // eslint-disable-line react-hooks/exhaustive-deps

  const [hl, setHl] = useState('')
  const latest = useRef<any>({})   // newest gear for toast actions
  useEffect(() => { if (shareOpen && role === 'owner') loadLinks() }, [shareOpen, role])
  useEffect(() => {
    if (seenSet.current || !activity.length || !meId) return
    seenSet.current = true
    let last = 0; try { last = Number(localStorage.getItem(`sn_seen_${id}`)) || 0 } catch {}
    if (last) setSince(activity.filter((a: any) => a.ts > last && a.user !== meId).length)
    try { localStorage.setItem(`sn_seen_${id}`, String(activity[0].ts)) } catch {}
  }, [activity, meId])
  if (err && !nb) return <div className="wrap"><p className="err">{err}</p><Link href="/">← Back</Link></div>
  if (!nb) return <Loading />

  const match = (r: any) => !q || Object.values(r).join(' ').toLowerCase().includes(q.toLowerCase())
  const search = <input data-search placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 180 }} />
  const resetFilters = () => { setFs({}); setQ('') }
  const showPlace = (pid: string) => {   // jump to a place on the Coordinates tab and flash its row
    resetFilters(); go('Coordinates'); setHl(pid)
    setTimeout(() => document.getElementById('row-' + pid)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
    setTimeout(() => setHl(''), 3500)
  }
  const loadLinks = () => api(`/notebooks/${id}/invites`).then(setLinks).catch(() => {})
  const linkUrl = (code: string) => `${location.origin}/join/${code}`
  const makeLink = async () => { try { const r = await api(`/notebooks/${id}/invites`, 'POST', { role: lk.role, days: Number(lk.days) }); await navigator.clipboard.writeText(linkUrl(r.code)).catch(() => {}); toast('Link copied', 'ok'); loadLinks() } catch (e: any) { setErr(e.message) } }
  const dropLink = async (c: string) => { if (await confirm({ title: 'Remove this link?', body: 'Anyone who has it will no longer be able to join with it. People who already joined stay.', ok: 'Remove', danger: true })) { await api(`/notebooks/${id}/invites/${c}`, 'DELETE').catch((e: any) => setErr(e.message)); loadLinks() } }
  // "N changes since you were last here": remember the newest change you have seen, per notebook
  const openAct = () => { setActOpen(true); api(`/notebooks/${id}/activity?limit=100`).then(setAllAct).catch(() => setAllAct(activity)) }
  const share = async () => { try { await api(`/notebooks/${id}/members`, 'POST', inv); setInv({ ...inv, email: '' }); setErr(''); reload() } catch (e: any) { setErr(e.message) } }
  const remove = async (m: any) => {
    const self = m.id === meId
    if (!(await confirm({ title: self ? 'Leave this notebook?' : `Remove ${m.name}?`, danger: true, ok: self ? 'Leave' : 'Remove',
      body: self ? 'You will lose access unless the owner invites you again.' : `${m.name} will lose access, and anything assigned to them goes back to all users.` }))) return
    await api(`/notebooks/${id}/members/${m.id}`, 'DELETE'); self ? (location.href = '/') : reload()
  }
  const destroy = async () => {
    if (!(await confirm({ title: `Delete “${nb.title}”?`, danger: true, ok: 'Delete forever', body: 'This permanently deletes the notebook and all its data for everyone it is shared with. This cannot be undone.' }))) return
    await api(`/notebooks/${id}`, 'DELETE'); location.href = '/'
  }

  const saveNick = async () => { try { await api(`/notebooks/${id}/nick`, 'PATCH', { nick }); setErr(''); reload() } catch (e: any) { setErr(e.message) } }
  const importJson = async (file?: File) => {
    if (!file) return
    try {
      const j = JSON.parse(await file.text())
      if (j?.app !== 'survival-notebook') throw new Error('That doesn’t look like a Survival Notebook export')
      const fix = (rows: any, farm = false) => (Array.isArray(rows) ? rows : []).filter((r: any) => r && typeof r === 'object').map((r: any) => ({ ...r, id: typeof r.id === 'string' && r.id ? r.id : uid(), ...(farm ? { file: null } : {}) }))
      const [pl, td, fm] = [fix(j.coords), fix(j.todos), fix(j.farms, true)]
      if (!(await confirm({ title: 'Replace this notebook’s contents?', danger: true, ok: 'Replace',
        body: `Importing ${pl.length} places, ${td.length} to-dos and ${fm.length} farms${j.notes ? ' plus notes' : ''} will replace the current ones for everyone. Gear and Litematica files aren’t included in exports. Export a backup first if you’re unsure.` }))) return
      save('coords', pl); save('todos', td); save('farms', fm); save('notes', typeof j.notes === 'string' ? j.notes : '')
      toast('Imported', 'ok'); setShareOpen(false)
    } catch (e: any) { toast(e.message || 'Import failed', 'err') }
  }
  const exportJson = () => {
    const out = { app: 'survival-notebook', title: nb.title, exportedAt: new Date().toISOString(), coords: d.coords || [], todos: d.todos || [], farms: d.farms || [], notes: d.notes || '',
      gear: Object.fromEntries(members.map(m => [m.name, d['gear:' + m.id] || []])) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })), a = document.createElement('a')
    a.href = url; a.download = `${nb.title.replace(/[^\w-]+/g, '_') || 'notebook'}.json`; a.click(); URL.revokeObjectURL(url)
  }

  // ---- pasting coordinates from the game (F3 + C, /tp, or x y z). Never converts between dimensions.
  const putOther = (r: any, p: Pasted, patch: (o: any) => void) => {
    const dim = p.dim as Dim, cur = (r[dim] || '').trim()
    const put = () => { patch({ [dim]: p.xyz }); toast(`That's a ${DIM_LABEL[dim]} position, so it went in the ${DIM_LABEL[dim]} column`, 'info') }
    if (!cur || cur === p.xyz) return put()
    confirm({ title: `Replace the ${DIM_LABEL[dim]} coordinates?`, body: `“${r.name || 'This place'}” has ${cur} in ${DIM_LABEL[dim]}. The pasted position is ${p.xyz}.`, ok: 'Replace' }).then(ok => { if (ok) put() })
  }
  let parsed: Pasted | null = null, pasteErr = ''
  if (paste?.text.trim()) { try { parsed = parsePaste(paste.text); if (!parsed) pasteErr = 'That isn’t a position. Press F3 + C in game, then paste it here.' } catch (e: any) { pasteErr = e.message } }
  const pasteDim = (parsed?.dim || paste?.dim || '') as Dim | ''
  const savePaste = async () => {
    if (!paste || !parsed || !pasteDim) return
    const xyz = parsed.xyz
    if (!paste.to) {
      save('coords', [...coords, { id: uid(), name: paste.name.trim() || 'Pasted place', cat: 'Important', ow: '', nether: '', end: '', portal: 'No Portal', [pasteDim]: xyz }])
    } else {
      const r = coords.find((c: any) => c.id === paste.to); if (!r) return
      const cur = (r[pasteDim] || '').trim()
      if (cur && cur !== xyz && !(await confirm({ title: `Replace the ${DIM_LABEL[pasteDim]} coordinates?`, body: `“${r.name || 'This place'}” has ${cur}. The pasted position is ${xyz}.`, ok: 'Replace' }))) return
      save('coords', coords.map((c: any) => (c.id === paste.to ? { ...c, [pasteDim]: xyz } : c)))
    }
    toast('Saved', 'ok'); setPaste(null)
  }

  // ---- data + filters
  const coords = d.coords || [], myGear = d['gear:' + meId] || [], allTodos: any[] = d.todos || [], farms = d.farms || []
  const todos = allTodos.filter((t: any) => !t.auto)   // the farm to-do isn't a stored row you edit: it's computed from the farms (see below)
  const gearUid = gp && members.some(m => m.id === gp) ? gp : meId, viewingSelf = gearUid === meId
  const gear = d['gear:' + gearUid] || [], gearOwner = members.find(m => m.id === gearUid)   // gear is per member: everyone can view, only the owner edits
  const done = todos.filter((t: any) => t.progress === 'Done').length
  const mineTodos = todos.filter((t: any) => (t.assignee === meId || !members.some(m => m.id === t.assignee)) && t.progress !== 'Done'), mineFarms = farms.filter((f: any) => f.assignee === meId && !f.built)
  const lab = (m: any) => m.name   // the owner is a normal assignee
  const mOpts = [['', 'All users'], ...members.map(m => [m.id, lab(m)])]
  const mTones: any = { '': 'gray', ...Object.fromEntries(members.map((m, i) => [m.id, MEMBER_TONES[i % MEMBER_TONES.length]])) }
  const assignCol = { k: 'assignee', l: 'Assigned to', t: 'pill', opts: mOpts, tones: mTones, norm: (v: string) => (members.some(m => m.id === v) ? v : '') }
  const asgOpts = [['me', 'Mine'], ['none', 'All users'], ...members.filter(m => m.id !== meId).map(m => [m.id, lab(m)])]
  const everyone = (r: any) => !members.some(m => m.id === r.assignee)   // no assignee = for all users
  const asg = (r: any, v: string) => v === 'All' || !!r.auto || (v === 'me' ? r.assignee === meId || everyone(r) : v === 'none' ? everyone(r) : r.assignee === v)   // the auto farm to-do is for everyone, whoever is filtered
  const coordShow = (r: any) => match(r) && (F('cc') === 'All' || r.cat === F('cc')) && (F('cp') === 'All' || (r.portal === 'Linked' ? 'Portal' : r.portal) === F('cp'))
    && (F('ch') === 'All' || !blank(r[({ Overworld: 'ow', Nether: 'nether', End: 'end' } as any)[F('ch')]]))
  const todoShow = (r: any) => !r.auto && match(r) && (F('tp') === 'All' || r.progress === F('tp')) && (F('tr') === 'All' || r.priority === F('tr')) && asg(r, F('ta'))
  const todoSort = F('ts') === 'Priority' ? (a: any, b: any) => PRIO[a.priority] - PRIO[b.priority] : F('ts') === 'Progress' ? (a: any, b: any) => PROG[a.progress] - PROG[b.progress] : undefined
  const fstat = (r: any) => (r.built ? 'Built' : r.building ? 'Building' : 'To build')
  const farmShow = (r: any) => match(r) && (F('fs') === 'All' || fstat(r) === F('fs'))
    && (F('fr') === 'All' || (F('fr') === 'Has video' ? !!r.tutorial : F('fr') === 'No video' ? !r.tutorial : F('fr') === 'Has file' ? !!r.file : !r.file)) && asg(r, F('fa'))
  const placeOpts = [['', 'No place'], ...[...coords].sort((a: any, b: any) => Number(b.cat === 'Farms') - Number(a.cat === 'Farms')).map((c: any) => [c.id, c.name || 'Unnamed place'])]
  const placeTones: any = Object.fromEntries(placeOpts.map(o => [o[0], o[0] ? 'teal' : 'gray']))
  const autoRow = allTodos.find((t: any) => t.auto === 'farms'), autoOn = autoRow ? !!autoRow.on : true   // on by default
  const farmsOpen = farms.filter((f: any) => !f.built), farmsLeft = farmsOpen.length
  const farmsStatus = farmsLeft === 0 ? 'Done' : farmsOpen.some((f: any) => f.building) ? 'In Progress' : 'To-Do'
  const toggleAutoFarms = () => save('todos', autoRow ? allTodos.map((t: any) => (t.auto === 'farms' ? { ...t, on: !autoOn } : t))
    : [...allTodos, { id: 'auto-farms', auto: 'farms', on: false, project: '', priority: 'Medium', progress: 'To-Do', assignee: '', notes: '' }])
  latest.current.gear = gear
  const bulkToggle = (it: any, key: string, nowOff: boolean) => {   // after switching one item, offer to do the same for every other item that has it
    const hit = (x: any) => { const a = analyseItem(x); return (nowOff ? a.missing : a.off).some((m: any) => m.key === key) }
    const others = gear.filter((x: any) => x.id !== it.id && hit(x)); if (!others.length) return
    const name = ENCH[key]?.name || key
    toast(`${name} switched ${nowOff ? 'off' : 'on'} for this item`, 'info', { label: `${nowOff ? 'Switch off' : 'Switch on'} for ${others.length} other item${others.length === 1 ? '' : 's'}`, run: () => {
      const ids = new Set(others.map((x: any) => x.id))
      save('gear:' + meId, (latest.current.gear || []).map((x: any) => { if (!ids.has(x.id)) return x; const cur = new Set<string>(x.off || []); nowOff ? cur.add(key) : cur.delete(key); return { ...x, off: [...cur] } })) } })
  }
  const gearA = gear.map((it: any) => analyseItem(it))
  const maxedN = gearA.filter((x: any) => x.known && x.done).length, toGoN = gearA.reduce((n: number, x: any) => n + (x.known ? x.remaining : 0), 0)
  const gearView = gear.filter((it: any, i: number) => {
    const kind = kindOfItem(it.item || it.icon), grp = kind ? KINDS[kind].group : 'Other'
    return (!q || `${it.name} ${prettyItem(it.item || it.icon)} ${Object.keys(it.enchants || {}).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
      && (F('gg') === 'All' || grp === F('gg')) && (F('gs') === 'All' || (F('gs') === 'Maxed') === (gearA[i].known && gearA[i].done))
  })

  return <NbId.Provider value={id}>
    <div className="hero"><div className="grow">
      <Link href="/">← All notebooks</Link>
      <input className="titlein" defaultValue={nb.title} disabled={!edit} onBlur={e => e.target.value !== nb.title && api(`/notebooks/${id}`, 'PATCH', { title: e.target.value })} />
    </div><button className="ghost" onClick={() => setShareOpen(true)} title="Settings and members (m)"><TabIcon name="settings" size={16} /> Settings<span className={`dot ${live ? '' : 'off'}`} title={live ? 'Live sync connected' : 'Offline. Reconnecting'} /></button></div>

    <div className="shell">
      <nav className="side">{tabs.map(t => <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => go(t)}>
        {ITEM_TAB[t] ? <McIcon name={ITEM_TAB[t]} size={18} /> : <TabIcon name={TAB_KEY[t]} size={18} />}{t}</button>)}</nav>
      <main>
      {err && <p className="err">{err}</p>}
      {savedAt > 0 ? <p className="pill t-amber">You're offline. This is the copy saved {timeAgo(savedAt)}. You can't make changes until you're back online.</p>
        : !edit && <p className="pill t-gray">View only. You can't edit this notebook.</p>}

      <div key={tab} className="pane">
      {tab === 'Home' && <>
        <div className="statgrid">{[
          ['places', 'Coordinates', 'Places', String(coords.length)],
          ['gear', 'Enchantments', 'Items tracked', String(myGear.filter((x: any) => !x.plan).length)],
          ['gear', 'Enchantments', 'Items planned', String(myGear.filter((x: any) => x.plan).length)],
          ['deaths', 'Deaths', 'Not recovered', String((d.deaths || []).filter((x: any) => !x.recovered).length)],
          ['todo', 'To-Do', 'To-dos done', `${done}/${todos.length}`, todos.length ? done / todos.length : 0],
          ['farms', 'Farms', 'Farms built', `${farms.filter((f: any) => f.built).length}/${farms.length}`, farms.length ? farms.filter((f: any) => f.built).length / farms.length : 0],
          ['notes', 'Notes', 'Notes', (d.notes?.trim?.() || (typeof d.notes === 'string' ? d.notes.trim() : '')) ? `${String(d.notes).trim().split(/\s+/).length} words` : 'Empty'],
          ['stats', 'Stats', 'Players with stats', String(members.filter((m: any) => (d['stats:' + m.id] || []).length).length)],
          ['members', '', 'Members', String(members.length)],
        ].map(([icon, to, label, value, frac]: any) => <button key={label} className="homecard stat" onClick={() => (to ? go(to) : setShareOpen(true))}>
          <span className="si"><TabIcon name={icon} size={28} /></span><div className="lbl">{label}</div><div className="big">{value}</div>
          {frac !== undefined && <div className="bar"><div style={{ width: `${frac * 100}%` }} /></div>}</button>)}
        </div>
        <div className="card"><h2>Assigned to you</h2>
          {!mineTodos.length && !mineFarms.length && <div className="empty">Nothing assigned to you right now.</div>}
          {mineTodos.map((t: any) => <div className="ench tl" key={t.id}><span className={`pill t-${TONES.priority[t.priority]}`}>{t.priority}</span><b>{t.project || 'Untitled to-do'}</b><span className={`pill t-${TONES.progress[t.progress]}`}>{t.progress}</span><button className="x" onClick={() => go('To-Do')}>Open →</button></div>)}
          {mineFarms.map((f: any) => <div className="ench tl" key={f.id}><span className="pill t-green">Farm</span><b>{f.name || 'Unnamed farm'}</b><span className="pill t-gray">Not built</span><button className="x" onClick={() => go('Farms')}>Open →</button></div>)}</div>
        <div className="card"><h2>Up next</h2>
          {!todos.some((t: any) => t.priority === 'High' && t.progress !== 'Done') && <div className="empty">No open high-priority to-dos.</div>}
          {todos.filter((t: any) => t.priority === 'High' && t.progress !== 'Done').slice(0, 5).map((t: any) => <div className="ench tl" key={t.id}><b>{t.project || 'Untitled to-do'}</b><span className={`pill t-${TONES.progress[t.progress]}`}>{t.progress}</span>
            <span className={`pill t-${mTones[members.some(m => m.id === t.assignee) ? t.assignee : '']}`}>{members.find(m => m.id === t.assignee)?.name || 'All users'}</span></div>)}</div>
        <div className="card"><div className="row"><h2 className="grow">Recent activity</h2>{activity.length > 0 && <button type="button" className="ghost" onClick={openAct}>See all</button>}</div>
          {since > 0 && <p className="mut">{since} change{since === 1 ? '' : 's'} by others since you were last here.</p>}
          {!activity.length && <div className="empty">Nothing yet. Changes show up here.</div>}
          {activity.slice(0, 8).map((a: any) => <div className="ench" key={a.id}><b style={{ minWidth: 0 }}>{a.name}</b><span>{a.text}</span><span className="grow" /><span className="mut small">{timeAgo(a.ts)}</span></div>)}</div>
        <div className="card"><h2>Team</h2><div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>Member</th><th>Open to-dos</th><th>Farms to build</th><th>Gear items</th></tr></thead>
          <tbody>{members.map(m => <tr key={m.id}><td>{m.name}{m.id === meId ? ' (you)' : ''} <span className={`pill t-${TONES.role[m.role]}`}>{m.role}</span></td>
            <td>{todos.filter((t: any) => t.assignee === m.id && t.progress !== 'Done').length}</td><td>{farms.filter((f: any) => f.assignee === m.id && !f.built).length}</td><td>{(d['gear:' + m.id] || []).length}</td></tr>)}</tbody></table></div></div>
      </>}

      {tab === 'Coordinates' && <div className="card">
        <div className="row"><h2 className="grow">Coordinates</h2>{edit && <button className="ghost" onClick={() => setPaste({ text: '', dim: '', to: '', name: '' })} title="Paste a position from the game">Paste from game</button>}{search}</div>
        <div className="filters">
          <Chips label="Category" value={F('cc')} opts={CATS} onChange={(v: string) => setF('cc', v)} />
          <Chips label="Portal" value={F('cp')} opts={['Portal', 'No Portal']} onChange={(v: string) => setF('cp', v)} />
          <Chips label="Has" value={F('ch')} opts={['Overworld', 'Nether', 'End']} onChange={(v: string) => setF('ch', v)} /></div>
        <p className="mut">Enter coordinates as x y z, or paste what F3 + C copies in game. Use the buttons to copy them or convert between Overworld and Nether.</p>
        <FS edit={edit}><Table rows={coords} hl={hl} onChange={(v: any) => save('coords', v)} show={coordShow} onAdd={resetFilters} empty="No places yet. Add your first one."
          blank={{ name: '', cat: F('cc') === 'All' ? 'Important' : F('cc'), ow: '', nether: '', end: '', portal: 'No Portal' }}
          cols={[{ k: 'name', l: 'Place name', icon: (r: any) => CAT_ICON[r.cat] }, { k: 'cat', l: 'Category', t: 'pill', opts: CATS, tones: TONES.cat }, { k: 'ow', l: 'Overworld', t: 'coord', dim: 'ow', other: putOther }, { k: '_conv', l: '', t: 'custom', render: (r: any, patch: any) => {
              const toN = isXYZ(r.ow) && blank(r.nether), toO = isXYZ(r.nether) && blank(r.ow)
              return <button className="x" disabled={!toN && !toO} onClick={() => patch(toN ? { nether: conv(r.ow, 1 / 8) } : { ow: conv(r.nether, 8) })}
                title={toN ? 'Fill Nether from Overworld (÷8)' : toO ? 'Fill Overworld from Nether (×8)' : 'Fill in one coordinate and leave the other empty, nothing gets overwritten'}>⇄</button>
            } }, { k: 'nether', l: 'Nether', t: 'coord', dim: 'nether', other: putOther }, { k: 'end', l: 'End', t: 'coord', dim: 'end', other: putOther },
            { k: 'portal', l: 'Portal', t: 'pill', opts: ['No Portal', 'Portal'], tones: TONES.portal, norm: (v: string) => (v === 'Linked' ? 'Portal' : v) }]} /></FS>
      </div>}

      {tab === 'Enchantments' && <>
      <div className="card">
        <div className="row"><h2 className="grow">Enchantments</h2>{search}</div>
        <div className="roster">{[...members].sort((x, y) => Number(y.role === 'owner') - Number(x.role === 'owner')).map(m =>
          <button key={m.id} className={`fchip mem ${gearUid === m.id ? 'on' : ''}`} onClick={() => pickPlayer(m.id)}>{m.name}{m.id === meId ? ' (you)' : ''}</button>)}</div>
        <h3>{viewingSelf ? 'Your gear' : `${gearOwner?.name}'s gear`}</h3>
        <p className="mut">{gear.length} item{gear.length === 1 ? '' : 's'} · {maxedN} maxed · {toGoN} enchantment{toGoN === 1 ? '' : 's'} to go</p>
        <div className="filters">
          <Chips label="Type" value={F('gg')} opts={KIND_GROUPS} onChange={(v: string) => setF('gg', v)} />
          <Chips label="Status" value={F('gs')} opts={['Maxed', 'To go']} onChange={(v: string) => setF('gs', v)} /></div>
        {!viewingSelf && <p className={`pill t-${mTones[gearUid]}`}>Viewing {gearOwner?.name}'s gear. Only they can edit it</p>}
        <Legend />
        {!gear.length && <div className="empty">{viewingSelf ? 'No gear yet. Add an item, or let the mod fill this in.' : `${gearOwner?.name} hasn't added any gear yet.`}</div>}
        {!!gear.length && !gearView.length && <div className="empty">Nothing matches these filters.</div>}
        <FS edit={edit && viewingSelf}>{gearView.map((it: any) => <EnchantItem key={it.id} it={it} onToggled={bulkToggle}
          onChange={(n: any) => save('gear:' + meId, gear.map((x: any) => (x.id === it.id ? n : x)))}
          onDelete={async () => { if ((!Object.keys(it.enchants || {}).length && !Object.keys(it.goal || {}).length) || await confirm({ title: `Delete “${it.alias || it.name || prettyItem(it.item || it.icon) || 'this item'}”?`, body: 'Its enchantments and goals will be removed.', ok: 'Delete', danger: true })) save('gear:' + meId, gear.filter((x: any) => x.id !== it.id)) }} />)}
          {viewingSelf && <div className="row"><button title="Add an item you plan to make" onClick={() => { resetFilters(); save('gear:' + meId, [...gear, { id: uid(), name: '', item: '', enchants: {}, plan: true }]) }}>+ Add item</button></div>}</FS>
      </div>
      {!!gearView.length && <BookList items={gearView} />}
      </>}

      {tab === 'Deaths' && <div className="card"><h2>Deaths</h2>
        <p className="mut">Deaths are recorded by the mod.</p>
        <FS edit={edit}><Deaths rows={d.deaths || []} members={members} meId={meId} onChange={(rows: any) => save('deaths', rows)} /></FS></div>}

      {tab === 'Stats' && <div className="card"><h2>Player stats</h2>
        <p className="mut">Stats come from the mod.</p>
        <Stats row={(d['stats:' + gearUid] || [])[0]} members={members} who={gearUid} setWho={pickPlayer} /></div>}

      {tab === 'To-Do' && <><div className="card farmtodo">
        <div className="row"><McIcon name="wheat" size={24} /><h3 className="grow" style={{ margin: 0 }}>{autoOn ? `Build farms - ${farmsLeft}` : 'Farm to-do hidden'}</h3>
          {autoOn && <span className={`pill t-${TONES.progress[farmsStatus]}`}>{farmsStatus}</span>}
          <button className="ghost" disabled={!edit} onClick={toggleAutoFarms} title="Based on your farms">{autoOn ? 'Hide' : 'Show'}</button></div>
        {autoOn && <><p className="mut" style={{ margin: '6px 0' }}>{farmsLeft === 0 ? (farms.length ? 'Every farm is built.' : 'No farms yet. Add some on the Farms tab.') : 'Updates as farms are built.'}</p>
          {farmsOpen.map((f: any) => <div className="ench" key={f.id}><b style={{ minWidth: 0 }}>{f.name || 'Unnamed farm'}</b><span className={`pill t-${f.building ? 'blue' : 'gray'}`}>{f.building ? 'Building' : 'To build'}</span>
            <span className="grow" /><button className="x" onClick={() => go('Farms')}>Open →</button></div>)}</>}</div>
      <div className="card">
        <div className="row"><h2 className="grow">To-Do list</h2>{search}</div>
        <div className="filters">
          <Chips label="Progress" value={F('tp')} opts={['To-Do', 'In Progress', 'Done']} onChange={(v: string) => setF('tp', v)} />
          <Chips label="Priority" value={F('tr')} opts={['High', 'Medium', 'Low']} onChange={(v: string) => setF('tr', v)} />
          <Chips label="Assigned" value={F('ta')} opts={asgOpts} onChange={(v: string) => setF('ta', v)} />
          <Chips label="Sort" all="Manual" value={F('ts')} opts={['Priority', 'Progress']} onChange={(v: string) => setF('ts', v)} /></div>
        <p className="mut">Give a to-do an item icon and a quantity, like 64 glass, and it goes on the shopping list.</p>
        {!!todos.length && <div className="bar lab"><div style={{ width: `${(done / todos.length) * 100}%` }} /><span>{done} of {todos.length} done</span></div>}
        <FS edit={edit}><Table rows={allTodos} onChange={(v: any) => save('todos', v)} show={todoShow} sort={todoSort} onAdd={resetFilters} empty="Nothing to do yet." blank={{ project: '', priority: 'Medium', progress: 'To-Do', assignee: '', notes: '', qty: '' }}
          cols={[{ k: 'project', l: 'Project', icon: (r: any) => r.icon, pick: true }, { k: 'qty', l: 'Qty', t: 'num' }, { k: 'priority', l: 'Priority', t: 'pill', opts: ['Low', 'Medium', 'High'], tones: TONES.priority }, { k: 'progress', l: 'Progress', t: 'pill', opts: ['To-Do', 'In Progress', 'Done'], tones: TONES.progress }, assignCol, { k: 'notes', l: 'Notes' }]} /></FS></div></>}

      {tab === 'Farms' && <div className="card">
        <div className="row"><h2 className="grow">Farms</h2>{search}</div>
        <div className="filters">
          <Chips label="Status" value={F('fs')} opts={['To build', 'Building', 'Built']} onChange={(v: string) => setF('fs', v)} />
          <Chips label="Resources" value={F('fr')} opts={['Has video', 'No video', 'Has file', 'No file']} onChange={(v: string) => setF('fr', v)} />
          <Chips label="Assigned" value={F('fa')} opts={asgOpts} onChange={(v: string) => setF('fa', v)} /></div>
        <p className="mut">Farms link to a place with the same name. Paste a YouTube link to name a farm automatically.</p>
        <FS edit={edit}><Table rows={farms} onChange={(v: any) => save('farms', v)} show={farmShow} onAdd={resetFilters} empty="No farms yet." blank={{ name: '', icon: '', tutorial: '', ttl: '', file: null, assignee: '', place: '', building: false, built: false }}
          cols={[{ k: 'name', l: 'Farm', icon: (r: any) => r.icon, pick: true }, { k: 'place', l: 'Location', t: 'pill', opts: placeOpts, tones: placeTones, norm: (v: string) => (coords.some((c: any) => c.id === v) ? v : ''), after: (r: any) => (r.place && coords.some((c: any) => c.id === r.place) ? <button className="x pin" title="Show this place on the Coordinates tab" onClick={() => showPlace(r.place)}><PinIcon /></button> : null) }, { k: 'tutorial', l: 'Tutorial video', t: 'yt' }, { k: 'file', l: 'Litematica', t: 'file' }, assignCol, { k: 'status', l: 'Status', t: 'pill', opts: ['To build', 'Building', 'Built'], tones: { 'To build': 'gray', Building: 'blue', Built: 'green' }, get: fstat, set: (v: string) => ({ built: v === 'Built', building: v === 'Building' }) }]} /></FS></div>}

      {tab === 'Map' && (mapTiles > 0 ? <MapView id={id} rev={mapRev} places={coords} role={role} onPlace={showPlace} />
        : <div className="card"><h2>Map</h2><div className="empty">No map yet. It appears once someone turns on Share map in the mod's Settings and explores.</div></div>)}

      {tab === 'Shopping' && <Shopping id={id} d={d} members={members} meId={meId} who={gearUid} setWho={pickPlayer} edit={edit} />}

      {tab === 'Notes' && <div className="card"><h2>Notes</h2>
        <textarea style={{ width: '100%', maxWidth: 760, minHeight: 360, resize: 'vertical' }} readOnly={!edit} value={typeof d.notes === 'string' ? d.notes : ''} onChange={e => save('notes', e.target.value)} placeholder="Anything about this world…" /></div>}
      </div>
      </main>
    </div>
    <Footer />

    {shareOpen && <div className="modal" onClick={() => setShareOpen(false)}><div className="card" style={{ maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
      <div className="row"><h2 className="grow">Settings</h2><button className="x" onClick={() => setShareOpen(false)}>✕</button></div>
      {members.map(m => <div className="row" key={m.id} style={{ padding: '4px 0' }}>
        <span className="grow">{m.name}{m.id === meId ? ' (you)' : ''} {(role === 'owner' || m.id === meId) && <span className="mut">{m.nick ? `${m.realName} · ` : ''}{m.email}</span>}</span>
        <span className={`pill t-${TONES.role[m.role]}`}>{m.role}</span>
        {((role === 'owner' && m.role !== 'owner') || (m.id === meId && m.role !== 'owner')) && <button className="x" onClick={() => remove(m)}>{m.id === meId ? 'Leave' : 'Remove'}</button>}</div>)}
      <h3 style={{ marginTop: 18 }}>Your nickname</h3>
      <div className="row"><input className="grow" maxLength={32} placeholder={`Shown instead of ${members.find(m => m.id === meId)?.realName || 'your name'}`} value={nick} onChange={e => setNick(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNick()} />
        <button onClick={saveNick}>Save</button></div>
      <p className="mut">Leave blank to use your account name.</p>
      {role === 'owner' && <><h3>Invite someone</h3><div className="row">
        <input className="grow" placeholder="Their account email" value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} onKeyDown={e => e.key === 'Enter' && share()} />
        <button type="button" className="ghost" onClick={() => setInv({ ...inv, role: inv.role === 'editor' ? 'viewer' : 'editor' })}>{inv.role === 'editor' ? 'Can edit' : 'View only'}</button>
        <button onClick={share}>Invite</button></div>
        <h3>Invite link</h3>
        <p className="mut">Anyone with the link can join after signing in with Google.</p>
        <div className="row">
          <button type="button" className="ghost" onClick={() => setLk({ ...lk, role: lk.role === 'editor' ? 'viewer' : 'editor' })}>{lk.role === 'editor' ? 'Can edit' : 'View only'}</button>
          <Chips label="Expires in" noAll value={lk.days} opts={[['1', '1 day'], ['7', '7 days'], ['30', '30 days']]} onChange={(v: string) => setLk({ ...lk, days: v })} />
          <button onClick={makeLink}>Create link</button></div>
        {links.map(l => <div className="row" key={l.code} style={{ padding: '4px 0' }}>
          <span className="grow mut small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.role === 'editor' ? 'Can edit' : 'View only'} · {l.uses} joined · expires {new Date(l.expires).toLocaleDateString()}</span>
          <button className="ghost" onClick={() => { navigator.clipboard.writeText(linkUrl(l.code)); toast('Link copied', 'ok') }}>Copy</button>
          <button className="x" onClick={() => dropLink(l.code)}>Remove</button></div>)}</>}
      {err && <p className="err">{err}</p>}
      <h3 style={{ marginTop: 18 }}>Backup</h3>
      <div className="row"><button className="ghost" onClick={exportJson}>Export notebook (JSON)</button>
        <label className={`btn ghost ${edit ? '' : 'off'}`} style={edit ? undefined : { opacity: .4, pointerEvents: 'none' }}>Import…<input type="file" accept="application/json,.json" hidden disabled={!edit} onChange={e => { importJson(e.target.files?.[0]); e.target.value = '' }} /></label></div>
      {role === 'owner' && <><h3 style={{ marginTop: 18 }}>Danger zone</h3><button className="danger" onClick={destroy}>Delete this notebook</button></>}
    </div></div>}
    {actOpen && <div className="modal" onClick={() => setActOpen(false)}><div className="card" style={{ maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
      <div className="row"><h2 className="grow">Activity</h2><button className="x" onClick={() => setActOpen(false)}>✕</button></div>
      <div className="row" style={{ marginBottom: 8 }}>
        <Chips label="Person" value={actUser} opts={[...new Map(allAct.map((a: any) => [a.user, a.name])).entries()]} onChange={setActUser} />
        <Chips label="Section" value={actSec} opts={[...new Set(allAct.map((a: any) => a.section))].map(x => [x, x === 'members' ? 'Members' : String(x)[0].toUpperCase() + String(x).slice(1)])} onChange={setActSec} /></div>
      {allAct.filter((a: any) => (actUser === 'All' || a.user === actUser) && (actSec === 'All' || a.section === actSec)).map((a: any) =>
        <div className="ench" key={a.id}><b style={{ minWidth: 0 }}>{a.name}</b><span>{a.text}</span><span className="grow" /><span className="mut small">{timeAgo(a.ts)}</span></div>)}
      {!allAct.length && <div className="empty">Nothing yet.</div>}</div></div>}
    {paste && <div className="modal" onClick={() => setPaste(null)}><div className="card" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
      <div className="row"><h2 className="grow">Paste from game</h2><button className="x" onClick={() => setPaste(null)}>✕</button></div>
      <p className="mut">Press F3 + C in game to copy where you are, then paste it here. A /tp command or plain x y z works too.</p>
      <textarea autoFocus rows={2} style={{ width: '100%' }} placeholder="/execute in minecraft:overworld run tp @s 1303.46 60.00 -1888.91 6.34 20.58" value={paste.text} onChange={e => setPaste({ ...paste, text: e.target.value })} />
      {pasteErr && <p className="err">{pasteErr}</p>}
      {parsed && <>
        <div className="row" style={{ margin: '10px 0' }}><code>{parsed.xyz}</code>
          {parsed.dim ? <span className={`pill t-${parsed.dim === 'ow' ? 'green' : parsed.dim === 'nether' ? 'red' : 'purple'}`}>{DIM_LABEL[parsed.dim]}</span>
            : <Chips label="Dimension" noAll value={paste.dim || 'pick'} opts={[...(paste.dim ? [] : [['pick', 'Choose…']]), ['ow', 'Overworld'], ['nether', 'Nether'], ['end', 'End']]} onChange={(v: string) => setPaste({ ...paste, dim: v === 'pick' ? '' : v })} />}</div>
        {!parsed.dim && <p className="mut small">This kind of paste doesn't say which dimension it's from, so pick it.</p>}
        <div className="row"><Chips label="Save to" noAll value={paste.to} opts={[['', 'New place'], ...coords.map((c: any) => [c.id, c.name || 'Unnamed place'])]} onChange={(v: string) => setPaste({ ...paste, to: v })} />
          {!paste.to && <input className="grow" placeholder="Place name" value={paste.name} onChange={e => setPaste({ ...paste, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && savePaste()} />}</div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="ghost" onClick={() => setPaste(null)}>Cancel</button><button disabled={!pasteDim} onClick={savePaste}>Save</button></div></>}
    </div></div>}
    {helpOpen && <div className="modal" onClick={() => setHelpOpen(false)}><div className="card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
      <div className="row"><h2 className="grow">Keyboard shortcuts</h2><button className="x" onClick={() => setHelpOpen(false)}>✕</button></div>
      {[['1 – 9, 0', 'Switch tab'], ['/', 'Search this tab'], ['m', 'Settings & backup'], ['?', 'This help'], ['Esc', 'Close any window']].map(([k, v]) => <div className="ench" key={k}><kbd>{k}</kbd><span>{v}</span></div>)}
    </div></div>}
  </NbId.Provider>
}
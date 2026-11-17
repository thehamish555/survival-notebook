'use client'
import { useRef, useState } from 'react'
import { play } from '@/lib/sound'
import { ENCH, KIND_GROUPS, KINDS, analyse, bookList, conflictsOf, gearParts, kindOfItem, lvl } from '@/lib/enchants'
import { roman } from '@/lib/data'
import { timeAgo } from '@/lib/time'
import { CoordCell, FileCell, IconPicker, McIcon, Pill, YtCell, useConfirm, useToast } from '@/lib/ui'

export const uid = () => Math.random().toString(36).slice(2, 10)

export function FS({ edit, children }: any) { return <fieldset disabled={!edit} className="fs">{children}</fieldset> }   // read-only for viewers

/** A labelled dropdown filter (replaces the old row of chips). */
export function Chips({ label, value, opts, onChange, all = 'All', noAll }: any) {
  const items = [...(noAll ? [] : [['All', all]]), ...opts.map((o: any) => (Array.isArray(o) ? o : [o, o]))]
  return <label className={`fsel ${value !== 'All' && !noAll ? 'on' : ''}`}><span className="lbl">{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)}>{items.map(([v, l]: any) => <option key={v} value={v}>{l}</option>)}</select></label>
}

export function Table({ cols, rows, onChange, blank, extra, show, sort, empty, onAdd, hl }: any) {
  const confirm = useConfirm(), ref = useRef(rows); ref.current = rows
  const patch = (rid: string, o: any) => onChange(ref.current.map((r: any) => (r.id === rid ? { ...r, ...(typeof o === 'function' ? o(r) : o) } : r)))
  const del = async (r: any) => {
    const filled = cols.some((c: any) => (!c.t || c.t === 'coord' || c.t === 'yt' || c.t === 'file') && String(r[c.k] || '').trim())
    if (filled && !(await confirm({ title: 'Delete this row?', body: r[cols[0].k] ? `“${r[cols[0].k]}” will be removed for everyone with access.` : undefined, ok: 'Delete', danger: true }))) return
    if (!filled) play('del')
    onChange(ref.current.filter((x: any) => x.id !== r.id))
  }
  // drag to reorder (only while the table shows its stored order: no sort, no filter)
  const [drag, setDrag] = useState(''), [over, setOver] = useState('')
  const canDrag = !sort
  const drop = (to: string) => {
    if (!drag || drag === to) return
    const list = [...ref.current], from = list.findIndex((x: any) => x.id === drag), dest = list.findIndex((x: any) => x.id === to)
    if (from < 0 || dest < 0) return
    const [m] = list.splice(from, 1); list.splice(dest, 0, m); onChange(list)
  }
  const view = (sort ? [...rows].sort(sort) : rows).filter((r: any) => !show || show(r))
  return <>
    {!rows.length && <div className="empty">{empty}</div>}
    {!!rows.length && !view.length && <div className="empty">Nothing matches these filters.</div>}
    {!!view.length && <div className="tblwrap"><table>
      <thead><tr>{canDrag && <th style={{ width: 22 }} />}{cols.map((c: any) => <th key={c.k}>{c.l}</th>)}<th /></tr></thead>
      <tbody>{view.map((r: any) => <tr key={r.id} id={'row-' + r.id} className={`${hl === r.id ? 'hl' : ''} ${over === r.id && drag ? 'dropat' : ''} ${drag === r.id ? 'dragging' : ''}`}
        onDragOver={canDrag ? e => { if (drag) { e.preventDefault(); setOver(r.id) } } : undefined} onDrop={canDrag ? e => { e.preventDefault(); drop(r.id); setDrag(''); setOver('') } : undefined}>
        {canDrag && <td className="grip" draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDrag(r.id) }} onDragEnd={() => { setDrag(''); setOver('') }} title="Drag to reorder">⋮⋮</td>}
        {cols.map((c: any) => <td key={c.k}>{
          c.t === 'custom' ? c.render(r, (o: any) => patch(r.id, o))
          : c.t === 'pill' ? <div className="inl"><Pill value={c.get ? c.get(r) : c.norm ? c.norm(r[c.k]) : r[c.k]} opts={c.opts} tones={c.tones} icons={c.icons} onChange={(v: string) => patch(r.id, c.set ? c.set(v) : { [c.k]: v })} />{c.after?.(r)}</div>
          : c.t === 'icon' ? <IconPicker value={r[c.k]} onChange={(v: string) => patch(r.id, { [c.k]: v })} />
          : c.t === 'check' ? <input type="checkbox" checked={!!r[c.k]} onChange={e => patch(r.id, { [c.k]: e.target.checked })} />
          : c.t === 'coord' ? <CoordCell v={r[c.k]} dim={c.dim} onChange={(v: string) => patch(r.id, { [c.k]: v })} />
          : c.t === 'yt' ? <YtCell r={r} patch={(o: any) => patch(r.id, o)} />
          : c.t === 'file' ? <FileCell r={r} patch={(o: any) => patch(r.id, o)} />
          : c.icon ? <div className="inl">{c.pick ? <IconPicker compact value={r.icon || c.icon(r)} onChange={(v: string) => patch(r.id, { icon: v })} /> : <McIcon name={c.icon(r)} size={20} />}<input value={r[c.k] ?? ''} onChange={e => patch(r.id, { [c.k]: e.target.value })} /></div>
          : <input value={r[c.k] ?? ''} onChange={e => patch(r.id, { [c.k]: e.target.value })} />}</td>)}
        <td style={{ whiteSpace: 'nowrap' }}>{extra?.(r, patch)}<button className="x" title="Delete row" onClick={() => del(r)}>✕</button></td></tr>)}</tbody>
    </table></div>}
    <button style={{ marginTop: 8 }} onClick={() => { onAdd?.(); onChange([...rows, { id: uid(), ...blank }]) }}>+ Add row</button>
  </>
}

/**
 * One piece of gear. Coloured chips are on the item; outlined "+" chips are what it can still get (click to add / want it);
 * red struck-through chips are switched off for THIS item (click to switch back on); purple ★ chips are enchants you want on it.
 * Synced items can't have real enchants added by hand — adding one marks it as wanted instead.
 */
export function EnchantItem({ it, onChange, onDelete, onToggled }: any) {
  const itemId: string = it.item || it.icon || '', kind = kindOfItem(itemId), k = kind ? KINDS[kind] : undefined
  const parts = gearParts(it), a = analyse(kind, parts.have, { off: parts.off, goal: parts.goal })
  const locked = !!it.mod, plan = !!it.plan, wantOnly = locked || plan   // synced and planned items can't have enchants added by hand
  const [pick, setPick] = useState(''), [lv, setLv] = useState(0)
  const setEnchants = (e: Record<string, number>) => onChange({ ...it, enchants: e })
  const unwant = (name: string) => { const g = { ...(it.goal || {}) }, e = { ...(it.enchants || {}) }; delete g[name]; if (plan) delete e[name]; onChange({ ...it, goal: g, ...(plan ? { enchants: e } : {}) }) }
  const toggleOff = (key: string) => { const cur = new Set<string>(it.off || []), nowOff = !cur.has(key); nowOff ? cur.add(key) : cur.delete(key); onChange({ ...it, off: [...cur] }); onToggled?.(it, key, nowOff) }
  const pickKind = (key: string) => { const v = KINDS[key]?.variants[0]; onChange({ ...it, item: v?.id || '', icon: v?.id || '', group: undefined }) }
  const taken = new Set(Object.keys(it.enchants || {}))
  const ownedKeys = new Set(k ? k.enchants.filter(key => taken.has(ENCH[key].name)) : [])
  const applicable = k ? k.enchants.filter(key => !ENCH[key].curse && !taken.has(ENCH[key].name) && ![...conflictsOf(key)].some(c => ownedKeys.has(c))).map(key => ENCH[key]) : []   // never offers something that conflicts with what's on it
  const sel = applicable.find(d => d.name === pick) || applicable[0]
  const level = sel ? Math.min(lv || sel.max, sel.max) : 1
  const title = it.alias || it.name
  return <div className={`card gear ${plan ? 'plan' : ''}`}>
    <div className="row"><McIcon name={itemId} size={30} />
      <input className="grow" placeholder={locked ? (it.name || 'Nickname (optional)') : 'Name (optional), e.g. Mining pick'} value={locked ? it.alias || '' : it.name} onChange={e => onChange({ ...it, [locked ? 'alias' : 'name']: e.target.value })} title={locked ? 'Your own name for this item (the game name is kept)' : ''} />
      <select value={kind || ''} disabled={locked} onChange={e => pickKind(e.target.value)}>
        <option value="">Choose item…</option>
        {KIND_GROUPS.map(g => <optgroup key={g} label={g}>{Object.entries(KINDS).filter(([, x]) => x.group === g).map(([key, x]) => <option key={key} value={key}>{x.label}</option>)}</optgroup>)}
      </select>
      {k && k.variants.length > 1 && <select value={itemId} disabled={locked} onChange={e => onChange({ ...it, item: e.target.value, icon: e.target.value })}>{k.variants.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select>}
      {a.known && <span className={`pill t-${a.done ? 'green' : 'gray'}`}>{a.done ? 'Maxed ✓' : `${a.remaining} to go`}</span>}
      {plan && <span className="pill t-purple" title="An item you plan to make">planned</span>}
      {it.away && <span className="pill t-gray" title="Not in your inventory right now">stored</span>}
      {locked && <span className="pill t-teal" title="Synced from the mod">from game</span>}
      <button className="x" title="Delete item" onClick={onDelete}>✕</button></div>
    {!k && <p className="mut" style={{ margin: '8px 0 0' }}>Pick an item to see its enchantments.</p>}
    {title && locked && it.alias && <p className="mut" style={{ margin: '4px 0 0' }}>{it.name}</p>}
    <div style={{ margin: '8px 0', minHeight: 28 }}>
      {!a.owned.length && !a.missing.length && !a.goals.length && !a.off.length && <span className="mut">No enchantments yet</span>}
      {a.owned.map(o => <span key={o.name} className={`chip t-${o.state === 'curse' ? 'red' : o.state === 'max' ? 'green' : o.state === 'low' ? 'yellow' : 'gray'} ${o.state === 'max' ? 'glint' : ''}`}>
        {o.state === 'low' && !wantOnly
          ? <button className="x lvl" title={`Set to ${o.max}`} onClick={() => setEnchants({ ...it.enchants, [o.name]: o.max })}>{lvl(o.name, o.level, o.max)} → {o.max}</button>
          : <>{lvl(o.name, o.level, o.max)}{o.state === 'low' && ` - ${roman(o.max)}`}</>}
        {!wantOnly && <button className="x" title="Remove" onClick={() => { const e = { ...it.enchants }; delete e[o.name]; setEnchants(e) }}>✕</button>}</span>)}
      {a.goals.map(g => <span key={g.key} className="chip want" title="Old goal"><span className="star">★</span> {lvl(g.name, g.max, g.max)}<button className="x" title="Remove" onClick={() => unwant(g.name)}>✕</button></span>)}
      {a.missing.map(m => <span className="gc" key={m.key}><button className={`chip ghostchip ${m.alt ? 'alt' : ''}`} title={wantOnly ? (m.alt ? `${m.name} conflicts with another option. Pick one. Click to switch it off for this item` : `Needed. Click to switch ${m.name} off for this item`) : (m.alt ? 'Pick one. These conflict with each other' : `Add ${m.name}`)}
        onClick={() => (wantOnly ? toggleOff(m.key) : setEnchants({ ...it.enchants, [m.name]: m.max }))}>+ {lvl(m.name, m.max, m.max)}</button></span>)}
      {a.off.map(m => <button key={m.key} className="chip offchip" title={`${m.name} is switched off for this item. Click to track it again`} onClick={() => toggleOff(m.key)}>{lvl(m.name, m.max, m.max)}</button>)}</div>
    {k && !wantOnly && !!applicable.length && <div className="row"><span className="lbl">Add</span>
      <select value={sel?.name} onChange={e => { setPick(e.target.value); setLv(0) }}>{applicable.map(d => <option key={d.name}>{d.name}</option>)}</select>
      {(sel?.max || 1) > 1 && <select value={level} onChange={e => setLv(+e.target.value)}>{Array.from({ length: sel?.max || 1 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>}
      <button className="ghost" onClick={() => sel && setEnchants({ ...it.enchants, [sel.name]: level })}>Add</button></div>}
  </div>
}

/** Enchanted books still needed to max a set of items. */
export function BookList({ items }: { items: any[] }) {
  const list = bookList(items)
  if (!list.length) return null
  return <div className="card"><h3>Books you still need</h3>
    <p className="mut">Books you still need across the items shown.</p>
    <div>{list.map(b => <span key={b.name} className="chip t-purple">{lvl(b.name, b.max, b.max)}{b.count > 1 && ` ×${b.count}`}</span>)}</div></div>
}

export function Legend() {
  const L: [string, string][] = [['t-green', 'Max'], ['t-yellow', 'Below max'], ['t-red', 'Curse'], ['ghost', 'Still needed'], ['off', 'Switched off']]
  return <div className="legend">{L.map(([t, l]) => <span className="lg" key={l}><i className={`sw ${t}`} />{l}</span>)}
    <span className="hint">Click an enchant to switch it off for this item</span></div>
}

const DIM: Record<string, { label: string; tone: string; tp: string }> = {
  ow: { label: 'Overworld', tone: 'green', tp: '/tp @s ' }, nether: { label: 'Nether', tone: 'red', tp: '/execute in minecraft:the_nether run tp @s ' }, end: { label: 'End', tone: 'purple', tp: '/execute in minecraft:the_end run tp @s ' } }

/** Where people died and what they lost (recorded by the Minecraft mod). */
export function Deaths({ rows, members, meId, onChange }: any) {
  const confirm = useConfirm(), toast = useToast()
  const [who, setWho] = useState('All'), [status, setStatus] = useState('All')
  const copy = (txt: string) => { navigator.clipboard.writeText(txt); toast('Copied', 'ok') }
  const name = (id: string) => members.find((m: any) => m.id === id)?.name || 'Someone'
  const view = [...rows].sort((a: any, b: any) => (b.ts || 0) - (a.ts || 0)).filter((r: any) => (who === 'All' || r.uid === who) && (status === 'All' || (status === 'Recovered') === !!r.recovered))
  const patch = (id: string, o: any) => onChange(rows.map((r: any) => (r.id === id ? { ...r, ...o } : r)))
  const del = async (r: any) => { if (await confirm({ title: 'Delete this death?', body: 'It will be removed for everyone.', ok: 'Delete', danger: true })) onChange(rows.filter((x: any) => x.id !== r.id)) }
  return <>
    <div className="filters">
      <Chips label="Player" value={who} opts={members.map((m: any) => [m.id, m.name])} onChange={setWho} />
      <Chips label="Status" value={status} opts={['Lost', 'Recovered']} onChange={setStatus} /></div>
    {!rows.length && <div className="empty">No deaths recorded. The Minecraft mod logs where you died and what you lost, so you can get your stuff back.</div>}
    {!!rows.length && !view.length && <div className="empty">Nothing matches these filters.</div>}
    {view.map((r: any) => {
      const dimKey = ['ow', 'nether', 'end'].find(k => (r[k] || '').trim()) || 'ow', d = DIM[dimKey], coords = (r[dimKey] || '').trim()
      return <div className={`card death d-${dimKey} ${r.recovered ? 'rec' : ''}`} key={r.id}>
        <div className="row"><McIcon name="totem_of_undying" size={26} /><b style={{ minWidth: 0 }}>{name(r.uid)}{r.uid === meId ? ' (you)' : ''}</b><span className={`pill t-${d.tone}`}>{d.label}</span>
          <span className="mut small">{timeAgo(r.ts)}</span><span className="grow" />
          <label className="row"><input type="checkbox" checked={!!r.recovered} onChange={e => patch(r.id, { recovered: e.target.checked })} /> Recovered</label>
          <button className="x" title="Delete" onClick={() => del(r)}>✕</button></div>
        {r.cause && <p className="mut" style={{ margin: '6px 0' }}>{r.cause}</p>}
        {coords && <div className="row"><code>{coords}</code><button className="ghost" onClick={() => copy(coords)}>Copy</button><button className="ghost" onClick={() => copy(d.tp + coords)}>Copy /tp</button></div>}
        <p style={{ margin: '8px 0 4px' }}>{r.items ?? 0} item{r.items === 1 ? '' : 's'} lost{r.xp ? ` · level ${r.xp}` : ''}</p>
        <div>{(r.enchanted || []).map((e: any, i: number) => <span key={i} className="chip t-purple"><McIcon name={e.item} size={14} />{e.name}{e.summary && ` · ${e.summary}`}</span>)}</div>
      </div>
    })}
  </>
}

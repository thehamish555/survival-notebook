'use client'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { bookList, lvl, prettyItem } from '@/lib/enchants'
import { timeAgo } from '@/lib/time'
import { McIcon } from '@/lib/ui'
import { Chips } from '@/components/notebook/widgets'

type Line = { key: string; icon: string; label: string; need: number; have: number | null; from: string[] }

/** "1,250 (19 stacks + 34)": big counts are easier to gather in stacks. Items that don't stack to 64 just show the number. */
const amount = (n: number, single = false) => single || n < 64 ? n.toLocaleString() : `${n.toLocaleString()} (${Math.floor(n / 64)} stack${n >= 128 ? 's' : ''}${n % 64 ? ` + ${n % 64}` : ''})`
const UNSTACKABLE = /(_bucket|_bed|_boat|_raft|_minecart|_shulker_box|^shulker_box|_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|^saddle|^cake|^potion|^enchanted_book)$/

/**
 * What still needs gathering: blocks for farms not built yet (from their Litematica files), quantities typed on open to-dos,
 * and enchanted books for the player's gear. Compared with the inventory the mod last sent (shulker boxes and bundles included).
 */
export function Shopping({ id, d, members, meId, who, setWho, edit }: any) {
  const farms: any[] = (d.farms || []).filter((f: any) => !f.built && f.file?.id)
  const [blocks, setBlocks] = useState<Record<string, { items: Record<string, number>; error?: string }>>({}), [loadErr, setLoadErr] = useState('')
  const [skip, setSkip] = useState<Set<string>>(new Set()), [show, setShow] = useState('Still needed')
  const fileKey = farms.map(f => f.file.id).join(',')
  useEffect(() => { if (!fileKey) return; api(`/notebooks/${id}/blocks`).then(setBlocks).catch(e => setLoadErr(e.message)) }, [id, fileKey])

  const inv = (d['inv:' + who] || [])[0], name = members.find((m: any) => m.id === who)?.name || 'This player'
  const lines = useMemo(() => {
    const m = new Map<string, Line>()
    const add = (key: string, icon: string, label: string, n: number, from: string) => {
      const l = m.get(key) ?? { key, icon, label, need: 0, have: null, from: [] }
      l.need += n; if (!l.from.includes(from)) l.from.push(from); m.set(key, l)
    }
    for (const f of farms) if (!skip.has(f.id)) for (const [item, n] of Object.entries(blocks[f.file.id]?.items || {})) add(item, item, prettyItem(item.replace(/^.*:/, '')), n, f.name || 'Unnamed farm')
    for (const t of d.todos || []) {
      const q = Math.floor(Number(t.qty)); if (t.auto || t.progress === 'Done' || !(q > 0)) continue
      add(t.icon || 'todo:' + t.id, t.icon || '', t.icon ? prettyItem(t.icon) : t.project || 'Untitled to-do', q, 'To-do: ' + (t.project || 'Untitled'))
    }
    for (const b of bookList(d['gear:' + who] || [])) add(`book:${b.name}:${b.max}`, 'enchanted_book', `${lvl(b.name, b.max, b.max)} book`, b.count, 'Gear')
    const items: Record<string, number> = inv?.items || {}, books: [string, number, number][] = Array.isArray(inv?.books) ? inv.books : []
    for (const l of m.values()) {
      if (!inv) continue
      if (l.key.startsWith('book:')) { const [, n, lv] = l.key.split(':'); l.have = books.filter(([bn, bl]) => bn === n && bl >= Number(lv)).reduce((s, [, , c]) => s + c, 0) }
      else if (!l.key.startsWith('todo:')) l.have = items[l.key] || 0
    }
    return [...m.values()].sort((a, b) => (b.need - (b.have ?? 0)) - (a.need - (a.have ?? 0)) || a.label.localeCompare(b.label))
  }, [farms, blocks, skip, d.todos, d['gear:' + who], inv])   // eslint-disable-line react-hooks/exhaustive-deps

  const left = (l: Line) => Math.max(0, l.need - (l.have ?? 0))
  const view = lines.filter(l => show === 'Everything' || l.have === null || left(l) > 0)
  const doneN = lines.filter(l => l.have !== null && left(l) === 0).length
  const flip = (fid: string) => setSkip(s => { const n = new Set(s); n.has(fid) ? n.delete(fid) : n.add(fid); return n })

  return <div className="card">
    <div className="row"><h2 className="grow">Shopping list</h2>
      <Chips label="Show" noAll value={show} opts={['Still needed', 'Everything']} onChange={setShow} /></div>
    <div className="roster">{members.map((m: any) => <button key={m.id} className={`fchip mem ${who === m.id ? 'on' : ''}`} onClick={() => setWho(m.id)}>{m.name}{m.id === meId ? ' (you)' : ''}</button>)}</div>
    <p className="mut">{inv ? `Compared with ${who === meId ? 'your' : `${name}'s`} inventory from ${timeAgo(inv.ts)}, including shulker boxes and bundles.`
      : `No inventory from ${who === meId ? 'you' : name} yet. The mod sends it when Share inventory is on in its Settings.`}</p>
    {!!farms.length && <div className="filters"><span className="lbl">Farms counted</span>{farms.map(f => <button key={f.id} type="button" className={`fchip ${skip.has(f.id) ? '' : 'on'}`} onClick={() => flip(f.id)} title={blocks[f.file.id]?.error || f.file.name}>
      {f.icon && <McIcon name={f.icon} size={16} />}{f.name || 'Unnamed farm'}{blocks[f.file.id]?.error ? ' (unreadable)' : ''}</button>)}</div>}
    {loadErr && <p className="err">{loadErr}</p>}
    {!lines.length && <div className="empty">Nothing to gather. Attach Litematica files to farms you haven't built, give to-dos a quantity, or plan gear that needs books.</div>}
    {!!lines.length && !view.length && <div className="empty">You have everything on the list.</div>}
    {!!view.length && <div className="tblwrap"><table>
      <thead><tr><th>Item</th><th>Need</th><th>Have</th><th>Still need</th><th>For</th></tr></thead>
      <tbody>{view.map(l => <tr key={l.key} className={l.have !== null && !left(l) ? 'got' : ''}>
        <td><div className="inl">{l.icon && <McIcon name={l.icon} size={20} />}<b style={{ fontWeight: 500 }}>{l.label}</b></div></td>
        <td>{amount(l.need, UNSTACKABLE.test(l.key))}</td>
        <td className="mut">{l.have === null ? '–' : l.have.toLocaleString()}</td>
        <td>{l.have === null ? '–' : left(l) ? <b>{amount(left(l), UNSTACKABLE.test(l.key))}</b> : <span className="pill t-green">Got it</span>}</td>
        <td className="mut small">{l.from.join(', ')}</td></tr>)}</tbody></table></div>}
    {lines.length > 0 && inv && <p className="mut small">{doneN} of {lines.length} done.{!edit ? '' : ' Tick off a to-do or mark a farm built to take it off the list.'}</p>}
  </div>
}

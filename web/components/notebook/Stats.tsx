'use client'
import { Chips } from './widgets'
import { McIcon } from '@/lib/ui'
import { timeAgo } from '@/lib/time'

export type StatsRow = { ts?: number; world?: string; mode?: string; playTicks?: number; deaths?: number; mobKills?: number; playerKills?: number; damageDealt?: number; damageTaken?: number; jumps?: number
  distCm?: Record<string, number>; totals?: Record<string, number>; advancements?: number; mined?: [string, number][]; mobs?: [string, number][]; killedBy?: [string, number][]; crafted?: [string, number][]; used?: [string, number][] }

const n = (v?: number) => (v || 0).toLocaleString()
const hours = (ticks = 0) => { const m = Math.floor(ticks / 20 / 60), h = Math.floor(m / 60); return h >= 1 ? `${h} h ${m % 60} m` : `${m} m` }
const blocks = (cm = 0) => { const b = cm / 100; return b >= 1000 ? `${(b / 1000).toFixed(1)} km` : `${Math.round(b).toLocaleString()} m` }
const pretty = (id: string) => id.replace(/^minecraft[:.]/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
const DIST: Record<string, string> = { walk: 'Walking', sprint: 'Sprinting', sneak: 'Sneaking', swim: 'Swimming', fly: 'Flying', elytra: 'Elytra', climb: 'Climbing', fall: 'Falling', boat: 'Boat', minecart: 'Minecart', horse: 'Horse', pig: 'Pig', strider: 'Strider', walk_on_water: 'On water', walk_under_water: 'Underwater' }

const TRAVEL_ICON: Record<string, string> = { walk: 'leather_boots', sprint: 'golden_boots', sneak: 'leather_leggings', swim: 'cod', walk_under_water: 'turtle_helmet', walk_on_water: 'lily_pad', fly: 'feather', elytra: 'elytra', climb: 'ladder', fall: 'slime_ball', boat: 'oak_boat', minecart: 'minecart', horse: 'saddle', pig: 'carrot_on_a_stick', strider: 'warped_fungus_on_a_stick' }
const MOB_ICON: Record<string, string> = { player: 'player_head', ender_dragon: 'dragon_head', wither: 'nether_star', snow_golem: 'carved_pumpkin', zombified_piglin: 'zombified_piglin_spawn_egg' }
const mobIcon = (id: string) => { const k = id.replace(/^minecraft[:.]/, ''); return MOB_ICON[k] || `${k}_spawn_egg` }
const CARD_ICON: Record<string, string> = { 'Time played': 'clock', Deaths: 'bone', 'Mobs killed': 'iron_sword', 'Distance travelled': 'leather_boots', 'Blocks mined': 'iron_pickaxe', 'Items crafted': 'crafting_table', Jumps: 'rabbit_foot', 'Damage dealt': 'diamond_sword', Advancements: 'experience_bottle' }
/** Fixed-width icon slot so names line up even when a texture is missing. */
const Ico = ({ name, size = 18 }: { name?: string; size?: number }) => <span className="ico-slot" style={{ width: size, height: size }}><McIcon name={name} size={size} /></span>

const ROWS = 10   // every box shows the same number of rows so they all line up, even when there's less to show
function Box({ title, empty, children }: any) { return <div className="card statbox"><h3>{title}</h3>{children}{empty && <p className="mut">Nothing yet.</p>}</div> }
function Top({ title, rows, icons, mobs }: { title: string; rows?: [string, number][]; icons?: boolean; mobs?: boolean }) {
  const list = (rows || []).slice(0, ROWS), max = list[0]?.[1] || 1
  return <Box title={title} empty={!list.length}>{Array.from({ length: ROWS }, (_, i) => list[i] ? <div className="statrow" key={i}>
    <span className="sname">{icons && <Ico name={list[i][0].replace(/^minecraft[:.]/, '')} />}{mobs && <Ico name={mobIcon(list[i][0])} />}{pretty(list[i][0])}</span>
    <span className="sbar"><i style={{ width: `${Math.max(3, (list[i][1] / max) * 100)}%` }} /></span><b>{n(list[i][1])}</b></div> : <div className="statrow ghostrow" key={i} />)}</Box>
}

/** One player's vanilla statistics, as shared by the Minecraft mod (the same numbers as the game's own Statistics screen). */
export function Stats({ row, members, who, setWho }: { row?: StatsRow; members: any[]; who: string; setWho: (v: string) => void }) {
  const dist = Object.entries(row?.distCm || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const totalDist = dist.reduce((s, [, v]) => s + v, 0)
  return <>
    <div className="filters"><Chips label="Player" noAll value={who} opts={members.map((m: any) => [m.id, m.name])} onChange={setWho} /></div>
    {!row && <div className="empty">No stats yet. With the mod installed they sync on their own (Settings, Share stats). These are the game's own Statistics numbers, vanilla only, nothing from cheats or commands.</div>}
    {row && <>
      <p className="mut">Updated {row.ts ? timeAgo(row.ts) : 'recently'}{row.world ? ` · ${row.world}` : ''}{row.mode === 'mp' ? ' · multiplayer' : ' · singleplayer'}</p>
      <div className="grid">
        {[['Time played', hours(row.playTicks)], ['Deaths', n(row.deaths)], ['Mobs killed', n(row.mobKills)], ['Distance travelled', blocks(totalDist)],
          ['Blocks mined', n(row.totals?.mined)], ['Items crafted', n(row.totals?.crafted)], ['Jumps', n(row.jumps)], ['Damage dealt', n(Math.round((row.damageDealt || 0) / 10))],
          ...(row.advancements != null ? [['Advancements', n(row.advancements)]] : [])].map(([l, v]) => <div className="card statcard" key={l}><Ico name={CARD_ICON[l]} size={28} /><div><div className="lbl">{l}</div><div className="big">{v}</div></div></div>)}
      </div>
      <div className="grid2">
        <Box title="How you travel" empty={!dist.length}>{Array.from({ length: ROWS }, (_, i) => dist[i] ? <div className="statrow" key={i}><span className="sname"><Ico name={TRAVEL_ICON[dist[i][0]]} />{DIST[dist[i][0]] || pretty(dist[i][0])}</span>
          <span className="sbar"><i style={{ width: `${Math.max(3, (dist[i][1] / dist[0][1]) * 100)}%` }} /></span><b>{blocks(dist[i][1])}</b></div> : <div className="statrow ghostrow" key={i} />)}</Box>
        <Top title="Most mined" rows={row.mined} icons /><Top title="Most killed" rows={row.mobs} mobs /><Top title="Killed by" rows={row.killedBy} mobs /><Top title="Most crafted" rows={row.crafted} icons /><Top title="Most used" rows={row.used} icons />
      </div></>}
  </>
}

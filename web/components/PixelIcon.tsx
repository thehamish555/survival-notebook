import { LOGO_RECTS } from './pixel-data'

/** The notebook logo (see scripts/gen-art.py). Item icons elsewhere on the site are Minecraft's own. */
export function Logo({ size = 40 }: { size?: number }) {
  return <svg className="pxi" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" role="img" aria-label="The Survival Notebook">
    {LOGO_RECTS.map(([x, y, c], i) => <rect key={i} x={x} y={y} width="1" height="1" fill={c} />)}</svg>
}

import { TAB_ICONS } from '@/lib/tab-icons'
/** One of the shared pixel icons (the same ones the Minecraft mod draws in its sidebar). */
export function TabIcon({ name, size = 18 }: { name: string; size?: number }) {
  const ic = TAB_ICONS[name]
  if (!ic) return null
  return <svg className="tabicon" width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden>
    {ic.rows.flatMap((r, y) => [...r].map((c, x) => c === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={ic.pal[c]} />))}</svg>
}
export const TAB_KEY: Record<string, string> = { Home: 'home', Coordinates: 'places', Map: 'map', Enchantments: 'gear', Deaths: 'deaths', Stats: 'stats', 'To-Do': 'todo', Farms: 'farms', Shopping: 'shopping', Notes: 'notes', Members: 'members' }

export const SECTIONS = ['coords', 'todos', 'farms', 'notes', 'deaths', 'shop'] as const   // shop: who's getting which shopping list item   // plus per-member sections: gear:, prefs:, stats: and inv:<userId>
export const OWN_RE = /^(gear|prefs|stats|inv):([0-9a-f-]{36})$/   // per-member sections: only that member may write them (inv = inventory snapshot from the mod)
// New notebooks start completely blank.
export const seed = (): Record<string, unknown> => ({ coords: [], todos: [], farms: [], notes: '', deaths: [], shop: [] })

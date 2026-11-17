export const SECTIONS = ['coords', 'todos', 'farms', 'notes', 'deaths'] as const   // plus per-member sections: gear:<userId>, prefs:<userId> and stats:<userId>
export const OWN_RE = /^(gear|prefs|stats):([0-9a-f-]{36})$/   // per-member sections: only that member may write them
// New notebooks start completely blank.
export const seed = (): Record<string, unknown> => ({ coords: [], todos: [], farms: [], notes: '', deaths: [] })

// Enchantments as of Java 26.3 / Bedrock 26.60 (spear + Lunge added in 1.21.11).
export const VERSION = { java: '26.3', bedrock: '26.60', updated: 'November 17th, 2026' }
export type Ench = [string, number]
export const ENCHANTS: Record<string, Ench[]> = {
  'All Purpose': [['Unbreaking', 3], ['Mending', 1], ['Curse of Binding', 1], ['Curse of Vanishing', 1]],
  Armor: [['Protection', 4], ['Blast Protection', 4], ['Fire Protection', 4], ['Projectile Protection', 4], ['Respiration', 3], ['Aqua Affinity', 1], ['Swift Sneak', 3], ['Depth Strider', 3], ['Feather Falling', 4], ['Frost Walker', 2], ['Soul Speed', 3], ['Thorns', 3]],
  Weapons: [['Sharpness', 5], ['Bane of Arthropods', 5], ['Smite', 5], ['Sweeping Edge', 3], ['Looting', 3], ['Fire Aspect', 2], ['Knockback', 2], ['Breach', 4], ['Density', 5], ['Wind Burst', 3]],
  Spear: [['Lunge', 3], ['Sharpness', 5], ['Bane of Arthropods', 5], ['Smite', 5], ['Looting', 3], ['Fire Aspect', 2], ['Knockback', 2]],
  Tools: [['Efficiency', 5], ['Fortune', 3], ['Silk Touch', 1]],
  'Fishing Rod': [['Luck of the Sea', 3], ['Lure', 3]],
  'Bow & Crossbow': [['Power', 5], ['Punch', 2], ['Flame', 1], ['Infinity', 1], ['Multishot', 1], ['Piercing', 4], ['Quick Charge', 3]],
  Trident: [['Impaling', 5], ['Riptide', 3], ['Loyalty', 3], ['Channeling', 1]],
}
export const groupEnchants = (g: string): Ench[] => [...(ENCHANTS[g] || []), ...(g === 'All Purpose' ? [] : ENCHANTS['All Purpose'])]
export const roman = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V'][n] || String(n)
export const CATS = ['Important', 'Farms', 'Biomes', 'Structures', 'Other']

export const LINKS: [string, [string, string, string][]][] = [
  ['Fabric', [['Fabric', 'https://fabricmc.net/', 'Core Fabric mod loader'], ['Fabric API', 'https://modrinth.com/mod/fabric-api', 'Required for most Fabric mods'], ['Fabric mods on Modrinth', 'https://modrinth.com/mods?g=categories:fabric', 'Browse everything'], ['r/fabricmc', 'https://www.reddit.com/r/fabricmc/', 'Community'], ['Litematica', 'https://modrinth.com/mod/litematica', 'Schematic overlays for building farms'], ['MaLiLib', 'https://modrinth.com/mod/malilib', 'Required for Litematica']]],
  ['General Purpose', [['Farm EVERYTHING (RaysWorks)', 'https://docs.google.com/spreadsheets/d/1S3jBzfy_PtJhQI_5jFIN3lXBiUEMebt_rT2x5os2MYw/edit#gid=1671671217', 'Big farm spreadsheet'], ['Mods, Shaders & Resource Packs', 'https://docs.google.com/document/d/1oaWBsayp9SluzaHlVlHO6sscz4QwrNuHQP2gpwPU-f4/edit?usp=sharing', "Hamish's own collection"]]],
]

export const CHANGELOG: [string, string, string[]][] = [
  ["3.4.0", "November 18th, 2026", ["Feature:", "Link the Minecraft mod without copying a token: press Link this game in the mod, check the code on the page that opens, and approve it.", "Fix:", "The enchantment glint shimmers smoothly across items like in game, instead of in blocky steps.", "The Map tab’s description is shorter, like the other pages."]],
  ["3.3.1", "November 18th, 2026", ["Fix:", "Players without a Minecraft skin show on the map with the same default face the game gives them, instead of a letter."]],
  ["3.3.0", "November 17th, 2026", ["Feature:", "Map tab: the mod draws a map of where players explore, with your places shown by their category icons. Each player can turn it off with Share map in the mod. Parts nobody has visited for 90 days are cleared once a day, except within 256 blocks of a saved place, and the owner can press Clear old tiles.", "Your team on the map: everyone with the mod shows live with their Minecraft face and a pointer for where they're looking. Their last spot stays after they log off, dimmed with when they were last seen, and the Team list finds anyone on the map. Each player can turn it off with Share position in the mod.", "Icons for every item, drawn the way the game draws them: blocks, chests, heads, banners, beds and more in 3D, animated where the game animates (the clock, compasses, the bow, sea lanterns, sculk), the enchantment glint on shiny items, and real colours for leather armour and potions.", "Potions, splash and lingering potions and tipped arrows come in every effect's colour, like Potion of Healing and Arrow of Poison.", "Fix:", "The header is easy to read in light and dark mode: page titles follow the theme, the back button stands out over the picture, and the picture fades smoothly into the page.", "Long YouTube titles wrap in the video popup, Stats lists line up, and the drag handle on table rows is wider.", "Map, Shopping, the sound button and the light and dark mode button have their own pixel icons."]],
  ["3.2.0", "November 17th, 2026", ["Feature:", "Paste coordinates from the game. Press F3 + C in Minecraft and paste into a coordinate box or the Paste from game button. The dimension comes from what you copied, and a plain /tp asks you to pick one.", "Shopping list tab (also in the mod): adds up the blocks for farms you haven't built (read from their Litematica files), quantities on to-dos and the books your gear still needs, then compares them with what you're carrying in game, including shulker boxes, bundles and your ender chest. Potions and tipped arrows count exactly.", "Shopping list: press I'll get it on an item so everyone can see who's gathering it.", "To-dos have a Qty column. Give one an item icon and a quantity, like 64 glass, and it goes on the shopping list.", "Install the site as an app from the Account page. Notebooks you've opened still show when you're offline, read-only. The app icon has rounded corners, and notifications show a small notebook icon in the status bar.", "The picture shown when you share a link to the site matches the home page."]],
  ["3.1.0", "November 17th, 2026", ["Feature:", "Invite links: the owner can make a link (can edit or view only, lasting 1, 7 or 30 days) and anyone who signs in with it joins the notebook. Links can be copied or removed in Settings.", "Recent activity says what changed: names, which fields, and things like finishing a to-do or building a farm. Changes made in game are marked, clicking one opens that section, and See all has filters for person and section. Home says how many changes others made since you were last here.", "Notifications: turn them on per device on the Account page to hear when someone assigns you a to-do or farm, adds you to a notebook, finishes a to-do you made, builds a farm, or dies.", "The notebook title is plain text with a pencil button to rename it, up to 40 characters.", "Fix:", "Filters and settings with only two choices are a single button that swaps between them."]],
  ['3.0', 'November 10th, 2026', ['Website release.']],
  ['2.3', 'November 21st, 2024', ['Table Updates:', 'Standardized table widths across the document.', 'Adjusted table heights for consistency (except on the Enchantments page).', 'Removed extra rows from the Farms Tabs.', 'Other Changes:', 'Minor tweaks to improve document appearance and usability.']],
  ['2.2', 'November 14th, 2024', ['New Features:', 'Added "Notebook" to the tab list, allowing multiple notebooks within a single document for different worlds or servers.', 'Introduced a To-Do List Tab.', 'Improvements:', 'Added placeholder files for Java farm Litematicas.', 'Darkened table headers for improved readability.', 'Centered some table headers.', 'Updated text on the Home Page for clarity.', 'Notes:', 'Subtabs in duplicated notebooks must still be created manually, as Google does not duplicate them.']],
  ['2.1', 'November 13th, 2024', ['Enhancement:', 'Pinned table headers to remain visible when scrolling for easier navigation.']],
  ['2.0', 'November 9th, 2024', ['Major Update:', 'Reformatted the document to use the new Document Tabs feature.', 'New Tabs Added:', 'Coordinates Tab – Moved from the original document.', 'Enchantments Tab – Also moved from the original document.', 'Farms Tab – Includes separate sections for: Java Farms; Bedrock Farms (Litematica column removed for Bedrock farms only).', 'Created a Changelog Tab and added a Cover Image.', 'Updated the Home Tab with instructions to access other tabs from the side panel.', 'Other Changes:', 'Document restructuring for future expansion.', 'Minor document fixes.']],
  ['1.2', 'October 18th, 2024', ['New Additions:', 'Added new enchantments to the Weapons group in the Enchantments Table: Breach; Density; Wind Burst.', 'Replaced several links with Modrinth links.', 'Added a custom list of mods.', 'Modifications:', 'Renamed "Location" to "Place Name" in the Coordinates Table.', 'Minor document fixes.']],
  ['1.1', 'September 18th, 2022', ['Enhancements:', 'Added a section for saving farm designs (includes one random farm).', 'Linked to a comprehensive list of farms.', 'Minor document fixes.']],
  ['1.0', 'September 11th, 2022', ['Initial Release:', 'Launched The Survival Notebook with the following features:', 'Links to mod downloads.', 'Table for storing important coordinates.', 'Table for adding enchantments to items.']],
]

export const MAXLVL: Record<string, number> = {}
for (const l of Object.values(ENCHANTS)) for (const [n, m] of l) MAXLVL[n] = m
export const TONES = {
  cat: { Important: 'red', Farms: 'green', Biomes: 'teal', Structures: 'amber', Other: 'gray' },
  priority: { Low: 'blue', Medium: 'yellow', High: 'red' },
  progress: { 'To-Do': 'gray', 'In Progress': 'blue', Done: 'green' },
  edition: { Both: 'purple', Java: 'amber', Bedrock: 'teal' },
  portal: { 'No Portal': 'gray', Portal: 'purple' },
  role: { owner: 'green', editor: 'blue', viewer: 'gray' },
} as Record<string, Record<string, string>>

export const CAT_ICON: Record<string, string> = { Important: 'nether_star', Farms: 'wheat', Biomes: 'spyglass', Structures: 'bricks', Other: 'paper' }
export const TAB_ICON: Record<string, string> = { Home: 'oak_sign', Coordinates: 'map', Enchantments: 'enchanted_book', Deaths: 'totem_of_undying', Stats: 'experience_bottle', 'To-Do': 'writable_book', Farms: 'wheat', Notes: 'book' }
export const ENCH_INDEX = (() => {
  const m: Record<string, { name: string; max: number; groups: string[] }> = {}
  for (const [g, l] of Object.entries(ENCHANTS)) for (const [n, x] of l) (m[n] ||= { name: n, max: x, groups: [] }).groups.push(g)
  return Object.values(m)
})()

// Footer preview: first `max` words of an entry, flattened to one paragraph (full text lives on /changelog)
export function clipWords(items: string[], max = 100) {
  let text = '', n = 0
  for (const it of items) {
    const w = it.split(/\s+/).filter(Boolean), sep = !text ? '' : text.endsWith(':') ? ' ' : ' · '
    if (n + w.length > max) { const rest = max - n; return { text: text + (rest > 0 ? sep + w.slice(0, rest).join(' ') : '') + '…', cut: true } }
    text += sep + it; n += w.length
  }
  return { text, cut: false }
}
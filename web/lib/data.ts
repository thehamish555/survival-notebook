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
  ['3.5.2', 'November 17th, 2026', ['Fix:', 'Item icons no longer have a glowing edge in dark mode.', 'Leather armour, potions, tipped arrows and other items the game colours now show their real colours instead of grey.', 'The light and dark mode button has its own pixel sun and moon.']],
  ['3.5.1', 'November 17th, 2026', ['Fix:', 'The picture shown when you share a link to the site matches the home page: same font, background and app preview.']],
  ['3.5.0', 'November 17th, 2026', ['Feature:', 'Chests, shulker boxes, heads, banners and beds show in 3D too, the way the game draws them.', 'Recent activity says what changed: names, which fields, and things like finishing a to-do or building a farm. Changes made in game are marked, and clicking one opens that section.', 'The notebook title is plain text with a pencil button to rename it, up to 40 characters.', 'Stats lists line up: every bar is the same length, with the number on the same line as the name.', 'Fix:', 'Long YouTube titles wrap in the video popup.', 'The back button and page titles are easy to read over the header picture, and the header fades smoothly into the page in light mode.', 'Iron armour and other light items keep their outline in dark mode.', 'The sound button has its own pixel icon, and the drag handle on table rows is wider.']],
  ['3.4.0', 'November 17th, 2026', ['Feature:', 'Blocks show as 3D blocks, the way they look in your inventory, instead of a flat side. Items the game draws flat, like tools and flowers, stay flat.', 'The installed app icon has rounded corners and smooth edges, and Android can shape it to match your other apps.', 'Notifications show the notebook as a small white icon in the status bar instead of a white square.']],
  ['3.3.1', 'November 17th, 2026', ['Fix:', 'About 450 more Minecraft icons, including chests, slabs, stairs, fences, beds, banners and mob heads, so the shopping list and icon picker show nearly every item.', 'Map and Shopping have their own pixel icons, like the other tabs.']],
  ['3.3.0', 'November 17th, 2026', ['Feature:', 'Shopping list: press I\'ll get it on an item so everyone can see who\'s gathering it.', 'Shopping list: your ender chest counts as Have too. The mod remembers what\'s in it each time you open it.', 'More notifications: when someone finishes a to-do you made, builds a farm, or dies.', 'Map: parts nobody has been to for 90 days are cleared once a day, except within 256 blocks of a saved place. The owner can also press Clear old tiles.']],
  ['3.2.0', 'November 17th, 2026', ['Feature:', 'Paste coordinates from the game. Press F3 + C in Minecraft and paste into a coordinate box or the new Paste from game button. The dimension comes from what you copied, and a plain /tp asks you to pick one.', 'Shopping list tab (also in the mod): adds up the blocks for farms you haven\'t built (read from their Litematica files), quantities on to-dos and the books your gear still needs, then compares them with what you\'re carrying in game, including shulker boxes and bundles.', 'To-dos have a Qty column. Give one an item icon and a quantity, like 64 glass, and it goes on the shopping list.', 'Map tab: the mod draws a map of where players explore, with your places as pins. It only shows up once there is map data, and each player can turn it off with Share map in the mod\'s Settings.', 'Install the site as an app from the Account page. Notebooks you\'ve opened still show when you\'re offline, read-only.', 'Notifications: turn them on per device on the Account page to hear when someone assigns you a to-do or farm, or adds you to a notebook.']],
  ['3.1.0', 'November 17th, 2026', ['Feature:', 'Invite links: the owner can make a link (can edit or view only, lasting 1, 7 or 30 days) and anyone who signs in with it joins the notebook. Links can be copied or removed in Settings.', 'Recent activity has a See all view with filters for person and section, joins show up in it, and Home says how many changes others made since you were last here.']],
  ['3.0.1', 'November 17th, 2026', ['Fix:', 'Filters and settings with only two choices are now a single button that swaps between them, instead of a dropdown.']],
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

export const CAT_ICON: Record<string, string> = { Important: 'nether_star', Farms: 'wheat', Biomes: 'spyglass', Structures: 'brick', Other: 'paper' }
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
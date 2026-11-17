## 1.0.0
- The overlay no longer shows the tracked place as text (the compass does that); "Working on" is now "Enchants needed".
- Shorter, clearer help text throughout; removed the "(mod)" tag from recent activity.
- Header title no longer has a text shadow.
- Search boxes on Places, Farms, To-Do and Enchants, same spots as the website.
- A notebook per world: joining a world or server switches to the notebook with that name, or creates it (toggle in Settings > Sync & privacy).
- Up/down arrows on rows to reorder them.
- Compass shows the arrow or the V pointer, never both.
- Fixed the stray pixel on the Enchants "off" icon.
_First release. Everything below is included._

- **Icons everywhere**: farms have an icon (picker in the editor, shown in the list); the icon picker now lists every item in the game, alphabetically, and filters as you type.
- **Places**: pressing **Here** on a filled-in dimension asks before replacing the coordinates; each coordinate box has a **Copy** button. The minimap sync text wraps instead of running off screen.
- **Compass**: redesigned as a scrolling heading strip (N/NE/E…) with a marker and a name/distance label. Distances and directions never guess: if a place has no coordinates in the dimension you're in, the compass, overlay and Places list just say so (no Overworld ↔ Nether conversion).
- **Look**: softly rounded buttons and panels, clearer sidebar text in both themes (no more grey vanilla button showing through), editor forms on a card, and nicer overlay cards.
- **Icon picker for to-dos**: Edit a to-do → Icon → a searchable grid of common items (shown on the list, the overlay and the website).
- **Sidebar icons**: the panel, header and sidebar backgrounds are now drawn before everything else, so the tab icons can't end up hidden behind them.

- **Notes Save button fixed** — it's always clickable now and confirms with "Notes saved".
- **Farm to-do is its own automatic section** at the top of the To-Do page and overlay: "Build farms - N", worked out from your farms' remaining count, read-only, **on by default** (switch it off on the Farms page).
- **Enchants are simple on/off switches**: click a missing enchant to switch it off for that item, click a red one to bring it back. If other items of yours need (or have switched off) the same enchant, a button offers **Switch off / Switch on for N other items**, which changes only those others.
- **Missing enchants show in the "Working on" overlay** for all your items (planned items first), not just planned ones.
- **Item icons** on To-Do rows and in the overlay lines (sidebar tabs already had them).
- **Settings are grouped** into categories: Connection, Overlays, Sync & privacy, Appearance, with a toggle per option.

- **New in-game layout**: a wider panel with a left sidebar (item icons + labels; icons only on small screens), a header showing where you are, and a scrolling Settings page. Rows, hover states and the Home tiles got a cleaner look.
- **Every choice with more than two options is a dropdown** (priority, progress, category, assignee, farm status, notebook, filters…), including inside list rows.
- **Enchants**: every enchant an item can have now counts as needed automatically (conflicting ones count once); the "want" step is gone. Click one to switch it off for that item, click a red one to bring it back. Planned items work the same way, and the "Working on" overlay lists your planned items and what they still need.
- **Notes** is now one big text box (saved with Save, and automatically when you leave the tab). Falls back to line-by-line editing if the game version has no big text box.
- **Farms**: status is one dropdown (To build / Building / Built). The automatic "Build farms - N" to-do shows for everyone, whoever it's filtered or assigned to. "Unassigned" is now **All users**, and "Mine" includes things assigned to all users.
- **Player stats**: your own vanilla statistics (the same numbers as the Statistics screen) sync to the website's new Stats tab. Singleplayer reads the world's stats file; multiplayer uses what the server already sends you for the Statistics screen. Nothing from cheats or commands. Turn off in Settings → Share stats.

- **Enchants are per item.** Each item has its own switches: click a "+" enchant to *want* it (purple ★, counts as needed) or switch it **off** (turns red, click it to bring it back), instead of a global "not tracked" list. The "Not tracked" tab is gone. Enchants that top out at level I drop the numeral (just "Mending").
- **Plan items**: "+ Plan item" adds something you want to make (e.g. a Netherite Pickaxe) with the enchants you want. When you get the real item it merges in automatically, keeping your goals, switched-off enchants and nickname. Items that leave your inventory but have goals or a nickname are kept as "stored".
- **Working on** section in the overlay lists the enchants you still want, per item (toggle in Settings).
- **Compass arrow**: a slim bar at the top of the screen with an arrow that slides as you turn towards your tracked place or death spot.
- **Minimap auto-sync**: Places → Sync map… picks a Xaero's / JourneyMap world once, and from then on adding, moving or deleting a waypoint updates the notebook within a few seconds (places you made yourself are never removed).
- **Farms**: To build → Building → Built, an optional automatic "Build farms - N" to-do you switch on and off (never deleted), a Location dropdown (auto-linked to a same-named place, or "New place here"), and you can attach a Litematica file while creating a farm. Files from a cancelled farm are deleted again; the server also sweeps leftovers after a crash.
- **Notes** tab: the same shared notes as the website.
- **Dropdown filters** everywhere instead of clicking through options (places, to-dos, farms, deaths, enchants).
- Category icons on places, flatter, more modern panels, and a **Mod Menu** settings button (optional; Mod Menu isn't required).

- **Deaths**: every death is recorded with where it happened (dimension + coordinates), how you died, how many item stacks and levels you lost, and which enchanted items. A new Deaths tab (and the website's Deaths tab) lets you track the spot, mark it recovered, or delete it. Walking up to a tracked death spot marks it recovered automatically.
- **Not-tracked enchantments**: click a grey "+" enchant on any item to stop counting it as needed, either on every item (Thorns) or only on one kind (Fire Aspect on swords). Manage the list under Enchants → Not tracked. Same list as the website.
- **Item icons** in the gear list, item pages and death pages.
- Tidier enchant chips: a proper colour key (Max / Below max / Curse / + Can still add), and "+N more" now collapses neatly at the end of the row.
- **Places**: "Add place" and the B key open the place editor prefilled with where you stand (set an unbound "Quick-save" key to skip the editor). Every row has a Track button. Tracking now says where a place is ("Base · in the Nether") and gives an approximate bearing by converting Overworld / Nether coordinates.
- **Import from Xaero's Minimap and JourneyMap** (Places → Import…): reads their waypoint files on this computer, merges same-named places across dimensions, and never touches the minimap mods' own files.
- **Litematica files** in game: attach a .litematic from your schematics folder to a farm (max 100 KB) and download one back (never overwrites).
- **Members** in game: the owner can add (by email) and remove people. Needs a token created with "manage members" on the website (off by default).
- **Open on website**: every tab has an "Open on website" link that lands on the same section, and Settings has a button for the token page. Vanilla's own "open this link?" confirmation is used.

- Rebuilt in-game UI: a styled panel with Home, Places, Enchants, To-Do, Farms, Members and Settings tabs, scrolling lists, and a dark/light theme.
- Everything on the website now works in game, both ways: edit place names, categories, coordinates and portals (with Convert); add, edit, claim and advance to-dos; edit farms (YouTube links fetch the video title); set your nickname.
- Live sync: changes made on the website or by friends appear in game within a moment (and yours appear there).
- Enchants tab shows every member's gear with what each item can still get (conflicts handled, e.g. Sharpness vs Smite), plus a book list for maxing everything out.
- Track a place: a distance and compass line on the overlay. Recent activity on the Home tab.

- Connects to the official server by default: just paste a token. (Self-hosting? Set the API URL in Settings.)
- Places now show distance and compass direction from you, with a "Nearest first" sort.
- URLs are forgiving (`example.com` works), and the mod identifies itself to the server for easier debugging.
- Mod icon, license and Modrinth packaging.

- Gear sync, saved places (with automatic death markers), shared to-do list, and an on-screen to-do overlay.
- Full visual redesign: larger panel with a gradient header and live-sync pill, sidebar count badges (places, open deaths, your to-dos, farms), rounded card rows, dimension tags on places, Lost/Recovered tags on deaths, a redesigned compass strip and goals overlay, and card-style Settings, Members, Notes and enchant-detail screens, and a roomier icon picker.
- Sidebar tabs are now raised buttons, with Members and Settings pinned to the bottom.
- Farms can be filtered by who is assigned, and the farm and to-do editors share one layout. YouTube links show as a single line with Watch and Edit options.
- Enchant levels read like "Efficiency III - V", and the disabled-enchant icon matches the text size.
- The compass says where a place is (e.g. "in the Nether") when it can't point to it.
- Vanilla sounds when saving or deleting, with a toggle in Settings.
- Token members permission removed: every token can manage members. The server address is found automatically.
- Members now live under Settings. Heads are fetched from Mojang by UUID, then username, then Steve.
- Dropdowns open as a centred menu. Rows in Places, To-Do and Farms can be moved up or down with arrows on the left, and the order matches the website.
- Home shows nine tiles that open their tab. Sidebar icons are redrawn pixel by pixel and shared with the website. Enchants has a count.
- To-do header matches Farms, and the farm to-do switch is on the To-Do tab. Convert sits between the Overworld and Nether rows.

## 1.2.2 – Fix
- Item icons now show on the main menu too (for example when you open the notebook from Mod Menu), not only once a world has loaded.

## 1.2.1 – Fix
- Item icons show again. If the notebook had been opened before a world finished loading, they stayed blank for the whole session.
- Map: dragging moves the map, and a slightly shaky click still counts. Clicking a place tracks it and shows the farms there, with Track, Edit and close buttons.
- Map and Shopping have their own pixel icons, like the other tabs.
- New Stats tab, the same as the website's: time played, deaths, distance and more, plus lists like Most mined and Killed by. Vanilla statistics only.
- You can point the mod at your own server with apiUrl in config/survival-notebook.json.
- Small screens: the map hint and the shopping list header no longer overlap the buttons.

## 1.2.0 – Feature
- Map tab: the notebook's shared map in game, with your places as pins and a marker showing where you are and which way you face. Drag to move, scroll to zoom, and click a pin to track it. What you've just explored shows straight away.
- Ender chest: the mod remembers what's in it each time you open it, and the shopping list counts it as Have (on the website too).
- Shopping tab: press I'll get it on an item so everyone can see who's gathering it. It's shared with the website.

## 1.1.0 – Feature
- New commands: `/notebook` opens the notebook, `/notebook place <name>` saves where you're standing, and `/notebook todo <text>` adds a to-do for you. `/notebook todo 64 glass` also puts 64 glass on the shopping list.
- Paste coordinates: press F3 + C, then Paste in the place editor (or paste into a coordinate box). The dimension comes from what you copied. A plain `/tp x y z` uses the dimension you're in.
- Share inventory (on by default, in Settings > Sync & privacy): sends what you're carrying, including inside shulker boxes and bundles, for the website's new shopping list.
- Shopping tab: blocks for farms you haven't built (from their Litematica files), quantities on to-dos and books your gear needs, compared with what you're carrying, including shulker boxes and bundles.
- Share map (on by default): draws a map of the chunks around you as you explore and shows it on the website with your places as pins. No minimap mod needed. Turn it off in Settings > Sync & privacy.

## 1.0.2 – Fix
- Connects to the official server over HTTPS at notebook-api.hamish555.com, so your token is no longer sent in plain text.

## 1.0.1 – Fix
- Anything with only two choices (Show: Mine or Everyone, Theme, Items or Book list, and so on) is now a button that swaps between them. Dropdowns are only used for three or more.
- Farm tutorial links open the video with a click, and have a separate Edit button.

## 1.0.0 – First release

Survival Notebook puts your shared world notebook in Minecraft.

- **The notebook in game (`N`):** Home, Places, Enchants, Deaths, To-Do, Farms, Notes and Settings, with a dark or light theme. Everything on the website works here too, and changes sync both ways, live.
- **Places:** save where you are with `B`, in the right dimension. Convert between Overworld and Nether, copy coordinates, track a place, and import waypoints from Xaero's Minimap or JourneyMap.
- **Enchants:** your enchanted gear syncs automatically. See what each item can still get, switch enchants off per item, plan items you haven't made yet, and see the books you still need.
- **Deaths:** where you died, how, and what you lost, recorded automatically. Track the spot and it's marked recovered when you get back.
- **To-dos and farms:** see, add, claim and finish them, with icons, YouTube tutorials and Litematica files. An automatic "Build farms" to-do counts what's left.
- **Overlays:** a compass strip that points to your tracked place, and a small list of your open to-dos and the enchants you still need (`H` to toggle).
- **Stats:** your own vanilla statistics sync to the website's Stats tab.
- **A notebook per world:** joining a world or server uses the notebook with that name, or creates it.
- **Members and settings:** manage members, your nickname, sounds and what gets synced.
- **Search and reordering** on every list, and Mod Menu support.
- **Connects to the official server by default.** Just paste a token from the website's Account page.
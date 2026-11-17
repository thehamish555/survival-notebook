# Modrinth listing — copy into the project page

**Name:** Survival Notebook
**Summary (≤256):** Syncs your enchanted gear, saved places and shared to-do list with The Survival Notebook website — see what everyone in your world is carrying and doing, live.
**Categories:** Utility, Management · **Environment:** Client required, server unsupported · **Loader:** Fabric · **Game version:** 26.3
**License:** MIT · **Dependency:** Fabric API (required) · **Website link:** https://notebook.hamish555.com
**Icon:** `src/main/resources/assets/survival_notebook/icon.png`

---

## Description (paste as the project body)

**Survival Notebook** connects Minecraft to [The Survival Notebook](https://notebook.hamish555.com): a shared journal for your world with coordinates, per-player enchanted gear, to-dos with owners, and a farm library. The mod keeps it up to date while you play.

### What it does
- **A full in-game notebook (N)** — Home, Places, Enchants, Deaths, To-Do, Farms, Notes and Settings, with a dark or light theme. Anything you can do on the website you can do here: rename and re-categorise places, edit coordinates (with an Overworld ⇄ Nether Convert), add and advance to-dos, edit farms, set your nickname.
- **Live, two-way sync** — changes made on the website or by friends show up in game within a moment, and yours show up there.
- **What's still missing** — every item in everyone's gear shows what it can still get (conflicts like Sharpness vs Smite are handled), plus a book list for maxing everything out.
- **Track a place** — a compass strip points you at it, with the distance and the dimension named.
- **Deaths** — where you died, how, and what you lost (enchanted items included), with a one-click Track and auto-recover when you get there.
- **Per-item enchants** — every enchant an item can have counts as needed (conflicts count once); switch one off for a single item (it turns red, click to bring it back). Planned items work the same way.
- **Minimap auto-sync** — pick a Xaero's Minimap or JourneyMap world once and your places follow it (add, move, delete).
- **Per-item enchant goals, planned items, a compass arrow and an "Enchants needed" overlay.**
- **Mod Menu** support (optional).
- **Player stats** — your own vanilla statistics (same as the Statistics screen, no cheats) appear on the website's Stats tab. Turn off in Settings.
- **Schematics** — attach and download Litematica files in game; owners can add and remove members too.
- **Gear sync** — every enchanted item in your inventory (hotbar, main, armor, offhand) appears on the website, tagged "from game". Items you add by hand are never touched. Updates about every 30 seconds, and only when something changed.
- **Places** — press **B** to add where you are (opens the editor, prefilled), or bind the optional quick-save key. Saved in the right dimension column. Deaths are recorded automatically (can be turned off).
- **Nearby places** — see distance and compass direction to everything you've saved, sorted nearest first.
- **To-dos** — see, add, claim and advance the notebook's to-dos in game, plus a small always-on overlay of your open tasks (**H** to toggle).
- **Safe merging** — edits from the website and the game combine instead of overwriting each other.
- **Commands** — `/notebook` opens the notebook, `/notebook place <name>` saves where you're standing, `/notebook todo <text>` adds a to-do (`/notebook todo 64 glass` puts 64 glass on the shopping list).
- **Paste coordinates** — press F3 + C and then Paste in the place editor. The dimension comes from what you copied; a plain `/tp x y z` uses the dimension you're in.
- **Shopping list** — in game and on the website, the notebook adds up blocks for farms you haven't built (from their Litematica files), quantities on to-dos and books your gear needs, then compares them with what you're carrying (shulker boxes, bundles and your ender chest included). Press I'll get it so friends know who's gathering what.
- **Map** — the mod draws a map of where you explore, shown on the website and in the Map tab in game, with your places as pins (click one to track it). No minimap mod needed. Turn off Share map in Settings if you'd rather not.

### Getting started
1. Sign in with Google at **notebook.hamish555.com** and create a notebook (or get invited to one).
2. On the website open **Account & mod**, create a token and copy it.
3. In game press **N → Settings**, paste the token, **Save & connect**, and pick your notebook.

### Privacy — exactly what is sent
Only to the notebook server you connect to (the official one by default; you can point it at your own):
- the **names and enchantments of enchanted items** in your inventory,
- if "Share inventory" is on (default), **the items you're carrying** (with what's inside shulker boxes and bundles) and **what was in your ender chest** the last time you opened it, for the shopping list,
- if "Share map" is on (default), **map colours of the chunks loaded around you**,
- **coordinates you choose to save** (and, if "Save deaths" is on, your death position, the death message, and the enchanted items you were carrying),
- **minimap waypoints from the world you choose to sync**, and **.litematic files you choose to attach**,
- **to-dos** you add or change,
- an **API token** you created (stored locally in `config/survival-notebook.json`) and a `survival-notebook-mod/<version>` user agent.

No telemetry, no analytics, nothing is sent until you add a token. Tokens can only sync gear, places, deaths and to-dos as you — they can't change members unless you tick “manage members” when creating one, can't delete notebooks or see your password — and you can revoke them any time on the website.

### Keys (rebindable in Controls)
| Key | Action |
|---|---|
| N | Open the notebook |
| B | Add a place here (opens the editor) |
| (unbound) | Quick-save a place with no editor |
| H | Toggle the to-do overlay |

### FAQ
**Does it work on servers?** Yes — it's client-side only and reads your own inventory and position, so it works in singleplayer and on servers (check your server's rules on client mods).
**Bedrock?** The website works for Bedrock players too, but this mod is Java/Fabric only.
**Self-hosting?** Set the API URL in Settings — the server is open source (see the website's repository).
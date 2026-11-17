# Survival Notebook mod

A client-side Fabric mod for **Minecraft Java 26.3** that puts your Survival Notebook in the game. It keeps the notebook up to date while you play and shows it in a menu you can open any time.

## What it does

- **The notebook in game (`N`):** Home, Places, Enchants, Deaths, To-Do, Farms, Notes and Settings. Everything on the website works here too, both ways, and changes sync live.
- **Places:** save where you are with `B`, in the right dimension. Convert between Overworld and Nether, track a place, or import waypoints from Xaero's Minimap or JourneyMap.
- **Enchants:** your enchanted gear is synced automatically. See what each item can still get and which books you still need. Plan items you haven't made yet.
- **Deaths:** where you died and what you lost, recorded automatically, with one-click tracking and auto-recover.
- **To-dos and farms:** see, add, claim and finish them. A small overlay (`H`) lists your open to-dos and the enchants you still need.
- **Compass:** a strip at the top points you to the place you're tracking.
- **Stats:** your own vanilla statistics go to the website's Stats tab.
- **A notebook per world:** joining a world or server switches to the notebook with that name, or makes one.

| Key (rebindable) | Does |
|---|---|
| `N` | Open the notebook |
| `B` | Add a place here |
| `H` | Toggle the overlay |

## Connecting

1. On the website's Account page, create a token and copy it.
2. In game press `N`, open **Settings**, paste it and press **Save & connect**.

The mod finds the server by itself. The token lets the mod act as you in your notebooks. It can't delete a notebook or your account. It's stored in `config/survival-notebook.json`, so don't share that file.

## Building

Needs Java 25. Requires Minecraft 26.3, Fabric Loader 0.20.1+ and Fabric API.

```bash
./gradlew build        # build/libs/survival-notebook-<version>.jar
./gradlew runClient    # a development client
```

Published to Modrinth automatically from `main` when `version=` in `gradle.properties` is new. Add the release notes to `CHANGELOG.md` and the listing text lives in `MODRINTH.md`.

## Code layout

`SurvivalNotebookClient` (entry point) · `NotebookScreen` and the `Page*` classes (the menu) · `Notebook` (cached state and actions) · `Api` and `Live` (HTTP and the event stream) · `Enchants` (shared rules) · `GearScanner`, `Names`, `Deaths`, `PlayerStats`, `Minimap` (reading the game) · `TodoHud` and `CompassHud` (overlays) · `Compat` (the few version-sensitive Minecraft calls in one place).
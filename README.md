# The Survival Notebook

A shared journal for a Minecraft survival world. Everyone in the world keeps one notebook together: the places you've found, what each player is carrying and still needs to enchant, who's building which farm, a to-do list, and notes. A Fabric mod fills it in while you play, and changes show up live on both sides.

## What's in it

- **Places** with Overworld, Nether and End coordinates, a safe converter, and a `/tp` copy button.
- **Enchants** for every player's gear: what each item can still get, what conflicts, and which books you still need.
- **Deaths** with where it happened and what was lost, recorded by the mod.
- **To-dos and farms** with owners, YouTube tutorials and Litematica files.
- **Stats** from the game's own Statistics screen (vanilla only).
- **Notes**, members and per-notebook nicknames.

## The three parts

| Folder | What it is | Where it lives |
|---|---|---|
| [`web/`](web) | The website: sign in, edit the notebook, invite people. Next.js. | Vercel, at notebook.hamish555.com |
| [`api/`](api) | The server behind both the website and the mod. Hono and SQLite. | A Pelican server, served at notebook-api.hamish555.com through a Cloudflare Tunnel |
| [`mod/`](mod) | The Fabric mod for Minecraft 26.3: the same notebook in game. | Modrinth |
| [`shared/`](shared) | Enchantment rules and pixel icons used by both the site and the mod. | Generated into `web/` and `mod/` |

```
Browser ─► notebook.hamish555.com (Vercel) ── /api ──►┐
                                                       ├─► notebook-api.hamish555.com  API + SQLite
Minecraft ─ Fabric mod ───────────────────────────────┘
```

The website never talks to the API from the browser directly. It calls its own `/api` path and Vercel forwards that to the server. The mod talks to the server directly with a personal token.

## How it ships

Everything lives in this one repo, and a push to `main` does the rest:

- **Website:** Vercel builds `web/` and deploys it.
- **API:** GitHub tests `api/`, then restarts the Pelican server, which pulls the newest code when it starts.
- **Mod:** GitHub builds `mod/` and publishes it to Modrinth when the version in `mod/gradle.properties` is new.

## Working on it

Needs Node 22 (and Java 25 for the mod).

```bash
npm run setup     # install api/ and web/
npm run dev       # API on :8787, website on :3000
npm test          # API tests; web has its own: npm test --prefix web
```

Local development needs no configuration. Item icons come from your own game: `npm run icons`. Enchantment rules are edited in `shared/build-enchants.py` (run `npm run sync:shared` and commit the copies).

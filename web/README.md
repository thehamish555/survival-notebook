# Website

The Survival Notebook website. People sign in with Google here, make a notebook for their world, and invite the others. It's the same notebook the mod shows in game, kept in sync live.

## What you can do on it

- **Home:** a summary of the notebook (places, items, deaths, to-dos, farms, notes, players) where every tile jumps to its tab, plus what's assigned to you and recent activity.
- **Coordinates:** places in three dimensions with a safe converter and `/tp` copy. Reorder rows by dragging.
- **Enchantments:** every player's gear, what each item can still get, and the books still needed.
- **Deaths and Stats:** filled in by the mod.
- **To-Do and Farms:** owners, priorities, YouTube tutorials, Litematica files, and an automatic "build farms" to-do.
- **Notes**, **Settings** (members, nickname, backup and restore), and an account page for mod tokens.
- Dark and light themes, game sounds with a volume control, and a layout that works on phones.

## How it's built

Next.js (App Router) and React. The browser calls `/api/...` on the same site, and `next.config.mjs` forwards that to the API server named in `API_ORIGIN`. That way there is no CORS setup. Live updates use an event stream with a fallback refresh.

Item icons and sounds are extracted from your own copy of Minecraft (`npm run icons`) and committed under `public/mc/`. Pixel tab icons are generated from `shared/tab-icons.json`.

## Environment

| Variable | What it does |
|---|---|
| `API_ORIGIN` | Where the API runs, e.g. `https://notebook-api.hamish555.com`. Set on Vercel. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | The Google OAuth client ID (public). Without it, local development shows a simple dev sign-in form. |
| `NEXT_PUBLIC_SITE_URL` | The site's own address. |
| `NEXT_PUBLIC_MODRINTH_URL` | Where the "Minecraft mod" links go. |
| `NEXT_PUBLIC_API_URL` | Local development only: points straight at the local API. |

## Running it

```bash
npm install
npm run dev        # http://localhost:3000, talks to the API on :8787
npm test
```

Deployed by Vercel from the repo's `main` branch with **Root Directory** set to `web`.
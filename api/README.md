# API

The server behind The Survival Notebook. The website and the Minecraft mod both read and write notebooks through it.

- **Accounts and sessions:** sign in with Google only, so the server never handles passwords. It verifies Google's ID token, matches the account by email, and issues a signed 30-day session. People can change their display name or delete their account.
- **Notebooks:** each has an owner and members (owner, editor, viewer). Data is stored as sections: places, to-dos, farms, notes, deaths, plus per-player gear, preferences and stats.
- **Safe editing:** every write says which revision it was based on. If someone else saved first, the server answers 409 and the client merges and retries, so two people (or the website and the mod) never overwrite each other.
- **Live updates:** a server-sent event stream tells everyone in a notebook when something changes.
- **Mod tokens:** personal tokens (`snp_…`) for the mod. They can only do what the mod needs: read notebooks, edit rows, sync your own gear and stats, upload Litematica files, create a notebook for a world, and manage members. They can't delete notebooks or touch the account.
- **Files:** `.litematic` uploads up to 100 KB, served as downloads.
- **Safety:** zod validation on every payload, per-IP rate limits, secure headers, and an optional shared secret.

It stores everything in one SQLite file (WAL mode) with versioned migrations that run automatically, and takes a snapshot every 24 hours (newest 14 kept next to the database).

## Endpoints

`POST /auth/google` · `GET|PATCH|DELETE /me` · `GET|POST|DELETE /me/tokens` · `GET|POST /notebooks` · `GET|PATCH|DELETE /notebooks/:id` · `GET|PUT /notebooks/:id/s/:section` · `GET /notebooks/:id/activity` · `POST|DELETE /notebooks/:id/members` · `PATCH /notebooks/:id/nick` · `POST|GET|DELETE /notebooks/:id/files` · `GET /notebooks/:id/events` · `GET /health` · `GET /ready`

## Configuration

| Variable | Needed | What it does |
|---|---|---|
| `JWT_SECRET` | yes | Signs sessions. 32+ random characters. |
| `GOOGLE_CLIENT_ID` | yes in production | The OAuth client ID from Google Cloud. Without it (and outside production) the API accepts `dev:email:name` as a sign-in so you can work locally. |
| `PORT` | no | Listening port. On Pelican the allocated `SERVER_PORT` is used automatically. |
| `DB_PATH` | no | Database file. Defaults to `./data/notebook.db`. |
| `ORIGIN_SECRET` | no | If set, requests must send it in `x-origin-secret`. |
| `CORS_ORIGIN` | no | Lets a browser on that origin call the API directly. Local development only. |

## Running it

```bash
npm ci
npm run dev      # watch mode with development defaults
npm test
```

Production runs on a Pelican server using [`deploy/pelican-egg.json`](../deploy/pelican-egg.json). See [docs/DEPLOY.md](../docs/DEPLOY.md).
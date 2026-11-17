# Putting it live

Three things get deployed from this one repo, and every push to `main` ships them:

| Part | Goes to | How |
|---|---|---|
| `web/` | Vercel, at notebook.hamish555.com | Vercel's GitHub integration builds on every push |
| `api/` | Pelican, at lester.serveminecraft.net:PORT | A GitHub Action restarts the server, which pulls the new code on start |
| `mod/` | Modrinth | A GitHub Action publishes it when the version in `mod/gradle.properties` is new |

You only need to do the setup below once. Allow about 45 minutes.

## What you'll collect along the way

| Name | Where it goes | Where you get it |
|---|---|---|
| `PORT` (45865) | Pelican allocation, Vercel `API_ORIGIN`, the mod (`NbConfig.API_PORT`) | Already chosen (step 1) |
| `JWT_SECRET` | Pelican server variable | `openssl rand -hex 32` |
| `PELICAN_URL`, `PELICAN_API_KEY`, `PELICAN_SERVER_ID` | GitHub secrets | Pelican (step 4) |
| `API_ORIGIN` | Vercel env var | `http://lester.serveminecraft.net:45865` |
| `MODRINTH_TOKEN` (secret), `MODRINTH_PROJECT_ID` (variable) | GitHub | Modrinth (step 5) |

## 0. Before the first push

1. **Pick the port** and set it in the mod: `mod/src/main/java/dev/hamish/survivalnotebook/NbConfig.java`, `API_PORT`. It is already set to 45865.
2. **Item icons and sounds:** run `npm run icons` once on your PC (it reads your own Minecraft install) and commit `web/public/mc/`. Without it the site shows no item icons.
3. Create a GitHub repository and push everything to `main`. Nothing in the repo is secret.

## 1. The API on Pelican

1. **Import the egg.** Admin → Eggs → Import, and upload `deploy/pelican-egg.json`. It runs Node 22, clones this repo and starts the API.
2. **Add the port.** Admin → Nodes → your node → Allocations, add your public IP or `0.0.0.0` with the chosen port.
3. **Create the server.** Admin → Servers → Create:
   - Egg: **Survival Notebook API**, and pick the allocation from step 2.
   - Memory 512 MB, disk 2 GB is plenty.
   - Variables: `GIT_ADDRESS` = `https://github.com/<you>/<repo>.git`, `GIT_BRANCH` = `main`, `JWT_SECRET` = the value from `openssl rand -hex 32`. If the repo is private, make a fine-grained GitHub token with read access to *Contents* and put it in `GIT_TOKEN`.
4. Start it. The console should end with `API listening on :45865 (production)`.
5. **Open the port to the internet.** Forward `PORT` (TCP) on your router to the Pelican machine, and allow it in that machine's firewall.
6. **Keep the hostname current.** lester.serveminecraft.net must point at your home IP. Keep No-IP's updater running, and confirm the hostname when No-IP asks (free hostnames expire if you don't).
7. **Test it** from another network (phone data works): open `http://lester.serveminecraft.net:45865/health`. You should see `{"ok":true}`.

Data lives in the server's `data/` folder. The API also writes a snapshot to `data/backups/` every 24 hours and keeps the newest 14. Restore by stopping the server and copying a snapshot over `data/notebook.db`.

## 2. The website on Vercel

1. vercel.com → Add New → Project → import the GitHub repo.
2. **Root Directory: `web`.** Framework: Next.js. Production branch: `main`.
3. Environment Variables:
   - `API_ORIGIN` = `http://lester.serveminecraft.net:45865`
   - `NEXT_PUBLIC_SITE_URL` = `https://notebook.hamish555.com`
   - `NEXT_PUBLIC_MODRINTH_URL` = your Modrinth page, e.g. `https://modrinth.com/mod/survival-notebook`
4. Deploy.
5. **Domain.** Project → Settings → Domains → add `notebook.hamish555.com`. In your DNS add `CNAME notebook → cname.vercel-dns.com`. If the DNS is on Cloudflare, set it to **DNS only** (grey cloud).

The site calls its own `/api` path and Vercel forwards it to `API_ORIGIN`, so the browser never sees the API address and nothing needs CORS. Changes that only touch `mod/` or `api/` don't trigger a site build.

## 3. Check the site end to end

Open https://notebook.hamish555.com, create an account and a notebook. If sign-up says it can't reach the server, check step 1.7 and that `API_ORIGIN` has the right port (change it in Vercel, then redeploy).

## 4. Auto-restart the API on every push

1. In Pelican, click your name → **API Keys** → create a *client* key. Copy it.
2. The server ID is the short code in the server's address (`…/server/abcd1234`), also shown in Settings.
3. In GitHub: repo → Settings → Secrets and variables → Actions → **New repository secret**, three times:
   - `PELICAN_URL` = your panel address, e.g. `https://panel.example.com`
   - `PELICAN_API_KEY` = the key from step 1
   - `PELICAN_SERVER_ID` = the short code

After this, a push that changes `api/` runs the tests, then restarts the server. On start it pulls the newest `main` and installs dependencies. You can also run it by hand: Actions → Deploy API → Run workflow.

## 5. Publishing the mod to Modrinth

1. modrinth.com → create a project (it starts as a draft). Copy the text from `mod/MODRINTH.md` into the description, use `mod/src/main/resources/assets/survival_notebook/icon.png`, and set client-side only, Fabric, MIT.
2. **Project ID:** the project page → ⋯ → Copy ID (or Settings, the ID is shown there).
3. **Token:** Modrinth → Settings → Personal access tokens → create one with *Create versions* (and *Write projects* if offered).
4. GitHub: Settings → Secrets and variables → Actions:
   - Secret `MODRINTH_TOKEN` = the token
   - Variable (the Variables tab) `MODRINTH_PROJECT_ID` = the project ID
5. Run the workflow once: Actions → Publish mod → Run workflow. The first version goes onto the draft project. Then **submit the project for review** on Modrinth (the first time only).

From then on, a push that changes `mod/` builds it and publishes it, but only if `version=` in `mod/gradle.properties` isn't already on Modrinth. To release an update: bump the version, add a section to `mod/CHANGELOG.md`, push.

## Day to day

| You want to… | Do this |
|---|---|
| Change the website | Push to `main`. Vercel deploys in about a minute. |
| Change the API | Push to `main`. Tests run, the server restarts and pulls it. |
| Release the mod | Bump `version=` in `mod/gradle.properties`, add to the changelog, push. |
| Move the API to another port | Change the Pelican allocation, `API_ORIGIN` on Vercel (redeploy), and `API_PORT` in the mod (release a new mod version). |
| Restore data | Stop the server, copy a file from `data/backups/` over `data/notebook.db`, start. |

## Things to know

- **The API is plain HTTP.** The mod's token, and passwords sent from the site, cross the internet unencrypted on that hop (the site itself is HTTPS, and Vercel carries the request the rest of the way over HTTP). That's fine for a small private group, but if it grows, put HTTPS in front of the API (a Cloudflare Tunnel on the Pelican machine is the easiest way) and change `API_ORIGIN` and the mod's address to `https://`.
- **Live updates through Vercel** can drop and reconnect now and then. The site reconnects and refreshes by itself, and falls back to checking every 20 seconds.
- **The mod's port is baked in.** Players on an old mod version keep using the old port, so avoid changing it often.
- **Rate limiting** uses the visitor's address from Vercel's forwarded header. Everything works without it, it just makes the limits per person instead of per server.

## If something fails

| Symptom | Check |
|---|---|
| Pelican server stops straight away | The console. Usually `JWT_SECRET` is missing or shorter than 32 characters. |
| `/health` works on your network but not from outside | Router forward, firewall, and that the No-IP hostname points at your current IP. |
| Site says it can't reach the server | `API_ORIGIN` in Vercel (port, no trailing slash), then redeploy. |
| Deploy API action fails with 401/403/404 | The three Pelican secrets. The key must be a client key, and the ID the short server code. |
| Publish mod says the version exists | Bump `version=` in `mod/gradle.properties`. |
| Publish mod fails on auth | The token's scopes, and that `MODRINTH_PROJECT_ID` is a *variable*, not a secret. |

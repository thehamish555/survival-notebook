# Contributing

Thanks for wanting to help! Bug reports and ideas are welcome as [issues](https://github.com/thehamish555/survival-notebook/issues/new/choose).

## Making a change

1. Branch off `dev`. `main` is only for releases: merging into it ships the website, the API and the mod.
2. Set up and run it locally (Node 22, and Java 25 for the mod):
   ```bash
   npm run setup     # installs api/ and web/
   npm run dev       # API on :8787, website on :3000
   ```
   Local development needs no configuration. Sign in uses a dev login outside production.
3. Before opening a pull request:
   ```bash
   npm test --prefix api && npm run typecheck --prefix api
   npm test --prefix web && npm run typecheck --prefix web
   cd mod && ./gradlew build     # if you changed the mod
   ```
4. Open the pull request against `dev`.

## Where things live

| Folder | What |
|---|---|
| `web/` | The website (Next.js) |
| `api/` | The server (Hono and SQLite). New database migrations go at the end of the list in `api/src/db.ts`. |
| `mod/` | The Fabric mod |
| `shared/` | Enchantment rules and pixel icons, generated into `web/` and `mod/` (`npm run sync:shared`) |

The website and the mod read and write the same notebook, so a change to how something is stored usually needs both sides.

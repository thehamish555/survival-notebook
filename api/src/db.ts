import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type DB = Database.Database

// Append-only list. The index+1 is stored in PRAGMA user_version, so each migration runs exactly once.
const MIGRATIONS: ((db: DB) => void)[] = [
  db => db.exec(`
    create table if not exists users(id text primary key, email text unique not null, name text not null, hash text not null);
    create table if not exists notebooks(id text primary key, title text not null, owner text not null, created integer not null);
    create table if not exists members(nb text not null, user text not null, role text not null, primary key(nb,user));
    create table if not exists sections(nb text not null, name text not null, data text not null, rev integer not null default 1, primary key(nb,name));
    create table if not exists files(id text primary key, nb text not null, name text not null, size integer not null, data blob not null, created integer not null);`),
  db => { if (!db.prepare("select 1 from pragma_table_info('members') where name='nick'").get()) db.exec("alter table members add column nick text not null default ''") },
  db => db.exec('create index if not exists idx_members_user on members(user); create index if not exists idx_files_nb on files(nb);'),
  db => db.exec(`
    create table if not exists api_tokens(id text primary key, user text not null, name text not null, hash text not null unique, created integer not null, last_used integer);
    create index if not exists idx_tokens_user on api_tokens(user);`),
  db => db.exec(`
    create table if not exists activity(id integer primary key autoincrement, nb text not null, user text not null, section text not null, detail text not null, via text not null default '', ts integer not null);
    create index if not exists idx_activity_nb on activity(nb, id desc);`),
  db => { if (!db.prepare("select 1 from pragma_table_info('api_tokens') where name='can_members'").get()) db.exec('alter table api_tokens add column can_members integer not null default 0') },
  // Google sign-in: link an account to its Google id. Older password hashes stay in `hash` but are no longer used.
  db => { if (!db.prepare("select 1 from pragma_table_info('users') where name='google_sub'").get()) db.exec("alter table users add column google_sub text; create unique index if not exists idx_users_google on users(google_sub)") },
  // Invite links: anyone signed in who opens one joins the notebook with the stated role, until it expires or is revoked.
  db => db.exec(`
    create table if not exists invites(code text primary key, nb text not null, role text not null, by text not null, created integer not null, expires integer not null, uses integer not null default 0);
    create index if not exists idx_invites_nb on invites(nb);`),
  // 3.2: Litematica block counts (worked out once per file), map tiles from the mod, browser push subscriptions, and server settings (the VAPID keys).
  db => {
    if (!db.prepare("select 1 from pragma_table_info('files') where name='blocks'").get()) db.exec('alter table files add column blocks text')
    db.exec(`
      create table if not exists map_tiles(nb text not null, dim text not null, tx integer not null, tz integer not null, data blob not null, size integer not null, updated integer not null, by text not null, primary key(nb,dim,tx,tz));
      create table if not exists push_subs(endpoint text primary key, user text not null, p256dh text not null, auth text not null, created integer not null);
      create index if not exists idx_push_user on push_subs(user);
      create table if not exists kv(k text primary key, v text not null);`)
  },
]

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000')
  const current = db.pragma('user_version', { simple: true }) as number
  for (let i = current; i < MIGRATIONS.length; i++) db.transaction(() => { MIGRATIONS[i](db); db.pragma(`user_version = ${i + 1}`) })()
  return db
}
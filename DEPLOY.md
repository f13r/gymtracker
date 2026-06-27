# DEPLOY — gymtracker (production runbook)

Authoritative guide for an agent (or human) operating the **production server** at
`/var/www/gymtracker`. Follow it to provision, deploy, and start the project. If anything
here disagrees with `docs/server-setup.md`, **this file wins** (server-setup.md predates the
SQLite→Postgres migration).

---

## Architecture

- **App**: NestJS/Fastify API + React/Vite SPA (npm workspaces monorepo).
- **Database**: **PostgreSQL 16 with the `pgvector` extension** (the `coaching_knowledge`
  table stores `vector(768)` embeddings — pgvector is **required**, not optional).
- **ORM/migrations**: Drizzle (`pg` driver). Migrations live in
  `apps/api/src/drizzle/migrations` and run via `npm run db:migrate`. The API **also** runs
  pending migrations on boot (`drizzle.module.ts`).
- **Process manager**: PM2 via `ecosystem.config.js` (repo root). The PM2 app sets
  `cwd: apps/api`, so the API loads `apps/api/.env` at runtime — the **same** env file
  `db:migrate` uses. There is **one** source of truth for `DATABASE_URL`: `apps/api/.env`.
- **Web server**: Nginx listens on **port 8095** (the public port — there is no `:80` vhost
  for this app), serves `apps/web/dist`, and proxies `/api/` → `127.0.0.1:3000`.
- **Paths**: repo `/var/www/gymtracker`; uploaded photos `/var/data/gymtracker/photos`.
- **Ports**: API **3000** (internal only); Nginx public **8095**. Hitting `http://localhost/`
  (port 80) returns 404 — always use `http://localhost:8095/`.
- **Node**: v22.x.

---

## This server (read before a routine update)

The provisioning sections below were done long ago; a **recurring update** only needs these facts:

- **This host IS production — there is no SSH hop.** The Beelink Mini-PC (`192.168.50.69`,
  user `f13r`) is the prod server. Deploy by running the **Deploy / start** block directly on it.
- **Two checkouts live on this box** — don't confuse them:
  - `/var/www/gymtracker` — the **production** checkout PM2 + Nginx serve. **Deploy here.**
  - `/home/f13r/html/gymtracker` — a dev/working checkout. Not served; never deploy from it.
- **Already cut over to Postgres + pgvector and seeded** (`vector` extension present, journal at
  11). So a routine update is **just the Deploy / start block** — `db:migrate` is a no-op until a
  new migration lands. The prod data is the live source of truth; nothing in a release reads or
  writes it (see "Production data"). Row counts (exercises, etc.) grow as users add data — don't
  treat them as a fixed sanity figure.
- **`sudo` is non-interactive here.** For psql/postgres admin from an agent shell, pipe the
  password from the global `~/.claude/CLAUDE.md`:
  `echo Ser38dik | sudo -S -p '' -u postgres psql -d gymtracker -c "…"`.
- **Quick deploy:** the `/deploy` slash command (`.claude/commands/deploy.md`) wraps the
  Deploy / start block + verification with the correct port (8095) and sudo handling.

---

## ⚠️ Two settings that have broken this deploy before

1. **`DATABASE_URL` must be a Postgres URL — never a file path.** The `pg` driver parses a
   bare path like `/var/data/gymtracker/db.sqlite` as a _unix-socket directory_ and fails with
   `connect ENOENT /var/data/gymtracker/db.sqlite/.s.PGSQL.5432`. It must look like
   `postgresql://USER:PASSWORD@127.0.0.1:5432/gymtracker`.
2. **pgvector must be installed on the Postgres server.** Without it, migration `0005` fails on
   `CREATE EXTENSION ... vector` with `extension "vector" is not available … vector.control:
No such file`. `drizzle-kit migrate` prints this to nothing — exit code 1 with empty stderr —
   so a black-box migrate failure almost always means one of these two.

---

## Production data — the live DB is the source of truth

The one-time SQLite→Postgres cutover is **done**: production runs PostgreSQL 16 + pgvector, was
seeded once from a data snapshot (Drizzle journal at **11 migrations**, through
`0010_quick_slayback`), and its data has been the canonical copy since. The committed snapshot
file (`apps/api/db/prod-snapshot.sql`) has been **removed from the repo** — there is nothing to
restore any more, and **no deploy step reads or writes data**. Releases only apply pending
Drizzle schema migrations via `npm run db:migrate` (see `.github/workflows/deploy.yml`). Never
restore a dump over the production database.

**Back up production data** (run on the server; keep backups outside the repo):

```bash
sudo -u postgres pg_dump -d gymtracker --no-owner --no-privileges > ~/gymtracker-backup-$(date +%F).sql
```

**Copy production data to a dev machine** (data flows prod → dev, never the other way): run
`npm run db:pull-prod` on the dev machine (`scripts/db-pull-prod.sh`). It streams a `pg_dump`
from the server over SSH (read-only against prod) and rebuilds the local Docker `gymtracker` DB
from it. Requires key-based SSH to `f13r@192.168.50.69` and the local compose Postgres running.

---

## Automated deploys

One GitHub Actions workflow runs on the **self-hosted runner on this box** (service
`actions.runner.f13r-gymtracker.homeserver`, user `f13r`):

- **`deploy.yml` — code deploy, automatic on push to `main`.** Runs the idempotent **Deploy /
  start** block (build → `db:migrate` → `pm2 reload`). Never touches data. This is the only
  automated path. (The former `ai-deploy.yml` data-resync workflow was removed together with the
  committed snapshot — there is no restore path any more, by design.)

### Non-interactive sudo (required by both the runner and any agent)

The runner has **no tty**, so `sudo -u postgres …` can't prompt for a password. A scoped sudoers
drop-in makes the psql/backup commands passwordless for `f13r` —
`/etc/sudoers.d/gymtracker-deploy` (mode 440):

```
f13r ALL=(postgres) NOPASSWD: /usr/bin/psql, /usr/bin/pg_dump
```

With it, every `sudo -u postgres psql|pg_dump` in this doc works verbatim unattended. Recreate it
on a fresh box (`visudo -c -f` to validate). For ad-hoc interactive sudo in an agent shell without
this rule, the fallback is a `SUDO_ASKPASS` helper + `sudo -A` (the runner doesn't need it).

---

## One-time provisioning

Skip any step already satisfied. Run as a non-root sudo user (examples assume `ubuntu`).

### 1. System packages

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx postgresql-16 postgresql-16-pgvector
sudo npm install -g pm2
node -v   # expect v22.x
```

> If `postgresql-16-pgvector` isn't found, add PGDG: `sudo apt-get install -y postgresql-common &&
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh` then retry. If Postgres runs in
> Docker instead, use the `pgvector/pgvector:pg16` image.

### 2. Database, role, and extension

```bash
# Pick a strong password and reuse it in apps/api/.env (step 4).
sudo -u postgres psql <<'SQL'
CREATE ROLE gymtracker WITH LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE gymtracker OWNER gymtracker;
\connect gymtracker
CREATE EXTENSION IF NOT EXISTS vector;   -- must be done as a superuser; 'vector' is not a trusted extension
SQL
```

### 3. Directories

```bash
sudo mkdir -p /var/www/gymtracker /var/data/gymtracker/photos
sudo chown -R "$USER:$USER" /var/www/gymtracker /var/data/gymtracker
```

### 4. Clone the repo

```bash
git clone https://github.com/f13r/gymtracker.git /var/www/gymtracker
# Private repo? Set up a deploy key first — see docs/server-setup.md Step 4a.
```

### 5. Create `apps/api/.env` (the single source of truth)

```bash
cat > /var/www/gymtracker/apps/api/.env <<'EOF'
DATABASE_URL=postgresql://gymtracker:CHANGE_ME@127.0.0.1:5432/gymtracker
PHOTOS_DIR=/var/data/gymtracker/photos
PORT=3000
NODE_ENV=production
GEMINI_API_KEY=CHANGE_ME
EOF
```

> `DATABASE_URL` MUST start with `postgresql://`. Use the password from step 2.
> **`GEMINI_API_KEY` is mandatory** — `gemini.service.ts` reads it with `getOrThrow`, so a missing
> or empty value makes the API **crash on boot**. Obtain the key out-of-band (it is intentionally
> not committed to the repo) and paste the real value here.

### 6. Nginx + GitHub Actions auto-deploy

Follow `docs/server-setup.md` **Step 9** (Nginx site) and **Steps 11–12** (SSH key + secrets).
Those parts are still accurate **except the listen port**: this app's vhost listens on
**`8095`**, not `80` (and `server-setup.md`'s verify `curl http://localhost/...` lines should be
`http://localhost:8095/...`). The `proxy_pass` to `127.0.0.1:3000` is correct.

---

## Deploy / start (idempotent — this is what every release runs)

```bash
cd /var/www/gymtracker
git fetch origin main && git reset --hard origin/main
npm ci
npm run build --workspace=packages/shared   # shared must build first (api/web import it)
npm run build --workspace=apps/api
npm run build --workspace=apps/web
npm run db:migrate                           # applies pending Drizzle migrations
pm2 reload ecosystem.config.js --env production   # use `pm2 start` on the very first run
```

First run only, to persist across reboots:

```bash
pm2 save
pm2 startup   # then run the sudo command it prints
```

This mirrors `.github/workflows/deploy.yml`; the workflow does it automatically on push to `main`.

### Schema migrations in releases

`npm run db:migrate` (and the API's on-boot migrate) applies any pending Drizzle migrations
automatically — adding a migration to the repo needs no extra deploy step. Newest migration:

- **`0010_quick_slayback`** — Session Snapshot model (ADR-0008). Adds the `session_exercises`
  table and the nullable `sets.removed_at` column. **Already applied on production** (journal at
  11), so `db:migrate` is a no-op for it; verify with
  `SELECT count(*) FROM drizzle.__drizzle_migrations;` → **11**.
- **`0011_ordinary_electro`** — local Exercise media (ADR-0010). Adds nullable `exercises.image_path`,
  `thumb_path`, `description`. Applies automatically.
- **`0012_great_guardian`** — drops the legacy `exercises.wger_id` column after the one-time media
  backfill (below) had used it. Applies automatically.

### One-time: migrate Exercise media off wger.de (ADR-0010) — DONE on prod 2026-06-18

Demonstration images used to be hot-linked live from wger.de by `wger_id`. They are now stored
locally (`.webp` under `PHOTOS_DIR/_defaults`, served by exercise id). The images that existed only
as wger URLs were preserved by a **one-time, idempotent backfill** run **directly on prod** (the
server reaches wger.de and owns the live DB + `PHOTOS_DIR`, so no dump/file-copy was needed):

```
cd /var/www/gymtracker && npm run backfill:exercise-media   # reads apps/api/.env
```

Result: 45 exercises processed, 43 images + 45 descriptions written (2 had no wger image). The
`wger_id` column was the backfill's join key, so the order was load-bearing: `0011` added the
columns and **kept** `wger_id`; the backfill ran; then `0012` dropped `wger_id`. If this ever needs
re-running on a fresh environment, restore the column and the `wger_id` values first — but on a
normal `db:pull-prod` the local DB simply mirrors prod's already-migrated state.

> If you ever re-clone into a fresh `PHOTOS_DIR`, the image **files** are not in a DB dump — copy
> `PHOTOS_DIR/_defaults/` from prod (or re-run the backfill against a DB that still has `wger_id`).

---

## Personal workout data

Personal data (custom exercises, templates, schedules, body data, workout history) lives **only
in the production database** — no deploy step seeds, restores, or otherwise touches it. The old
`npm run db:setup-workout` script still exists in the repo but is **stale** (its hard-coded
exercise list has diverged from the live data) — do **not** run it as part of deploy.

---

## Verify

```bash
ls apps/api/dist/main.js apps/web/dist/index.html      # build artifacts exist
pm2 status                                             # "gymtracker" is "online"
pm2 logs gymtracker --lines 30                         # no boot errors
curl -fsS http://localhost:3000/api/health             # API up (direct)
curl -fsS http://localhost:8095/api/health             # API up (via Nginx — public port 8095, NOT 80)
curl -s http://localhost:8095/ | grep -o '<title>.*</title>'  # SPA served
```

---

## Troubleshooting

| Symptom                                                                     | Cause                                                      | Fix                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run db:migrate` exits 1 with **no error text**, "applying migrations…" | One of the two below — drizzle-kit swallows the real error | Reproduce with the verbose probe below to see it                                                                  |
| `connect ENOENT …/db.sqlite/.s.PGSQL.5432` (or `ECONNREFUSED`)              | `DATABASE_URL` is a file path / wrong host                 | Fix `apps/api/.env` to a real `postgresql://…` URL (see step 5)                                                   |
| `extension "vector" is not available … vector.control: No such file`        | pgvector not installed on the Postgres host                | `sudo apt-get install -y postgresql-16-pgvector`, then step 2's `CREATE EXTENSION`                                |
| `permission denied to create extension "vector"`                            | Migrating role isn't superuser                             | Run the `CREATE EXTENSION` once as the `postgres` superuser (step 2); the app role then just uses it              |
| API boots then crashes on DB calls                                          | Runtime read the wrong `DATABASE_URL`                      | Confirm PM2 `cwd: apps/api` and that no `DATABASE_URL` is set in `ecosystem.config.js` (it must come from `.env`) |
| API exits immediately on boot, log mentions `GEMINI_API_KEY` / `getOrThrow` | `GEMINI_API_KEY` missing/empty in `apps/api/.env`          | Set a real `GEMINI_API_KEY` in `.env` (step 5), then `pm2 reload …`                                               |
| `curl http://localhost/...` → 404 / connection refused                      | Nginx public port is **8095**, not 80                      | Use `http://localhost:8095/` (see Architecture → Ports)                                                           |

**See the real migrate error** (drizzle-kit hides it). Test the connection directly — this prints
the `pg` error that `db:migrate` swallows:

```bash
cd /var/www/gymtracker/apps/api
export $(grep -v '^#' .env | xargs)            # load DATABASE_URL from .env
node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('select 1').then(()=>console.log('CONNECT OK')).catch(e=>console.log('CONNECT ERR:',e.code,e.message)).finally(()=>p.end())"
```

`CONNECT OK` → the issue is pgvector (run step 2). `CONNECT ERR` → fix `DATABASE_URL` in `.env`.

---

## Maintenance reference

| Task                 | Command                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| View API logs        | `pm2 logs gymtracker`                                                                                     |
| Restart / reload API | `pm2 restart gymtracker` / `pm2 reload ecosystem.config.js --env production`                              |
| PM2 status           | `pm2 status`                                                                                              |
| Reload Nginx         | `sudo systemctl reload nginx`                                                                             |
| Open DB shell        | `sudo -u postgres psql -d gymtracker`                                                                     |
| Back up DB           | `sudo -u postgres pg_dump -d gymtracker --no-owner --no-privileges > ~/gymtracker-backup-$(date +%F).sql` |
| Confirm pgvector     | `sudo -u postgres psql -d gymtracker -c "SELECT extname FROM pg_extension WHERE extname='vector';"`       |
| Manual deploy        | the **Deploy / start** block above                                                                        |

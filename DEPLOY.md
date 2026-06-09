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
- **Web server**: Nginx serves `apps/web/dist` and proxies `/api/` → `127.0.0.1:3000`.
- **Paths**: repo `/var/www/gymtracker`; uploaded photos `/var/data/gymtracker/photos`.
- **API port**: 3000 (internal only).
- **Node**: v22.x.

---

## ⚠️ Two settings that have broken this deploy before

1. **`DATABASE_URL` must be a Postgres URL — never a file path.** The `pg` driver parses a
   bare path like `/var/data/gymtracker/db.sqlite` as a *unix-socket directory* and fails with
   `connect ENOENT /var/data/gymtracker/db.sqlite/.s.PGSQL.5432`. It must look like
   `postgresql://USER:PASSWORD@127.0.0.1:5432/gymtracker`.
2. **pgvector must be installed on the Postgres server.** Without it, migration `0005` fails on
   `CREATE EXTENSION ... vector` with `extension "vector" is not available … vector.control:
   No such file`. `drizzle-kit migrate` prints this to nothing — exit code 1 with empty stderr —
   so a black-box migrate failure almost always means one of these two.

---

## Cutover from the current SQLite setup (READ FIRST)

**The production server is currently running on SQLite** (`/var/data/gymtracker/db.sqlite`) from
an older build. The codebase no longer supports SQLite — it now requires **PostgreSQL 16 +
pgvector**. This deploy is a one-way cutover, and it does **not** start from an empty database:
it **restores a snapshot of the current local data** so the production DB ends up with *exactly
the same information* — the default user, all 54 exercises (incl. `wger_id`s), the 3 workout
templates, June 2026 schedules, body data, and the 20 pre-computed `coaching_knowledge`
embeddings. The snapshot is committed at **`apps/api/db/prod-snapshot.sql`**.

Do the cutover in this order:

1. **Provision Postgres** — do the "One-time provisioning" steps 1 & 2 below (install
   `postgresql-16` + `postgresql-16-pgvector`, create the `gymtracker` role/db, and
   `CREATE EXTENSION vector`).
2. **Create `apps/api/.env`** — step 5 below. `DATABASE_URL` must be the `postgresql://…` URL
   (never the old SQLite file path), and **`GEMINI_API_KEY` must be set** or the API throws on
   boot (`gemini.service.ts` does `getOrThrow`).
3. **Get the code** — clone (step 4) or, on an existing checkout, `git fetch origin main &&
   git reset --hard origin/main && npm ci && build` (the **Deploy / start** block). The snapshot
   file ships with the repo.
4. **Restore the snapshot — this REPLACES `db:migrate` for the initial cutover.** See
   **"Restore the production data snapshot"** below. The snapshot already contains the full
   schema *and* the Drizzle migration journal, so you do **not** run `npm run db:migrate` on the
   very first boot — the dump builds the schema. (`db:migrate` on later releases is a harmless
   no-op until a genuinely new migration lands.)
5. **Start** — `pm2 start ecosystem.config.js --env production`. On boot `SeedService` and
   `CoachingKnowledgeService` see the rows already present and no-op, so nothing is duplicated or
   re-embedded.

### What happens to the old SQLite data
- The restore loads the **committed Postgres snapshot**, not the old SQLite file. Any data that
  exists *only* in `db.sqlite` and not in the snapshot is **not** carried over. The snapshot is
  the source of truth for production's starting state.
- **Uploaded photo files** on disk (`/var/data/gymtracker/photos`) are untouched. (The current
  snapshot has zero `progress_photos` rows, so there are no photo references to reconcile.)
- Keep the old `db.sqlite` file as a backup until you've confirmed the Postgres app is healthy;
  don't delete it as part of cutover.

---

## Restore the production data snapshot (ONE-TIME, initial cutover only)

> ⚠️ **Run this exactly once, during the initial Postgres cutover.** It is **not** part of the
> recurring release flow and is **not** in `.github/workflows/deploy.yml`. Re-running it against
> a live database **drops and recreates the database**, destroying any data logged on the server
> since cutover. Do not wire it into the deploy pipeline.

The snapshot is `apps/api/db/prod-snapshot.sql` — a plain-SQL `pg_dump` (`--no-owner
--no-privileges`) containing the full schema, the `drizzle` migration journal, and all rows
including the `vector(768)` coaching-knowledge embeddings. It is restored **as the `postgres`
superuser** (so the pgvector extension can be created) but with `SET ROLE gymtracker` so every
restored object ends up **owned by the `gymtracker` app role**.

```bash
cd /var/www/gymtracker
# (Re)create an empty DB owned by the app role. DESTRUCTIVE — only at cutover.
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DROP DATABASE IF EXISTS gymtracker;
CREATE DATABASE gymtracker OWNER gymtracker;
SQL
# pgvector must be created by a superuser, before the data loads.
sudo -u postgres psql -d gymtracker -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;"
# Restore as superuser, but SET ROLE so tables are owned by gymtracker. ON_ERROR_STOP catches problems.
( echo "SET ROLE gymtracker;"; cat apps/api/db/prod-snapshot.sql ) \
  | sudo -u postgres psql -d gymtracker -v ON_ERROR_STOP=1
```

This recipe was validated end-to-end against a scratch DB: it restores with **zero errors**, and
every table (exercises, templates, schedules, `coaching_knowledge`, the Drizzle journal) ends up
owned by `gymtracker`. After it completes, skip `db:migrate` and go straight to `pm2 start`.

**Verify the restore:**
```bash
sudo -u postgres psql -d gymtracker -c "SELECT count(*) AS exercises FROM exercises;"            # expect 54
sudo -u postgres psql -d gymtracker -c "SELECT count(*) AS coaching FROM coaching_knowledge;"    # expect 20
sudo -u postgres psql -d gymtracker -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"      # expect 10 — boot migrate will no-op
```

### Regenerating the snapshot (from the dev machine, when local data changes)
The snapshot is a point-in-time capture. To refresh it, dump the local DB and **drop the single
`COMMENT ON EXTENSION` line** (it requires extension ownership and would break the `SET ROLE`
restore), then commit:
```bash
pg_dump "$LOCAL_DATABASE_URL" --no-owner --no-privileges \
  | grep -v "^COMMENT ON EXTENSION vector" > apps/api/db/prod-snapshot.sql
git add apps/api/db/prod-snapshot.sql && git commit -m "chore: refresh prod data snapshot"
```
Because a refreshed snapshot carries a new schema + journal, only restore it onto a server you
intend to reset to that state — the same one-time, destructive caveat applies.

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
> sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh` then retry. If Postgres runs in
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
Those parts are still accurate.

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

---

## Personal workout data

Personal data (custom exercises, templates, schedules, body data) is **no longer seeded by a
script** — it is carried by the committed snapshot and loaded by the one-time restore above
(**"Restore the production data snapshot"**). The old `npm run db:setup-workout` script still
exists in the repo but is **stale** (its hard-coded exercise list has diverged from the live data)
— do **not** run it as part of deploy; the snapshot is the source of truth.

---

## Verify
```bash
ls apps/api/dist/main.js apps/web/dist/index.html      # build artifacts exist
pm2 status                                             # "gymtracker" is "online"
pm2 logs gymtracker --lines 30                         # no boot errors
curl -fsS http://localhost:3000/api/health             # API up (direct)
curl -fsS http://localhost/api/health                  # API up (via Nginx)
curl -s http://localhost/ | grep -o '<title>.*</title>'# SPA served
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm run db:migrate` exits 1 with **no error text**, "applying migrations…" | One of the two below — drizzle-kit swallows the real error | Reproduce with the verbose probe below to see it |
| `connect ENOENT …/db.sqlite/.s.PGSQL.5432` (or `ECONNREFUSED`) | `DATABASE_URL` is a file path / wrong host | Fix `apps/api/.env` to a real `postgresql://…` URL (see step 5) |
| `extension "vector" is not available … vector.control: No such file` | pgvector not installed on the Postgres host | `sudo apt-get install -y postgresql-16-pgvector`, then step 2's `CREATE EXTENSION` |
| `permission denied to create extension "vector"` | Migrating role isn't superuser | Run the `CREATE EXTENSION` once as the `postgres` superuser (step 2); the app role then just uses it |
| API boots then crashes on DB calls | Runtime read the wrong `DATABASE_URL` | Confirm PM2 `cwd: apps/api` and that no `DATABASE_URL` is set in `ecosystem.config.js` (it must come from `.env`) |
| API exits immediately on boot, log mentions `GEMINI_API_KEY` / `getOrThrow` | `GEMINI_API_KEY` missing/empty in `apps/api/.env` | Set a real `GEMINI_API_KEY` in `.env` (step 5), then `pm2 reload …` |
| Restore aborts on `must be owner of extension vector` | Snapshot still has the `COMMENT ON EXTENSION` line | Regenerate the snapshot with the `grep -v "^COMMENT ON EXTENSION vector"` filter (see "Regenerating the snapshot") |

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

| Task | Command |
|---|---|
| View API logs | `pm2 logs gymtracker` |
| Restart / reload API | `pm2 restart gymtracker` / `pm2 reload ecosystem.config.js --env production` |
| PM2 status | `pm2 status` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Open DB shell | `sudo -u postgres psql -d gymtracker` |
| Confirm pgvector | `sudo -u postgres psql -d gymtracker -c "SELECT extname FROM pg_extension WHERE extname='vector';"` |
| Manual deploy | the **Deploy / start** block above |

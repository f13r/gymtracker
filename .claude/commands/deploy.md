---
description: Pull latest main and deploy gymtracker to production (/var/www/gymtracker on this host)
---

Deploy gymtracker to production. **This host (Beelink, 192.168.50.69) IS the prod server** — no SSH. Prod checkout: `/var/www/gymtracker`. Authoritative runbook: `DEPLOY.md`. Public URL is nginx on **port 8095** (port 80 is a different app). DB is **PostgreSQL 16 + pgvector**; `apps/api/.env` is the single source of truth for `DATABASE_URL` (must start with `postgresql://`).

`sudo` here is non-interactive — pipe the password from the global CLAUDE.md: `echo Ser38dik | sudo -S -p '' …`.

Run the idempotent release flow, then verify. Stop and report if any step fails (don't reload a broken build).

```bash
cd /var/www/gymtracker
git fetch origin main && git reset --hard origin/main
npm ci
npm run build --workspace=packages/shared   # shared MUST build first (api/web import it)
npm run build --workspace=apps/api
npm run build --workspace=apps/web
npm run db:migrate                           # applies pending Drizzle migrations (no-op if none)
pm2 reload ecosystem.config.js --env production
```

Then verify and report the results:

```bash
cd /var/www/gymtracker
ls apps/api/dist/main.js apps/web/dist/index.html        # build artifacts exist
pm2 status | grep gymtracker                             # "online"
curl -fsS http://localhost:3000/api/health              # API up (direct)
curl -fsS http://localhost:8095/api/health              # API up (via nginx)
curl -s  http://localhost:8095/ | grep -o '<title>.*</title>'   # SPA served
echo Ser38dik | sudo -S -p '' -u postgres psql -d gymtracker -tAc \
  "SELECT (SELECT count(*) FROM exercises) ex, (SELECT count(*) FROM coaching_knowledge) ck;"  # sanity: 54 / 20
```

If `db:migrate` exits 1 with no error text, it's almost always (a) `DATABASE_URL` not a real `postgresql://` URL, or (b) pgvector missing — see `DEPLOY.md` Troubleshooting and the verbose `pg` connection probe there. The prod database is the live source of truth — never restore any dump over it as part of a deploy (the old committed snapshot and its restore recipe were removed from the repo).

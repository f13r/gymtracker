---
description: Push main, watch the auto-deploy, then SSH to prod and verify it's healthy
---

Deploy gymtracker to production **from the dev Mac**. The flow is: push `main` → the
`deploy.yml` GitHub Action runs the idempotent release on the self-hosted runner (the Beelink)
→ SSH in and verify. Stop and report if any step fails — don't declare success on a red run.

**Facts.** Prod = Beelink `f13r@192.168.50.69` (hostname `homeserver`), key-based SSH from this
Mac works. Prod checkout: `/var/www/gymtracker` (never `~/html/gymtracker` — that's a dev
checkout). Public URL = nginx on **port 8095** (port 80 is a different app). API is internal on
`:3000`. DB = PostgreSQL 16 + pgvector. Authoritative runbook: `DEPLOY.md`. On-server `sudo` is
non-interactive — pipe the password from the global `~/.claude/CLAUDE.md`:
`echo <pw> | sudo -S -p '' …`.

## 1. Push code

```bash
git push origin main
```

If there's nothing unpushed, the push is a no-op — that's fine; continue to verify the latest
release. If there are uncommitted local changes the user wants shipped, commit them first
(don't add `Co-Authored-By` lines).

## 2. Watch the auto-deploy

The push to `main` triggers `deploy.yml`. Wait for it to finish and confirm success:

```bash
gh run watch "$(gh run list --workflow=deploy.yml --branch=main --limit=1 --json databaseId -q '.[0].databaseId')" --exit-status
```

`--exit-status` makes this exit non-zero on a failed run. If it fails, fetch the logs
(`gh run view <id> --log-failed`) and report — do **not** proceed to verify.

## 3. Verify on prod (over SSH)

```bash
ssh f13r@192.168.50.69 'cd /var/www/gymtracker
echo "=== HEAD ===";       git log --oneline -1
echo "=== artifacts ===";  ls apps/api/dist/main.js apps/web/dist/index.html
echo "=== pm2 ===";        pm2 status | grep gymtracker         # "online"
echo "=== api direct ==="; curl -fsS http://localhost:3000/api/health; echo
echo "=== api nginx ===";  curl -fsS http://localhost:8095/api/health; echo
echo "=== spa ===";        curl -s http://localhost:8095/ | grep -o "<title>.*</title>"
'
```

Healthy = prod HEAD matches the just-pushed commit, both artifacts exist, PM2 `gymtracker` is
`online`, both health checks return `{"status":"ok"}`, and the SPA `<title>` renders. The API
health check exercises the DB, so a green API means Postgres/pgvector are reachable — no row-count
check needed (counts grow with user data and aren't a sanity figure). For deeper DB diagnostics
(pgvector probe, migrate failures) see `DEPLOY.md` → Troubleshooting.

Report the table of results. If `deploy.yml` ever can't run (runner down), the fallback is to SSH
in and run `DEPLOY.md` → **Deploy / start** block manually.

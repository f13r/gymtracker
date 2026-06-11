You are running UNATTENDED on the production server (the GitHub Actions self-hosted runner,
user `f13r`, working dir `/var/www/gymtracker`). No human is watching. Your job: perform the
**production data-restore deploy** by following the repo's `DEPLOY.md`, then report.

Read `DEPLOY.md` now and follow its **"Restore the production data snapshot"** recipe exactly.
This is the intentional, destructive local→prod resync: prod's current data is discarded and
replaced by the committed `apps/api/db/prod-snapshot.sql`. That is the desired outcome — do not
try to preserve current prod data beyond the backup step below.

Hard rules (do not deviate):
1. Operate ONLY on `/var/www/gymtracker`. Do not edit source, do not git commit, do not push.
2. `sudo` here is non-interactive and passwordless ONLY for `sudo -u postgres psql` and
   `sudo -u postgres pg_dump` (a scoped sudoers rule). Use those exactly. Never attempt other
   sudo commands or interactive prompts — there is no tty.
3. BACK UP FIRST, always: `sudo -u postgres pg_dump -d gymtracker --no-owner --no-privileges`
   to `/var/data/gymtracker/pre-restore-<UTC timestamp>.sql` before any DROP. If the backup
   does not succeed, ABORT and report — do not drop the DB.
4. Preconditions before restore: confirm pgvector is installed (the `vector` extension) and that
   `apps/api/.env` has a non-empty `GEMINI_API_KEY` (the API getOrThrows without it). If either
   fails, ABORT and report — do not drop the DB.
5. Sequence: `pm2 stop gymtracker` → backup → DROP/CREATE DB → `CREATE EXTENSION vector` →
   load snapshot with `SET ROLE gymtracker` → `pm2 start ecosystem.config.js --env production`.
   Do NOT run `db:migrate` (the snapshot already carries the Drizzle journal).
6. If any step errors, STOP immediately, leave the DB as-is, and report what failed plus the
   backup path so a human can restore.

Verify after restore and include the numbers in your final report:
- counts must match the snapshot: 54 exercises, 20 coaching_knowledge, 3 workout_templates,
  the journal at 11 migrations, and the session/sets/session_exercises counts the snapshot carries.
- `curl -fsS http://localhost:3000/api/health` and `http://localhost:8095/api/health` both `{"status":"ok"}`.
- `pm2 status` shows `gymtracker` online.

Final message: a concise report — backup path, restored counts, health results, and PASS/FAIL.

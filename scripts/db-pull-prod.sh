#!/usr/bin/env bash
# Refresh the local dev DB from production (data flows prod → dev, never back).
# Prod is only ever READ (pg_dump over SSH, passwordless via the server's sudoers rule);
# the DESTRUCTIVE part is local only: drops and recreates the gymtracker DB in Docker.
set -euo pipefail

REMOTE=f13r@192.168.50.69
CONTAINER=gymtracker-postgres-1

docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" \
  || { echo "Local Postgres container '$CONTAINER' is not running — start it: docker compose up -d" >&2; exit 1; }

# Dump to a temp file FIRST so the local DB is only dropped once the full dump landed —
# a dropped SSH connection mid-stream must not leave us with no DB at all.
dump=$(mktemp -t gymtracker-prod-dump)
trap 'rm -f "$dump"' EXIT
echo "Dumping prod DB over SSH (read-only)…"
ssh -o BatchMode=yes "$REMOTE" 'sudo -n -u postgres pg_dump -d gymtracker --no-owner --no-privileges' > "$dump"
echo "Dump received: $(du -h "$dump" | cut -f1)"

echo "Recreating local DB…"
docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS gymtracker WITH (FORCE);" \
  -c "CREATE DATABASE gymtracker;"
docker exec -i "$CONTAINER" psql -U postgres -d gymtracker -v ON_ERROR_STOP=1 -q \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "Restoring…"
docker exec -i "$CONTAINER" psql -U postgres -d gymtracker -v ON_ERROR_STOP=1 -q < "$dump" >/dev/null

docker exec "$CONTAINER" psql -U postgres -d gymtracker -tA -c \
  "SELECT 'exercises='     || (SELECT count(*) FROM exercises)
       || ' sessions='     || (SELECT count(*) FROM workout_sessions)
       || ' templates='    || (SELECT count(*) FROM workout_templates)
       || ' migrations='   || (SELECT count(*) FROM drizzle.__drizzle_migrations);"
echo "Local DB now mirrors prod."

#!/bin/sh
set -e

PRISMA="/app/apps/api/node_modules/.bin/prisma"
SCHEMA="/app/apps/api/prisma/schema.prisma"

# Render's free instance and Neon's free compute both sleep, so a cold start can
# find the database still waking. Retry instead of exiting: this script runs on
# every container start now, and a crash here takes the service down until
# Render restarts it.
migrate_with_retry() {
  attempt=1
  while [ "$attempt" -le 5 ]; do
    if "$PRISMA" migrate deploy --schema "$SCHEMA"; then
      return 0
    fi
    echo "entrypoint: migration attempt $attempt failed, retrying in ${attempt}s"
    sleep "$attempt"
    attempt=$((attempt + 1))
  done
  echo "entrypoint: migrations failed after 5 attempts"
  return 1
}

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "entrypoint: applying migrations"
  migrate_with_retry
fi

if [ "${RUN_DEMO_SEED:-false}" = "true" ]; then
  echo "entrypoint: demo seed requested"
  node /app/apps/api/dist/demo/seed-cli.js
fi

exec "$@"

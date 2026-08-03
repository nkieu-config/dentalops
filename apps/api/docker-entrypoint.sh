#!/bin/sh
set -e

PRISMA="/app/apps/api/node_modules/.bin/prisma"
SCHEMA="/app/apps/api/prisma/schema.prisma"

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "entrypoint: applying migrations"
  "$PRISMA" migrate deploy --schema "$SCHEMA"
fi

if [ "${RUN_DEMO_SEED:-false}" = "true" ]; then
  echo "entrypoint: demo seed requested"
  node /app/apps/api/dist/demo/seed-cli.js
fi

exec "$@"

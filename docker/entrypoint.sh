#!/bin/sh
set -e

# Abort immediately if DATABASE_URL is not set — better than a cryptic crash later
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Aborting." >&2
  exit 1
fi

echo "[entrypoint] Running database migrations..."
node ./migrate.cjs

echo "[entrypoint] Starting web server on port ${PORT:-3000}..."
exec node ./apps/web/server.js

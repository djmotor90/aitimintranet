#!/bin/sh
set -e

echo "Running database migrations..."
node ./migrate.cjs

echo "Starting web server..."
exec node ./apps/web/server.js

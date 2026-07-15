# ─────────────────────────────────────────────────────────────────────────────
# AITIM Intranet — multi-stage build
# One image, two run modes (set via CMD override in Coolify):
#   web:    ./entrypoint.sh          → runs migrations then Next.js standalone
#   worker: node dist/worker.js      → pg-boss background consumers
#
# Build context: repo root
# Coolify Dockerfile path: docker/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. base ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

# ── 2. deps — install all workspace deps (layer-cached on lockfile change) ──
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json       apps/web/
COPY packages/db/package.json    packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ── 3. build — compile everything ────────────────────────────────────────────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1

# Restore installed packages
COPY --from=deps /app/node_modules            ./node_modules
COPY --from=deps /app/apps/web/node_modules   ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy all source (node_modules excluded via .dockerignore)
COPY . .

# Build: Next.js standalone + worker bundle + DB migrator CJS bundle
RUN pnpm --filter web build \
 && pnpm --filter web build:worker \
 && pnpm --filter @aitim/db build:migrator

# ── 4. runner — minimal production image ─────────────────────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S app && adduser -S app -G app

# Next.js standalone server (includes its own node_modules subset)
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public           ./apps/web/public

# DB migrations folder + bundled migrator (used in entrypoint)
COPY --from=builder --chown=app:app /app/packages/db/migrations    ./packages/db/migrations
COPY --from=builder --chown=app:app /app/packages/db/dist/migrate.cjs ./migrate.cjs

# Worker bundle
COPY --from=builder --chown=app:app /app/apps/web/dist/worker.js   ./dist/worker.js

# Entrypoint script
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER app
EXPOSE 3000
CMD ["./entrypoint.sh"]

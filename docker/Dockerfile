# AITIM Intranet — single image, two run modes:
#   web:    ./entrypoint.sh   (runs migrations, then Next.js standalone server)
#   worker: node dist/worker.js
FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build && pnpm --filter web build:worker && pnpm --filter @aitim/db build:migrator

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app

# Next.js standalone output
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public

# Migrations + bundled migrator for the entrypoint migration step
COPY --from=build --chown=app:app /app/packages/db/migrations ./packages/db/migrations
COPY --from=build --chown=app:app /app/packages/db/dist/migrate.cjs ./migrate.cjs

# Worker bundle (run with: node dist/worker.js)
COPY --from=build --chown=app:app /app/apps/web/dist/worker.js ./dist/worker.js
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["./entrypoint.sh"]

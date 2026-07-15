# AITIM Group Intranet

Modular intranet platform with Microsoft Entra ID SSO. First module: task management
for the safety department (ClickUp-style: Spaces → Lists → Tasks, custom fields,
kanban/table views, public customer request forms).

## Stack

Next.js 16 (App Router) · PostgreSQL 17 · Drizzle ORM · Auth.js v5 (Entra ID) ·
pg-boss · MinIO · Tailwind v4 + shadcn/ui · deployed on Coolify.

## Development

```bash
pnpm install
cp .env.example .env   # fill in Entra credentials
pnpm db:migrate
pnpm db:seed

# One command — boots infrastructure, web app, and background worker together
pnpm dev:all          # http://localhost:3000  (Ctrl-C to stop everything)
```

The logs are prefixed by service: `[infra]`, `[web]`, `[worker]`.

### Granular scripts

If you'd rather run pieces individually (e.g. when developing a single service):

```bash
pnpm dev:infra       # postgres + minio + mailpit  (foreground)
pnpm dev             # Next.js only                → http://localhost:3000
pnpm worker:dev      # background worker          (sync, emails, due-soon)
```

- Mailpit UI (captured dev email): http://localhost:8025
- MinIO console: http://localhost:9001 (aitim / aitim-dev-secret)
- `pnpm dev:infra:down` to stop and remove the dev containers

## Structure

```
apps/web             Next.js app (shell + modules in src/modules/*)
packages/db          Drizzle schema, migrations, seed
packages/shared      Zod schemas, custom-field type registry
docker/              docker-compose.dev.yml (postgres, minio, mailpit)
docs/                entra-setup.md, coolify.md
Dockerfile           production build (Coolify-compatible defaults)
entrypoint.sh        production entrypoint (runs migrations then server)
```

## Docs

- [Entra ID app registration setup](docs/entra-setup.md)
- [Coolify deployment](docs/coolify.md) — works with all default settings

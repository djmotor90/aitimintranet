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
docker compose -f docker/docker-compose.dev.yml up -d   # postgres, minio, mailpit
cp .env.example .env                                     # fill in Entra credentials
pnpm db:migrate
pnpm db:seed
pnpm dev                                                 # http://localhost:3000
```

- Mailpit UI (captured dev email): http://localhost:8025
- MinIO console: http://localhost:9001 (aitim / aitim-dev-secret)

## Structure

```
apps/web          Next.js app (shell + modules in src/modules/*)
packages/db       Drizzle schema, migrations, seed
packages/shared   Zod schemas, custom-field type registry
docker/           Dockerfile (prod), docker-compose.dev.yml
docs/             entra-setup.md, coolify.md
```

## Docs

- [Entra ID app registration setup](docs/entra-setup.md)
- [Coolify deployment](docs/coolify.md)

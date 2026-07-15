# Coolify Deployment

One Coolify project, four resources on a shared network:

| Resource | Type | Notes |
|---|---|---|
| `postgres` | Coolify PostgreSQL 17 | Persistent volume; enable scheduled backups |
| `minio` | Coolify MinIO | Create buckets `attachments`, `photos`; keep console internal |
| `intranet-web` | App (Dockerfile) | Build from repo, `docker/Dockerfile`; default CMD runs migrations then the server |
| `intranet-worker` | App (same Dockerfile) | Override start command: `node dist/worker.js`; no public domain |

## Web service

> ⚠️ The production `Dockerfile` lives at **`docker/Dockerfile`** (not the repo root).
> In Coolify's service settings you **must** set the Dockerfile path explicitly,
> otherwise deployment fails with `failed to read dockerfile: open Dockerfile: no such file or directory`.

**Build configuration in Coolify:**

| Setting | Value |
|---|---|
| Build Pack | `Dockerfile` |
| **Dockerfile Location** | **`docker/Dockerfile`** ← required, do not leave blank |
| **Build Context / Base Directory** | **`.`** (repo root) ← **required**, do not leave blank |

> ⚠️ Coolify's default Build Context is the **parent directory of the Dockerfile**
> (i.e. `docker/`). If left blank, the build will fail with errors like
> `"/apps/web/package.json": not found` because the context only contains the
> `Dockerfile` itself, not your source. Always set **Build Context = `.`**.

- **Domain:** `intranet.<your-domain>` (Coolify/Traefik handles TLS)
- **Healthcheck:** `GET /api/health`
- **Port:** 3000

## Environment variables (both services)

```
APP_BASE_URL=https://intranet.<your-domain>
DATABASE_URL=postgres://...   # internal Coolify postgres URL
AUTH_SECRET=                  # openssl rand -base64 32
AUTH_TRUST_HOST=true
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0
ENTRA_TENANT_ID=
DAEMON_CLIENT_ID=
DAEMON_CLIENT_SECRET=
MAIL_TRANSPORT=graph
GRAPH_SENDER_UPN=intranet@<your-domain>
S3_ENDPOINT=http://minio:9000   # internal service URL
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET_ATTACHMENTS=attachments
S3_BUCKET_PHOTOS=photos
S3_FORCE_PATH_STYLE=true
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

## Migrations

Run automatically by the web container entrypoint (`docker/entrypoint.sh`) before the
server starts. Drizzle's migrator takes a Postgres advisory lock, so restarts and
multiple replicas are safe.

## SSE

The app sends `X-Accel-Buffering: no` on event streams; Traefik defaults work as-is.

# 🚀 IntelliHire Free Cloud Deployment Guide

This guide walks you through deploying **IntelliHire** to the cloud **100% free of charge**, with zero server costs, automated database migrations, and production SSL/HTTPS. For a hardened self-hosted production deployment (private Postgres/Redis/MinIO/Judge0 behind your own TLS proxy), jump to **[Production (self-hosted compose)](#-production-self-hosted-compose)**.

---

## 🌟 Architecture of the Free Stack

| Component | Free Provider | Plan | Cost |
| :--- | :--- | :--- | :--- |
| **Full Stack App (Frontend + Backend)** | [Render](https://render.com) | Free Web Service (Docker) | **$0 / month** |
| **PostgreSQL Database** | [Neon.tech](https://neon.tech) | Serverless Free Tier (0.5 GB) | **$0 / month (Free Forever)** |
| **AI Question & Interview Engine** | [Groq Cloud](https://console.groq.com) | Free Tier (Llama 3.3 70B) | **$0 / month** |
| **Continuous Integration (CI)** | GitHub Actions | 2,000 min/mo (Private) / Unlimited (Public) | **$0 / month** |

---

## ⚡ Option 1: 1-Click Deployment via Render + Neon (Recommended)

### Step 1: Create a Free PostgreSQL Database on Neon (1 minute)

1. Go to **[Neon.tech](https://neon.tech)** and sign up for free (using GitHub or Google).
2. Click **Create Project**, name it `intellihire`, and click **Create**.
3. Under **Connection Details**, select **PostgreSQL** and copy the connection string. It looks like:
   ```text
   postgresql://<user>:<password>@<endpoint>.neon.tech/intellihire?sslmode=require
   ```

---

### Step 2: Deploy to Render via Blueprint

IntelliHire includes a pre-configured [`render.yaml`](./render.yaml) file for automated zero-config deployment.

1. Sign up for free at **[Render.com](https://render.com)** using your GitHub account.
2. In the Render Dashboard, click **New +** in the top-right corner and select **Blueprint**.
3. Connect your **`intellihire`** GitHub repository.
4. Render will automatically read [`render.yaml`](./render.yaml) and configure:
   * **Service Type**: Docker Web Service
   * **Instance Type**: Free
   * **Health Check**: `/api/health`
   * **Environment Variables**:
     * `NODE_ENV`: `production`
     * `PYTHONPATH`: `server_py`
     * `JWT_SECRET`: *(Automatically generated secure 32-character key)*
5. Under `DATABASE_URL`, paste the connection string you copied from Neon in Step 1.
6. *(Optional)* Under `GROQ_API_KEY`, enter your free API key from [console.groq.com](https://console.groq.com) if you want AI interview generation enabled.
7. Click **Apply**.

Render will now build the Docker image (compiling the React Vite SPA and setting up the Python FastAPI backend) and start the service.

---

### Step 3: Automated Database Migrations & Verification

Before the web service starts, run only the numbered production schema migrations against your Neon database. Development fixtures, test-user cleanup scripts, and question-bank seed data are intentionally excluded from automatic production startup. Apply seed data separately only in a non-production environment.

Production must also provide:

* `APP_URL` set to the final HTTPS application URL;
* `CORS_ALLOWED_ORIGINS` containing only explicit HTTPS browser origins;
* a unique random `JWT_SECRET` of at least 32 characters;
* a private Judge0 endpoint if code execution is enabled;
* configured SMTP credentials if notifications are enabled.

Once Render shows **`Live`**, click your assigned URL (e.g., `https://intellihire-xxxx.onrender.com`).

---

## 🔑 Initial administrator access

Do not deploy or document shared default credentials. Create the first administrator through a one-time, controlled provisioning process, require an immediate password change, and enable MFA before granting production access. The development-only seed fixtures must never be applied to a production database.

---

## 🌐 Option 2: Alternative Free Cloud Hosts

If you prefer an alternative to Render:

### Deploying to Koyeb (Free Nano Instance)
1. Sign up at **[Koyeb.com](https://www.koyeb.com)**.
2. Click **Create App** ➔ **GitHub**.
3. Select the `intellihire` repository.
4. Set **Builder** to **Dockerfile**.
5. Under **Environment Variables**, add:
   * `DATABASE_URL`: *(Your Neon PostgreSQL connection string)*
   * `JWT_SECRET`: *(A random 32+ character string)*
   * `NODE_ENV`: `production`
   * `PYTHONPATH`: `server_py`
6. Click **Deploy**.

---

## 🏭 Production (self-hosted compose)

For a real production deployment on a host you control, use [`docker-compose.prod.yml`](./docker-compose.prod.yml): a hardened stack with an internal-only data tier, no public database ports, read-only app filesystem, and all secrets injected from a git-ignored env file.

### Prerequisites

1. A Linux host with **Docker Engine 24+** and the **Compose v2 plugin** (`docker compose version`).
2. A **reverse proxy on the host** (nginx, Caddy or Traefik) that terminates TLS for your domain and forwards to `http://127.0.0.1:5000`. The compose stack publishes *only* that loopback port — it never serves plaintext to the internet. `APP_URL` / `CORS_ALLOWED_ORIGINS` are validated to be `https://` by `app/config.py` in production mode.
3. DNS pointing at the host, and (recommended) outbound mail credentials if you want notification emails.

### Network policy (what talks to what)

| Network | Internet egress | Members |
| :--- | :--- | :--- |
| `frontend` | yes | app only (Groq, SMTP, Sentry) |
| `backend` | **none** (`internal: true`) | app, postgres, redis, minio |
| `judge0-isolated` | **none** (`internal: true`) | app, judge0 server + workers + their private postgres/redis |

Postgres, Redis and MinIO have **no published ports at all** — they are reachable only inside `backend`. Untrusted user-submitted code runs inside judge0 on `judge0-isolated`, which has no route to the internet or to the data tier.

### Secrets setup

1. `cp .env.production.example .env.production` — the file is git-ignored (`.env.*` in [.gitignore](./.gitignore)); never commit it.
2. **Regenerate every placeholder secret** (`python -c "import secrets; print(secrets.token_urlsafe(48))"`): `JWT_SECRET`, `METRICS_TOKEN`, `INTERNAL_API_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, `MINIO_APP_ACCESS_KEY`/`MINIO_APP_SECRET_KEY`, and the `JUDGE0_*` passwords if code execution is enabled.
3. Set `APP_URL=https://app.example.com` and `CORS_ALLOWED_ORIGINS=https://app.example.com` (explicit HTTPS origins, comma-separated, no wildcard).
4. Optional integrations: `SENTRY_DSN`, `GROQ_API_KEY`, `SMTP_*`, `JUDGE0_API_URL`/`JUDGE0_API_KEY`.

Every `${VAR:?...}` in the compose file is a required variable — if something is missing, `docker compose` refuses to start and names it.

### Starting the stack

```bash
# Base stack (app + postgres + redis + minio + bucket init):
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# With private self-hosted Judge0 (code execution):
docker compose --env-file .env.production -f docker-compose.prod.yml --profile judge0 up -d
```

Notes:

* **Judge0** runs under the `judge0` compose **profile** because its `isolate` sandbox needs privileged containers. Those services sit only on the isolated network. If you prefer to run the [official judge0 compose stack](https://github.com/judge0/judge0/blob/master/docker-compose.yml) instead, deploy it separately, attach its containers to the `intellihire-prod_judge0-isolated` network, and point `JUDGE0_API_URL` at it. In production the app refuses the public `ce.judge0.com` endpoint.
* **MinIO registry**: community MinIO images left Docker Hub (Oct 2025). The compose file pins the last free release on quay.io; if your environment can't pull it, override `MINIO_IMAGE` in `.env.production` (e.g. `cgr.dev/chainguard/minio`) — the app only needs an S3-compatible endpoint.
* The `minio-init` one-shot service creates the bucket, keeps it private (no anonymous access) and provisions the least-privilege app user — the app never uses MinIO root credentials.
* The app container runs **non-root** with a **read-only root filesystem**: writes go to `/tmp` (tmpfs) and `/app/uploads` (named volume) only.
* **Upgrades**: bump `image: intellihire/app:<version>`, rebuild, then re-run `up -d`; data lives in named volumes (`postgres_data`, `redis_data`, `minio_data`, `app_uploads`).

### Database migration behavior

Migrations run automatically at app startup (`app/migration_runner.py`): every `database/*.sql` file is applied in order and tracked in a `schema_migrations` table. Development fixtures (`09_seed_data.sql`, `20_cleanup_test_users.sql`) are excluded. Two properties to know:

* **Per-worker execution**: the app runs gunicorn with 2 workers and the FastAPI lifespan hook runs in each worker, so the migration runner executes once per worker. This is safe — concurrent runners serialize on a PostgreSQL advisory lock and re-application is idempotent (already-applied files are skipped) — but it does mean migration work happens on every worker start, not once per deployment. Plan for the (usually short) startup serialization window.
* **Fail-fast**: in production a migration failure aborts startup (`app/main.py` re-raises in `NODE_ENV=production`), so a bad migration cannot leave the service running against an unexpected schema.

### Backup & restore

The repo provides [`scripts/backup_db.sh`](./scripts/backup_db.sh) (timestamped **custom-format** `pg_dump` into `dumps/`, plus a tarball of local uploads), [`scripts/restore_db.sh`](./scripts/restore_db.sh) (drops/recreates a target database and `pg_restore`s a dump — it refuses the live `intellihire` database unless you pass `FORCE=1`), and `scripts/drill_backup_restore.sh` (full round-trip drill). Both scripts target a host-reachable PostgreSQL via `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`.

Because the production Postgres in this stack has **no published port**, take backups from inside the container:

```bash
mkdir -p dumps
# Logical backup (custom format) straight out of the postgres container:
docker exec intellihire-postgres pg_dump -U intellihire -Fc -d intellihire \
  > dumps/intellihire_$(date +%Y%m%d_%H%M%S).dump

# Restore drill — into a scratch database on a host-reachable postgres (never
# the live one), e.g. a temporary postgres with the dump piped in:
docker exec -i intellihire-postgres psql -U intellihire -d postgres \
  -c "CREATE DATABASE intellihire_drill"
docker exec -i intellihire-postgres pg_restore -U intellihire \
  -d intellihire_drill --exit-on-error --no-owner < dumps/<file>.dump
docker exec intellihire-postgres psql -U intellihire -d postgres \
  -c "DROP DATABASE intellihire_drill"
# (scripts/restore_db.sh works unchanged against any host-reachable postgres
#  for staging/drill databases.)
```

Back up the file-bearing volumes too — `app_uploads` (candidate resumes/offer letters) and `minio_data` (object storage) — with your volume/snapshot tooling, or `docker run --rm -v intellihire-prod_app_uploads:/data -v $PWD/dumps:/backup alpine tar czf /backup/app_uploads.tar.gz /data`.

### Metrics (Prometheus) & Sentry wiring

* **Metrics**: `GET /metrics` is exposed by `prometheus-fastapi-instrumentator` and guarded by `app/middleware/metrics_guard.py`. In production it **503s unless `METRICS_TOKEN` is set**, and every scrape must send `Authorization: Bearer <METRICS_TOKEN>`. Point your Prometheus `scrape_configs` at `https://<your-domain>/metrics` with that header (scrape through the reverse proxy), or scrape `http://127.0.0.1:5000/metrics` directly on the host.
* **Sentry**: set `SENTRY_DSN` and the app initializes Sentry with `environment=production` at startup (`app/sentry_integration.py`). ⚠️ Gap to be aware of: `sentry-sdk` is **not currently in `server_py/requirements.txt`** — with the pinned dependency set, `init_sentry` logs a warning and stays disabled. Adding the dependency is a separate, deliberate change; until then `SENTRY_DSN` is inert.
* **Health**: the Docker healthcheck hits `/api/health`, which returns `503` while Postgres is unreachable and reports degraded (not unhealthy) when optional services (Groq, SMTP, Judge0, pipeline) are unconfigured.

---

## 🔍 Diagnostics & Health Check

You can verify the health of your deployed instance at any time by visiting:
```text
https://<your-app-url>/api/health
```

Expected JSON response:
```json
{
  "status": "ok",
  "timestamp": "2026-09-06T12:00:00.000000Z",
  "environment": "production",
  "services": {
    "postgres": true,
    "groq": true,
    "judge0": { "endpoint": "https://judge0-ce.p.rapidapi.com", "isPrivate": false },
    "email": false,
    "sentry": false,
    "pipeline": {
      "totalMcq": 780,
      "totalCoding": 24,
      "healthy": true
    }
  }
}
```

---

## 💡 Free Tier Tips & Best Practices

1. **Render Free Tier Spin-Down**:
   * Render free web services go to sleep after 15 minutes of inactivity.
   * When a new request arrives, it wakes back up in ~30 seconds.
   * *Tip*: You can keep it warm using a free uptime monitor like [UptimeRobot](https://uptimerobot.com) pinging `/api/health` every 10 minutes.
2. **Neon Free PostgreSQL**:
   * Neon does not delete your database or expire after 30/90 days (unlike Render's free DB).
   * It pauses storage when inactive and wakes instantly (sub-second cold start).

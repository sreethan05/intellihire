# Alerting & Monitoring Guide

Operational wiring for the IntelliHire backend. Everything here references the
metrics, routes and log messages that actually exist in this codebase — see the
gap list at the end for what is *not* instrumented yet.

---

## 1. What the backend exports

The FastAPI app (`server_py/app/main.py`) exposes Prometheus metrics at
`GET /metrics` using `prometheus-fastapi-instrumentator` 8.1.0 with all-default
settings:

```python
Instrumentator().instrument(app).expose(app)
```

With defaults, the middleware falls back to the library's `metrics.default`
bundle, so the exact metric families on `/metrics` are:

| Metric | Type | Labels |
| --- | --- | --- |
| `http_requests_total` | Counter | `method`, `status`, `handler` |
| `http_request_size_bytes` | Summary | `handler` |
| `http_response_size_bytes` | Summary | `handler` |
| `http_request_duration_highr_seconds` | Histogram | *(none)* — buckets 0.01s … 60s +Inf; use for quantiles |
| `http_request_duration_seconds` | Histogram | `method`, `handler` — buckets 0.1 / 0.5 / 1 +Inf |

Plus the standard `prometheus_client` process metrics
(`process_cpu_seconds_total`, `process_resident_memory_bytes`, Python GC
metrics, etc.).

Notes:

- `status` values are **grouped** into `2xx`, `3xx`, `4xx`, `5xx`
  (`should_group_status_codes=True` is the default).
- `handler` is the route template (e.g. `/api/auth/login`). Unmatched paths
  group to `none`.
- There is **no** `http_requests_inprogress` gauge (default `should_instrument_requests_inprogress=False`).
- There are **no** custom application metrics: no queue-depth gauge, no
  auth-failure counter, no DB/Redis health gauge.

### /metrics authentication (`MetricsGuardMiddleware`)

`server_py/app/middleware/metrics_guard.py` gates only the `/metrics` path and
is added **last** (so it runs first, before rate limiting, CSRF, audit logging
and header injection):

- `NODE_ENV=production` and `METRICS_TOKEN` unset → every request to `/metrics`
  returns **503** (`"Metrics are not configured"`). Production defaults to deny.
- `METRICS_TOKEN` set → every scrape must send the header
  `Authorization: Bearer <METRICS_TOKEN>` (constant-time compare); anything
  else returns **401**.
- Dev/test with no token → `/metrics` stays open for local tooling.

---

## 2. Prometheus wiring

`observability/prometheus.yml` and `observability/alert_rules.yml` are ready to
mount. The scrape job sends the bearer header the guard expects:

```yaml
scrape_configs:
  - job_name: intellihire-app
    metrics_path: /metrics
    scheme: http
    authorization:
      type: Bearer
      credentials: REPLACE_WITH_METRICS_TOKEN   # must equal the app's METRICS_TOKEN
    static_configs:
      - targets: ["app:5000"]                   # compose service `app` on the backend network; 127.0.0.1:5000 from the host
```

Run Prometheus next to the stack (compose override or standalone container):

```yaml
# docker-compose.observability.yml (compose override — do not modify
# docker-compose.prod.yml; join the backend network to reach the app)
services:
  prometheus:
    image: prom/prometheus:v3.2.1
    container_name: intellihire-prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=15d
    environment:
      METRICS_TOKEN: ${METRICS_TOKEN}
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./observability/alert_rules.yml:/etc/prometheus/alert_rules.yml:ro
      - prometheus_data:/prometheus
    networks:
      - backend
    restart: unless-stopped

volumes:
  prometheus_data:
```

Because `prometheus.yml` is read before the shell expands env vars, either
substitute `REPLACE_WITH_METRICS_TOKEN` at deploy time (e.g.
`envsubst < observability/prometheus.yml | docker compose ...`) or use a
`web.config.yml`/secret file. The token value never leaves the config file.

Optional exporter jobs (postgres_exporter on `:9187`, redis_exporter on
`:9121`) are pre-written but commented out in `prometheus.yml` — they are not
deployed yet. If enabled, keep them on the `backend` network with no published
ports, matching the stack's security posture.

Rule evaluation: `rule_files: [/etc/prometheus/alert_rules.yml]` with
`evaluation_interval: 15s`. All rules use the metric names listed in section 1;
rules for metrics that do not exist yet (queue depth, Redis health) are
included as commented TODO blocks that name the metric to add.

---

## 3. Grafana provisioning

Provision the datasource and the dashboard from `observability/`:

```yaml
# /etc/grafana/provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

```yaml
# /etc/grafana/provisioning/dashboards/intellihire.yml
apiVersion: 1
providers:
  - name: intellihire
    orgId: 1
    folder: IntelliHire
    type: file
    disableDeletion: false
    updateIntervalSeconds: 60
    options:
      path: /var/lib/grafana/dashboards
```

```yaml
# compose override addition
  grafana:
    image: grafana/grafana:11.5.2
    container_name: intellihire-grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./observability/grafana-dashboard.json:/var/lib/grafana/dashboards/intellihire-overview.json:ro
      - ./observability/grafana/provisioning:/etc/grafana/provisioning:ro
    networks:
      - backend
    restart: unless-stopped
```

The dashboard (`observability/grafana-dashboard.json`, schema version 39) is
bound to the real metric names and uses a `DS_PROMETHEUS` datasource variable,
so it binds to any Prometheus datasource. Panels: app up, 5xx ratio, request
rate by status class, p50/p95/p99 latency, 5xx rps, login-failure proxy,
`/api/health` 503s, top handlers, and a text panel documenting the missing
queue-depth metric.

---

## 4. Sentry alerts (configure in the Sentry UI)

Sentry is initialised in `server_py/app/sentry_integration.py` when `SENTRY_DSN`
is set: `environment=NODE_ENV`, `traces_sample_rate=0.1` in production (1.0 in
dev). Create the following **Alert Rules** in the Sentry project
`[COMPANY-sentry-project]` (Issues + Alert Rules UI; there is no
Sentry-as-code config in this repo):

1. **Unhandled server errors (baseline)**
   New issue, all error-level events. The SDK's default `LoggingIntegration`
   captures `logger.error(...)` records as events in addition to unhandled
   exceptions, so both crash-level and logged-error signals flow in.
   Notification: on-call email + Slack `[COMPANY-slack-channel]`.

2. **Failed migrations** — key the rule on the exact messages emitted by
   `server_py/app/migration_runner.py` (both go through `logger.error`, so they
   become Sentry events; in production a failed migration also **crashes
   startup** because the exception is re-raised in `main.py` lifespan):
   - message contains `Failed to apply migration` (per-file SQL failure, line
     88: `f"Failed to apply migration {filename}: {e}"`)
   - message contains `Migration runner encountered database connection failure`
     (line 95)
   Priority: high. If this fires, the release did not come up — go straight to
   the DB failure playbook (docs/INCIDENT_RESPONSE.md#db-failure).

3. **Data-retention worker failure** — message contains
   `Data retention cleanup failed` (`server_py/app/data_retention.py` line 21).
   Low urgency (worker retries every `DATA_RETENTION_INTERVAL_HOURS`, default
   24h), but do not let it fail silently: the retention promises in
   docs/RETENTION_SCHEDULE.md depend on it.

4. **Storage failures** — the S3/MinIO client logs
   `MinIO storage initialization failed: {err}` at startup
   (`server_py/app/storage.py`, warning level — warnings are *not* Sentry
   events by default, so also watch the runtime symptoms): any error-level
   event from the `/api/assets/` routes or a spike of 5xx on the resume/offer
   download paths (visible in Grafana as 5xx grouped by `handler`). If a
   dedicated `intellihire_storage_errors_total` counter is added later, move
   this to Prometheus.

5. **Slow endpoints (performance)** — Sentry Performance is on
   (`traces_sample_rate=0.1` in production). In Performance → create an
   Alert: endpoint p95 duration threshold **> 1s over 1h**, matching the
   proposed Prometheus SLO in `observability/alert_rules.yml`
   (`IntelliHireLatencySLOBreachP95`). Exclude `/metrics` and the SPA
   catch-all from the rule scope.

Also set the Sentry **environment** filter to `production` for paging rules and
keep dev noise separate (`NODE_ENV` is passed as the Sentry environment).

---

## 5. Uptime monitoring (external)

Use an external checker (UptimeRobot / Pingdom / Better Uptime — pick one,
`[COMPANY]`) so outages are detected even when the whole host is unreachable.

**Primary check:** `GET https://[COMPANY-domain]/api/health` every **60s**.

Real behavior of that endpoint (`server_py/app/main.py` `health_check`):

- **200** with `status: healthy|degraded` — Postgres reachable; `degraded`
  lists configured-but-absent optional services (`groq`, `email`, `pipeline`).
- **503** with `status: unhealthy` — the live query against `users` failed;
  orchestrators/LBs are expected to stop routing. Treat any 503 as page-worthy.

Configure the checker to assert **status < 500** (or == 200) so a 503 pages;
a plain "port open" TCP check is not sufficient.

**Critical-flows checklist** — run after every deploy and include in the
monthly check (paths verified against the routers):

| # | Flow | Request | Expect |
| --- | --- | --- | --- |
| 1 | Login | `POST /api/auth/login` (JSON `email`, `password`) | 200 + `csrfToken` for valid creds; **401** `INVALID_CREDENTIALS` for bad ones. Rate limit is **5/minute** — use a dedicated monitor account, never probe real users |
| 2 | Certificate verify page | `GET /certificates/verify/<id>` (frontend SPA route, `client/src/pages/PublicCertificateVerify.tsx`) | 200 + rendered page. NOTE: the page currently renders a simulated payload client-side and does not call a verification API yet — this check validates SPA serving, not backend verification (backend verification is a TODO) |
| 3 | Public portfolio | `GET /portfolio/<slug>` (SPA) which fetches `GET /api/candidate/portfolio/<slug>` (`client/src/pages/PublicPortfolio.tsx`) | 200 with profile JSON for a seeded slug; 404 for unknown slug |
| 4 | Metrics guard (security, not uptime) | `GET /metrics` **without** token from outside | 401 (or 503 if token unset) — proves the guard is still mounted |

---

## 6. Gaps — metrics that must be added

| Missing metric | Needed for | Where it would live | Tracking |
| --- | --- | --- | --- |
| Queue depth gauge (proposed `intellihire_queue_depth{queue=...}`) | Backlog alerting for `grading-queue` / `interview-queue` / `grading-dlq` / `interview-dlq` (Redis lists in `server_py/app/queue_manager.py`) + the local `grading_queue.json` fallback | `queue_manager.py` worker loop (LLEN per list) | commented TODO rule in `alert_rules.yml`; text panel in the dashboard |
| Auth-failure counter (proposed `intellihire_auth_failures_total{reason=...}`) | Separating 401 invalid-credentials from 429 rate-limited on `POST /api/auth/login` | `auth_router.py` login handler | proxy rule `IntelliHireAuthFailureSpike` uses the 4xx bucket meanwhile |
| Redis health gauge (proposed `intellihire_redis_up`) | Direct Redis availability signal | `queue_manager.init_queue` preflight ping | commented TODO rule; interim: redis_exporter job |
| DB health gauge (proposed `intellihire_db_up`) | Direct Postgres signal without app round-trip | `health_check` in `main.py` | interim: `IntelliHireHealthEndpointFailing` (health 503s) + optional postgres_exporter job |

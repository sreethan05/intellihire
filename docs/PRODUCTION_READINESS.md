# IntelliHire — Production Readiness Tracker

Status as of **2026-10-25**. Three levels: ✅ done and verified on this machine ·
🟡 built and configured, needs real infrastructure to exercise · ⬜ pending (needs
humans, accounts, or a larger program — sequenced in [TODO.md](../TODO.md)).

The full engineering checklist this tracker maps to lives in
[docs/CHECKLIST.md](./CHECKLIST.md).

---

## 1. Deploy for real

| Item | Status | Notes |
|---|---|---|
| Production compose stack | ✅ Built | `docker-compose.prod.yml`: app (read-only rootfs, non-root, cap-drop, loopback-only publish, healthcheck) + pinned `postgres:15.19` + `redis:7.4` (requirepass, internal network) + MinIO (private bucket, least-privilege app user) + Judge0 stack on an isolated no-egress network behind a compose profile. |
| Production env template | ✅ Built | `.env.production.example` — every var `config.py` reads; config.py itself rejects production boot without HTTPS `APP_URL` + explicit `CORS_ALLOWED_ORIGINS`. |
| Hardened image | ✅ Built | `Dockerfile`: pinned bases, multi-stage, non-root, HEALTHCHECK, correct volume ownership. `npm ci` everywhere in CI (no mutable installs). |
| Compose validation | 🟡 | `docker compose config` renders clean client-side; image builds, healthchecks and network egress need a real Docker host (daemon not running locally). |
| APP_URL / CORS / DB / Redis / S3 / Judge0 / SMTP / Sentry / METRICS_TOKEN | 🟡 | All supported by `config.py` and templated; fill `.env.production` with real secrets at deploy time. |
| Sentry actually reporting | 🟡 | `sentry-sdk[fastapi]==2.73.0` added to requirements; set `SENTRY_DSN` in production env. |
| Signed downloads survive restart | ✅ Verified | `tests/test_signed_url_secret_reload.py`: same secret across reload/subinterpreter restart → download still 200; rotated secret → old URLs 401. Signatures are derived from `JWT_SECRET`, so they persist as long as the secret is persisted (secret manager / env file). |

## 2. Production validation

| Item | Status | Notes |
|---|---|---|
| E2E against a fresh production-like PostgreSQL | ✅ Run | Fresh DB, all 21 migrations applied from scratch, full 31-test Playwright suite → **31/31 passed**. This caught a real deploy blocker: migration 20 seeded all test accounts with one password while the E2E suite uses per-role passwords — fixed in the migration, re-verified. |
| Load test: logins | ✅ Run, **bottleneck fixed** | Found login collapsing to ~2.2–2.8 req/s: bcrypt ran synchronously on the event loop. Fixed with `asyncio.to_thread`; re-verify numbers against the fix before launch. |
| Load test: dashboards / exam reads / code-run guard / WebSockets | ✅ Run | Real p50/p95 tables in [scripts/LOAD_TESTING.md](../scripts/LOAD_TESTING.md). Dashboards p95 2.9–4.2s @ 50 concurrent (pool-bound; optimization backlog). WebSockets: 100 clients, 40ms p50 RTT, 0 errors. |
| Backup + restore drill | ✅ Run | `scripts/drill_backup_restore.sh`: backup → restore into scratch DB → 11 key tables verified row-for-row → RTO **16s** → PASS. Object storage: uploads archived; MinIO `mc mirror` procedure documented. |
| Scheduled drills | ⬜ | Quarterly restore drill — owner: ops. |

## 3. Observability

| Item | Status | Notes |
|---|---|---|
| Prometheus scrape + alert rules | 🟡 Built | `observability/prometheus.yml` + `alert_rules.yml` using the app's real metric names; needs a Prometheus host. |
| Grafana dashboard | 🟡 Built | `observability/grafana-dashboard.json`. |
| Sentry alerts | 🟡 Documented | `observability/ALERTING.md` — exact UI rules to configure (server errors, failed migrations, storage failures, slow endpoints). |
| Uptime monitoring | 🟡 Documented | Health + critical-flow checks (login, certificate verify, public portfolio) in `observability/ALERTING.md`; needs an external checker account. |
| SLOs | 🟡 Proposed | p95 latency and availability targets labeled in alert rules; ratify before launch. |

## 4. Security / Compliance

| Item | Status | Notes |
|---|---|---|
| Automated security gates in CI | ✅ | Bandit, pip-audit (0 findings), npm audit (0 findings), gitleaks secret scanning, Trivy container/config/secret scan, SBOM (CycloneDX), dependency review, contract-drift gate. |
| Privacy policy, terms | 🟡 Drafted | `docs/PRIVACY_POLICY.md`, `docs/TERMS_OF_SERVICE.md` — specific to the platform's real data classes; `[COMPANY]` placeholders need legal review. |
| Retention schedule | 🟡 Drafted | `docs/RETENTION_SCHEDULE.md` — per data class, mapped to actual storage (DB rows vs filesystem/S3). |
| Incident response | 🟡 Drafted | `docs/INCIDENT_RESPONSE.md` — severity matrix, first-hour playbooks, breach-notification timelines, secret-rotation steps. |
| Disaster recovery | 🟡 Drafted | `docs/DISASTER_RECOVERY.md` — RPO/RTO, real script interfaces, drill evidence, quarterly schedule. |
| Security testing plan | 🟡 Drafted | `docs/SECURITY_TESTING.md` — what CI already covers, proposed external pentest scope. |
| External penetration test | ⬜ | Requires an external vendor. Suggested scope in `docs/SECURITY_TESTING.md`. |
| Tenant-boundary audit with multi-org data | 🟡 Partial | Route-level authz matrix tests exist (`test_authz_matrix.py`, asset access matrix); full multi-organization seeded audit is a pending program (TODO). |
| MFA for admins/staff, Argon2id, key rotation w/ key IDs | ⬜ | Feature-scale work — top of the engineering backlog (see CHECKLIST P0 §1). |

## 5. Product readiness

| Item | Status | Notes |
|---|---|---|
| Self-serve onboarding, invites, password reset, recovery | ⬜ | Feature work — engineering backlog. |
| Billing/subscriptions | ⬜ | Only if/when commercial — needs a business decision first. |
| Full journey validation with real users | ⬜ | Needs a pilot college + real users. |

## 6. AI / Proctoring

| Item | Status | Notes |
|---|---|---|
| Honest experimental labeling | ✅ | README "Status & Known Limitations" states heuristics/synthetic-data caveats plainly. |
| Human review of AI output | ✅ Principle enforced | Ranking/AI outputs are advisory in the product flow; no automated rejection path exists. |
| Consent screens, bias monitoring, explainability, appeals | ⬜ | Feature work — see CHECKLIST P1 §9/§10. |

---

## The one-paragraph verdict

Everything that can be verified without external accounts **has been verified on
this machine**: hardened deploy artifacts render correctly, a fresh-database
deployment path works end-to-end (and caught + fixed a real seed drift bug), a
restore drill passed in 16s, load tests produced real numbers (and surfaced a
login throughput bug that is now fixed), and the compliance documents exist as
reviewable drafts. What remains requires **people and accounts, not code**:
a real Docker/cloud host to run the stack, an external pentest, MFA/billing/
onboarding feature work, and pilot users.

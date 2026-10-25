# Incident Response

Applies to the IntelliHire platform (`server_py` FastAPI backend, PostgreSQL,
Redis, MinIO/S3, Judge0, Groq). Monitoring entry points:
`observability/ALERTING.md`, dashboard `observability/grafana-dashboard.json`,
Prometheus rules `observability/alert_rules.yml`, Sentry project
`[COMPANY-sentry-project]`.

Owner: [COMPANY] · Last reviewed: 2026-10-25 · Review cadence: quarterly.

---

## Severity matrix

| Severity | Definition | Examples (real failure modes in this stack) | Response | Comms |
| --- | --- | --- | --- | --- |
| **SEV1 — Critical** | Core function down or data at risk; no workaround | Postgres unreachable (`GET /api/health` returns 503); app cannot start (failed migration re-raised in `main.py` lifespan); confirmed data breach | Page on-call immediately, 24/7. Engage incident commander | Status page + affected users within breach-notification timelines (below) |
| **SEV2 — High** | Major degradation, workaround exists | Redis down (grading falls back to local `grading_queue.json`; rate limiter degrades); Judge0 outage (coding results stall in `grading-queue`); uploads volume failure (resume/offer downloads fail) | Acknowledge ≤ 30 min during business hours, ≤ 1 h on-call otherwise | Internal channel + status page if user-visible |
| **SEV3 — Medium** | Partial/non-critical impairment | Groq outage (AI interview evaluation and report generation fail; exams unaffected); elevated 5xx rate > 1%; p95 latency SLO breach (proposed: p95 < 1s) | Acknowledge ≤ 4 h business hours | Internal ticket |
| **SEV4 — Low** | Cosmetic/minor, no user impact | Single non-repeating 5xx; `Data retention cleanup failed` (worker retries every `DATA_RETENTION_INTERVAL_HOURS`, default 24h) | Fix in normal flow | Ticket |

Escalation path: on-call engineer → [COMPANY] engineering lead → [COMPANY]
CTO/DPO. Security incidents skip straight to SEV1 and add the security-breach
playbook.

---

## On-call expectations

- Rotation of [COMPANY-N] engineers, one primary + one secondary, weekly handover.
- Primary must be able to: SSH to the production host, read
  `docker compose -f docker-compose.prod.yml ps` and `logs app`, run the DR
  scripts in `scripts/`, and rotate secrets.
- Acknowledgement targets follow the severity matrix above.
- Every SEV1/SEV2 gets a written postmortem within 5 business days: timeline,
  root cause, detection gap, action items with owners.
- Before going off-rotation: confirm no open SEV1/SEV2 and that the backup
  drill (docs/DISASTER_RECOVERY.md) is green for the current quarter.

---

## First-hour playbook

Common first steps for any SEV1/SEV2:

1. Verify what the monitors see: Grafana "IntelliHire / Overview" and
   `curl -H "Authorization: Bearer $METRICS_TOKEN" http://<app>:5000/metrics`.
2. Check `GET /api/health` — it reports `postgres`, `groq` (config only),
   `judge0` (endpoint + private/public), `email` (SMTP config), `sentry`,
   `pipeline` (question-bank counts) and returns **503** when Postgres is
   unreachable.
3. `docker compose -f docker-compose.prod.yml ps` — containers: `app`,
   `postgres`, `redis`, `minio`, `judge0-server`, `judge0-worker`.
4. `docker compose -f docker-compose.prod.yml logs --tail 200 app`.
5. Open a timeline document; log every action with UTC timestamps.
6. Decide: mitigate first (restart, failover, roll back), diagnose second —
   except for suspected breaches, where evidence preservation comes first.

### Database failure

Symptom: `IntelliHireHealthEndpointFiring` alert; `/api/health` → 503
`status: unhealthy`; in production the app keeps running but every DB-backed
route fails (5xx ratio alert fires).

1. Confirm scope: `docker exec intellihire-postgres pg_isready`.
2. If the container is down: `docker compose -f docker-compose.prod.yml up -d postgres`,
   then check `postgres_data` volume intact.
3. If the volume is lost or data corrupted → **restore**: follow
   docs/DISASTER_RECOVERY.md#restore-procedure (`scripts/restore_db.sh`).
   RPO is 24 h (nightly `backup_db.sh`); warn leadership that submissions
   since the last dump are at risk.
4. Recovery signal: `/api/health` returns 200 and
   `http_requests_total{handler="/api/health",status="5xx"}` rate drops to 0.
5. Note: migrations run at app startup (`run_migrations`, tracked in
   `schema_migrations`). Do **not** point the app at an older restored dump
   without re-running migrations — the runner is idempotent and will apply
   whatever the dump is missing.

### Storage failure

Symptom: resume/offer downloads fail (routes under `GET /api/assets/files/...`
return 404/500); `DELETE /api/candidate/resume` logs
`candidate_profile.resume_file_delete_failed`.

1. Files live on the `app_uploads` named volume mounted at `FILE_STORAGE_DIR`
   (default `uploads/`, subdirs `resumes/`, `offers/`); DB stores only the
   `/uploads/...` pointer (`candidate_profiles.resume_url`,
   `candidate_status.offer_letter_url`).
2. Check the volume: `docker compose ... exec app ls -la uploads/resumes | head`.
3. If the volume is damaged: restore from the uploads tarball produced by
   `scripts/backup_db.sh` (it archives `server_py/uploads` next to the DB
   dump) — see docs/DISASTER_RECOVERY.md.
4. If MinIO was introduced for a workload, check the `minio` container and the
   `intellihire-uploads` bucket (`mc stat`); the boto3 client logs
   `MinIO storage initialization failed: {err}` at startup on failure.

### Judge0 outage

Symptom: coding submissions stay `pending`; grading workers log
`Test case execution failed: ...`; after 3 retries attempts are dead-lettered
to the `grading-dlq` Redis list (and `interview-dlq` for AI-interview jobs).

1. Check the private Judge0 stack: `docker compose ... ps judge0-server judge0-worker`
   (backend-network address `http://judge0-server:2358`; the public fallback
   `https://ce.judge0.com` is the config default and must not be used in
   production).
2. Check queue backlog: `redis-cli LLEN grading-queue`, `LLEN grading-dlq`
   (no Prometheus gauge exists yet — manual check until
   `intellihire_queue_depth` is added).
3. If Judge0 is up but slow, the backlog drains on its own (workers poll every
   1s with 3 retries). If it is down, fix Judge0 first; there is no second
   execution backend.
4. After recovery, `grading-dlq` items do **not** auto-retry — replay them
   manually by re-pushing the `attemptId` payloads to `grading-queue`.

### AI provider outage

Symptom: AI interview evaluation and feedback generation fail (Groq,
`https://api.groq.com`, model `GROQ_MODEL`, default `llama-3.3-70b-versatile`);
LLM error events in Sentry; `/api/health` only reports `groq` as degraded when
the *key is unconfigured* — an outage with a valid key is **not** visible in
`/api/health`.

1. Confirm with `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`.
2. Candidate impact: text/MCQ exams are unaffected; AI interview answers are
   stored (`ai_interview_answers`) but evaluation errors out.
3. Mitigation: pause scheduling new AI interviews (TPO/recruiter comms), wait
   for provider recovery, then re-run failed evaluations (re-push
   `interviewId` payloads to `interview-queue`).
4. Fallback model: switch `GROQ_MODEL` if the provider advises; no code change
   required.

### Security breach

Trigger: confirmed unauthorized access, credential-stuffing success, secret
leak, or anomalous DB contents. **Preserve evidence first**: snapshot logs
(`docker compose logs`), `audit_logs` table (see `database/11_audit_logs.sql`
— action, resource, method, path, ip_address, user_agent), and the affected
rows before mutating anything.

Immediate containment:

1. Revoke sessions: `UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;`
   (table from `database/13_refresh_tokens.sql`).
2. **Rotate `JWT_SECRET`** (config requires ≥ 32 chars and restarts the app on
   change). Rotation invalidates, in one stroke:
   - every outstanding session JWT (they are signed with `JWT_SECRET`), and
   - every short-lived **signed asset URL**: signatures are
     `HMAC-SHA256("<rel_path>:<exp>", key=JWT_SECRET)` in
     `server_py/app/assets.py::_sign_asset_path` — rotating the secret makes
     all previously minted `?exp=...&sig=...` links fail verification
     immediately (the signed-URL invalidation property). New links are minted
     via `POST /api/assets/sign` after re-login.
3. Rotate the other credentials from `server_py/app/config.py`, all stored in
   `[COMPANY-secret-manager]`: `INTERNAL_API_SECRET` (guards
   `POST /internal/notify` and the `/internal/*` AI/proctoring routes),
   `METRICS_TOKEN` (update the Prometheus `authorization.credentials` in the
   same change or scraping breaks — alert `IntelliHireAppDown` will tell you
   if you forgot), `MINIO_ROOT_USER/MINIO_ROOT_PASSWORD` +
   `MINIO_APP_ACCESS_KEY/MINIO_APP_SECRET_KEY`, `SMTP_PASS`, `DATABASE_URL`
   password, `GROQ_API_KEY`, `JUDGE0_API_KEY`.
4. Force password reset for affected users
   (`users.must_change_password = true`); bcrypt hashes in
   `users.password_hash` were never stored reversibly, but rotate anyway on
   suspected DB exfiltration.
5. Re-enable/review the CSRF and CORS posture (explicit allowlist enforced in
   `config.py`; production refuses non-HTTPS `APP_URL`) and check
   `audit_logs` for the intruder's paths.
6. Engage [COMPANY] legal/security lead; go to breach notification below.

### Breach notification (timelines)

> This section is operational guidance, not legal advice; final decisions on
> notification rest with [COMPANY] legal counsel / DPO.

- **GDPR (if EU/UK data subjects are in scope):** notify the competent
  supervisory authority **without undue delay and within 72 hours** of
  becoming aware (Art. 33), documenting: nature of the breach, categories and
  approximate numbers of data subjects and records, DPO contact, likely
  consequences, measures taken. Notify affected individuals without undue
  delay when the risk is high (Art. 34). Processor obligations: this platform
  acts as processor for campus/recruiter customers where applicable — notify
  the controller customer without delay per the DPA so they can meet their
  own 72 h clock.
- **DPDP Act 2023 (India):** notify affected Data Principals without delay on
  becoming aware of a breach, with enough detail to exercise their rights,
  and inform the Data Protection Board of India as specified in the
  applicable rules. Additionally, for incidents affecting systems located in
  India, the CERT-In directions (April 2022) require reporting specified
  cyber incidents (including unauthorised access and data breaches) to
  CERT-In within **6 hours** of noticing.
- Jurisdiction/entity placeholders: `[COMPANY-legal-entity]`,
  `[COMPANY-jurisdiction]`, `[COMPANY-DPO-contact]`.

---

## Detection reference

| Signal | Where |
| --- | --- |
| App down / scrape fails | Prometheus `IntelliHireAppDown` (`up{job="intellihire-app"}`) |
| DB down | Prometheus `IntelliHireHealthEndpointFailing` (`/api/health` 503s) |
| 5xx ratio | Prometheus `IntelliHireHigh5xxErrorRate` / `IntelliHireElevated5xxErrorRate` |
| Latency SLO | Prometheus `IntelliHireLatencySLOBreachP95` (proposed p95 < 1s) |
| Brute force | Prometheus `IntelliHireAuthFailureSpike` (login 4xx proxy) + `Login failed:` log warnings + `audit_logs` |
| App crashes / migration failures | Sentry events: `Failed to apply migration ...`, `Migration runner encountered database connection failure` |
| External availability | External checker on `GET /api/health` every 60s (observability/ALERTING.md §5) |
| Queue backlog | Manual `redis-cli LLEN grading-queue` / `LLEN grading-dlq` until a gauge exists |

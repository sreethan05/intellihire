# Security Testing Plan

Pre-production security validation for IntelliHire. Two layers: what already
runs automatically in CI (no new gates proposed here — these are the real
ones in `.github/workflows/ci.yml`), and what requires human testing before
the first production launch and after every major auth/file-handling change.

---

## 1. Automated gates that already run in CI

All of the following exist today in `.github/workflows/ci.yml` (jobs:
`client-check`, `backend-pytest`, `dependency-audit`, `e2e-playwright`):

| Gate | Job | Configuration (verbatim) |
| --- | --- | --- |
| ESLint | `client-check` | `npm --prefix client run lint` |
| TypeScript check | `client-check` | `npm --prefix client run check` |
| Client unit tests w/ coverage thresholds | `client-check` | `npm --prefix client run test -- --run --coverage` |
| Backend pytest w/ coverage gate | `backend-pytest` | `python -m pytest server_py/tests --cov=server_py/app --cov-report=term-missing --cov-fail-under=70` |
| **Bandit SAST (Python)** | `backend-pytest` | `bandit -q -r server_py/app -s B101,B104,B105 -ll` — fails on HIGH severity findings (assert, wildcard binding, string comparison skips are intentional deviations) |
| **pip-audit (Python deps)** | `backend-pytest` | `pip-audit --skip-editable` |
| **gitleaks (secret scanning)** | `dependency-audit` | `gitleaks/gitleaks-action@v2` over full history (`fetch-depth: 0`) |
| **npm audit (client deps)** | `dependency-audit` | `npm --prefix client audit --audit-level=critical` |
| **dependency review (PRs)** | `dependency-audit` | `actions/dependency-review-action@v4`, `fail-on-severity: high` |
| **Trivy (vuln + misconfig + secret)** | `dependency-audit` | fs scan of the repo, `severity: HIGH,CRITICAL`, `ignore-unfixed: true`, `exit-code: 1` |
| **SBOM** | `dependency-audit` | Trivy CycloneDX `sbom.json`, uploaded as artifact |
| API contract drift gate | `e2e-playwright` | `npm run gen:api-types` then `git diff --exit-code client/src/lib/api-types.gen.ts` — a changed public schema must be consciously regenerated |
| Playwright E2E smoke | `e2e-playwright` | `npx playwright test` against Postgres 15 service + migrated schema |

What CI does **not** cover (and this plan therefore assigns to humans):
business-logic authorization, sandbox escape, runtime WAF-style behaviour,
and anything requiring an adversarial mindset against a running system.

---

## 2. Human security validation scope (external pentest)

Suggested scope for a pre-production pentest. The app under test: FastAPI
backend (routers in `server_py/app/`), React client, PostgreSQL, Redis, MinIO,
self-hosted Judge0 stack, Socket.IO mount at `/socket.io`.

### 2.1 Authentication & session management

- `POST /api/auth/login` — accepts **email or roll number**; verify the
  5/minute slowapi limit actually blocks brute force (and that it is
  per-IP, not per-account); verify uniform `401 INVALID_CREDENTIALS` for
  unknown user vs wrong password (no user enumeration via timing or body).
- JWT lifecycle: access token TTL and claims (`generate_token`), refresh
  rotation (`POST /api/auth/refresh`, `replaced_by_token_hash`), revocation
  (`POST /api/auth/logout`), replay of a rotated refresh token, token in
  cookie flags (HttpOnly/Secure/SameSite) and CSRF token coupling
  (`CSRFMiddleware`).
- `POST /internal/notify` and the `/internal/*` AI/proctoring routes must
  reject requests without a valid `X-Internal-Secret` (the endpoint returns
  503 when the secret is unset — confirm no config path leaves it open).

### 2.2 Authorization / IDOR across the four roles (`candidate`, `recruiter`, `tpo`, `admin`)

- Candidate objects: attempts, results, proctoring timelines
  (`GET /api/proctoring/attempt/{attemptId}`, `/exam/{examId}/summary`,
  `/exam/{examId}/active-monitoring`) — a candidate must only see their own
  attempts; another candidate's IDs must 403/404.
- Recruiter scoping: resumes and results of candidates **not** in the
  recruiter's drives (the intended rule is
  `assets.py::_recruiter_can_access_resume` — jobs created by the recruiter
  or attempts where they are the examiner); cross-tenant drive access.
- TPO scoping: TPOs must only reach students of their own college
  (`get_tpo_college` gate) — test with two colleges.
- Admin-only surfaces: `require_roles(["admin"])` on the docs router in
  production (`/docs`, `/openapi.json` disabled in production via
  `docs_url=None` — verify no shadow route leaks the schema).

### 2.3 File access

- `GET /api/assets/files/{path}`: path traversal (`..`, `%2e%2e`, null bytes,
  backslashes — `_normalize_asset_path` and `_resolve_within_storage` claim
  coverage; fuzz it), absolute paths, symlink escape via a planted symlink in
  the uploads volume.
- Role rules for `resumes/` vs `offers/` per `_authorize_asset` (TPO denied on
  offers, candidate only own rows, recruiter per drive relation).
- Signed URLs (`POST /api/assets/sign`): 300 s TTL expiry enforcement,
  signature HMAC verification (`exp`+`sig`), **signature not bound to the
  requester** — confirm and decide whether an authenticated user can mint a
  link for a file they may access and share it (acceptable) vs mint for a
  file they cannot (must fail), and that a signature for path A cannot be
  reused for path B.
- Upload validation (`upload_validation.py`, `POST /api/candidate/resume/upload`):
  content-type vs magic bytes, size caps, filename sanitisation, and
  whether an uploaded "PDF" can be served with a dangerous content type
  (inline disposition is only for `application/pdf`).

### 2.4 Code-execution sandbox (Judge0 escape)

- Submissions run via `run_with_judge0` on a **private, self-hosted Judge0**
  (`judge0-server:2358`, backend-network isolated). Test: fork bombs, cgroup/
  rlimit escape attempts, network access from the sandbox (must be none),
  filesystem escape, resource exhaustion affecting the host, and access from
  the sandbox to the app's `backend` network (DB/Redis reachable? must be
  no).
- Confirm the public default `https://ce.judge0.com` is never used when
  `JUDGE0_API_URL` is unset in a production misconfiguration — decide whether
  to fail closed instead.

### 2.5 WebSocket (Socket.IO)

- `/socket.io` connect handler requires auth (`connect` with `auth` token):
  unauthenticated connect must be rejected ("authentication required"), and
  a tampered/foreign JWT must fail ("invalid token").
- Room join authorization: `notifications:join`, `notifications:leave`,
  `proctor:join` — verify a user cannot join another user's notification room
  or a proctoring room for an exam they do not own (IDOR over the socket
  channel).

### 2.6 Rate-limit bypass

- slowapi limits (login 5/min, `/internal/notify` 60/min, proctoring events
  120/min): test `X-Forwarded-For` spoofing (the limiter keys on
  `request.client.host` — is the reverse proxy trusted?), Redis limiter
  fail-open behaviour when Redis is down, and distributed scraping of
  unauthenticated public endpoints.

### 2.7 Signed-URL abuse

- Replay after expiry, signature truncation, algorithm confusion, race
  between `exp` check and HMAC compare (`hmac.compare_digest` order), reuse
  of a URL after `JWT_SECRET` rotation (must fail — that is the rotation
  property), and enumeration of `resumes/<filename>` space (timestamped
  names) via signed-URL oracle errors.

### 2.8 Supporting checks

- Security headers (`SecurityHeadersMiddleware`), CORS allowlist (production
  refuses wildcards/non-HTTPS origins in `config.py` — verify runtime
  headers), audit-log coverage of sensitive actions (`AuditLoggerMiddleware` →
  `audit_logs`), metrics exposure (`/metrics` 401/503 without
  `METRICS_TOKEN` in production), and CSRF coverage on state-changing routes.

---

## 3. Acceptance criteria

The pre-production security phase is **complete** when all of the following
hold:

1. CI is green on `main` including every gate in §1 (Bandit HIGH findings =
   0 accepted exceptions; Trivy/gitleaks/pip-audit/npm-audit failures
   triaged and fixed or formally risk-accepted by [COMPANY-security-owner]).
2. Every scenario in §2.1–§2.7 has been executed with a written result
   (pass / finding). Findings are triaged: **Critical/High** must be fixed
   before go-live; **Medium** must have a dated remediation plan; **Low** are
   tracked.
3. No Critical/High finding is older than 24 h untriaged; retest of fixes is
   documented.
4. Secrets inventory verified against `server_py/app/config.py`
   (`JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_SECRET`,
   `METRICS_TOKEN`, `GROQ_API_KEY`, `JUDGE0_API_KEY`, `SMTP_*`, `S3_*` /
   `MINIO_*`, `SENTRY_DSN`): all set from a secret manager, none committed
   (gitleaks green), `JWT_SECRET` ≥ 32 chars (enforced by the config
   validator), production defaults like `minioadmin`/`minioadminpass`
   replaced.
5. Evidence pack archived at `[COMPANY-pentest-evidence-location]`: scope,
   methodology, findings register, retest notes — referenced in the release
   checklist.
6. Retest cadence: full retest after any change to auth (`auth_router.py`),
   file handling (`assets.py`, `upload_validation.py`, `storage.py`), the
   Judge0 integration, or the websocket layer — plus the annual full pentest
   scheduled by [COMPANY-security-owner].

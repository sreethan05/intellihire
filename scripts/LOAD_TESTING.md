# IntelliHire Load Testing

`scripts/load_test.py` measures the FastAPI backend (`server_py/`) using only
**stdlib + httpx + the socket.io v5 wire protocol over the installed `websockets`
package**. No extra dependencies are required or installed.

It contains 5 scenarios: `login`, `dashboard`, `exam`, `code`, `websocket`.

## Requirements

- Local PostgreSQL seeded database (`DATABASE_URL`).
- Python venv at `server_py/.venv` (httpx, websockets, psycopg are already installed).

## 1. Start the backend (terminal 1)

Run from the **repo root**. Two environment choices matter:

- `DISABLE_RATE_LIMITS=true` — otherwise the built-in rate limiter (5 logins/min per
  IP, 10 compiler runs/min) masks the test with HTTP 429s.
- `JUDGE0_API_URL=""` — **disables code execution** so the `code` scenario can never
  call the shared public Judge0 instance (`ce.judge0.com`). `app/compiler.py`
  short-circuits to `503 "Code execution is not configured"` before any external call.

```bash
cd <repo-root>
PYTHONPATH=server_py \
DISABLE_RATE_LIMITS=true \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/intellihire \
JWT_SECRET=ci-secret-key-for-testing-purposes-only-1234567890 \
JUDGE0_API_URL="" \
node scripts/run-uvicorn.js server_py.app.main:app --port 5010 --host 127.0.0.1
```

Verify it is up: `curl http://127.0.0.1:5010/api/health` — the health payload must
show `"judge0":{"endpoint":""}` before running the `code` scenario.

## 2. Run the load test (terminal 2)

```bash
cd <repo-root>
server_py/.venv/Scripts/python.exe scripts/load_test.py --base http://127.0.0.1:5010 --scenario all
```

Defaults: 200 requests at 50 concurrent per HTTP scenario, 100 websocket clients with
10 ping/pong round trips each. Every option can be scaled:

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `--base` | `http://127.0.0.1:5010` | Target base URL |
| `--scenario` | `all` | `login`, `dashboard`, `exam`, `code`, `websocket`, `all`, `none` (cleanup only) |
| `--users` | 50 | Concurrent HTTP workers per scenario |
| `--requests` | 200 | Total requests per HTTP scenario |
| `--ramp` | 0 | Seconds used to stagger worker/client start-up |
| `--ws-clients` | 100 | Concurrent socket.io clients |
| `--ws-roundtrips` | 10 | ping→pong round trips per client |
| `--timeout` | 30 | Per-request timeout (s) |
| `--json FILE` | – | Also write a machine-readable summary |
| `--cleanup-tokens` | off | Delete the `refresh_tokens` rows the test created (marker user-agent `intellihire-loadtest/1.0`) |

The script refuses to target a non-localhost host unless `--allow-remote` is passed.

## What each scenario exercises

1. **login** — `POST /api/auth/login` round-robin over the 4 seeded role accounts
   (`admin|recruiter|candidate|tpo@intellihire.com`, password `admin123`). Each call
   performs a user lookup + bcrypt password check + `refresh_tokens` INSERT + session
   cookie issue. JWTs for the other scenarios are captured from the `access_token`
   session cookie.
2. **dashboard** — authenticated `GET`s of `/api/hub/overview` for all 4 roles plus
   `GET /api/candidate/dashboard` (candidate) and `GET /api/recruiter/dashboard`
   (recruiter). Auth is a cookie session + Bearer header; cookie-authenticated POSTs
   elsewhere also pass the `X-CSRF-Token` middleware check.
3. **exam** — **read-only** exam read paths: `GET /api/candidate/exams` (list assigned
   exams), candidate `/api/hub/overview`, and admin `GET /api/exam/list?page=1`.
   **Start / answer-autosave / submission are deliberately excluded** (see
   "Exclusions" below).
4. **code** — `POST /api/compiler/run` **only when the target has Judge0 disabled**.
   The script probes once and requires a `503 Code execution is not configured`
   answer; otherwise it excludes itself rather than risk hammering a real Judge0.
   With Judge0 disabled the measured numbers reflect the endpoint guard path
   (auth + CSRF middleware + request validation) only — not sandboxed execution.
5. **websocket** — N concurrent socket.io clients performing the same handshake as
   the frontend: engine.io websocket upgrade → socket.io CONNECT packet with
   `auth={"token": <jwt>}` (validated in `app/websocket.py`). Each client joins the
   notifications room (`notifications:join`), admin-role clients emit proctoring
   events (`proctor:join` + 3 `proctor:violation` + `proctor:leave` — admin bypasses
   ownership DB checks so nothing is written), and every client measures the
   application-level `ping` → `pong` round trip served by `app/websocket.py::on_ping`.
   Implementation note: python-socketio's `AsyncClient` needs aiohttp as its HTTP
   backend, which is not installed and may not be added, so the script speaks the
   identical engine.io v4 / socket.io v5 protocol directly over `websockets`.

## Measured results — local run (2026-10-25)

Machine: Windows 11 dev laptop, single uvicorn worker (default), local PostgreSQL,
`DISABLE_RATE_LIMITS=true`, `JUDGE0_API_URL=""`, port 5010.

### login — collapse under concurrency (bcrypt on the event loop)

| Load | Reqs | Errors | err% | p50 | p95 | p99 | max | Throughput |
| :--- | --: | --: | --: | --: | --: | --: | --: | --: |
| 1 concurrent × 20 | 20 | 0 | 0.0% | 345 ms | 484 ms | 484 ms | 484 ms | 2.7 req/s |
| 10 concurrent × 100 | 100 | 0 | 0.0% | 3 585 ms | 4 660 ms | 5 106 ms | 5 106 ms | 2.8 req/s |
| 50 concurrent × 200 | 200 | 43 | 21.5% | 19 418 ms | 22 925 ms | 33 534 ms | 33 554 ms | 2.2 req/s |
| 50 concurrent × 200 (second run) | 200 | 172 | 86.0% | 28 060 ms | 33 693 ms | 33 834 ms | 33 834 ms | 2.2 req/s |

Errors are client-side 30 s `ReadTimeout`s, not HTTP error statuses. Throughput is
capped at ~2.2–2.8 req/s at every concurrency level — see "Bottlenecks" below.

### dashboard — 50 concurrent, 200 requests, 0 errors

| Endpoint | Reqs | p50 | p95 | p99 | max |
| :--- | --: | --: | --: | --: | --: |
| GET /api/hub/overview (candidate) | 34 | 882 ms | 4 243 ms | 4 299 ms | 4 299 ms |
| GET /api/candidate/dashboard | 34 | 1 010 ms | 3 299 ms | 3 341 ms | 3 341 ms |
| GET /api/hub/overview (recruiter) | 33 | 1 178 ms | 3 161 ms | 5 186 ms | 5 186 ms |
| GET /api/recruiter/dashboard | 33 | 914 ms | 3 014 ms | 4 042 ms | 4 042 ms |
| GET /api/hub/overview (admin) | 33 | 1 038 ms | 3 722 ms | 3 852 ms | 3 852 ms |
| GET /api/hub/overview (tpo) | 33 | 1 135 ms | 2 879 ms | 4 993 ms | 4 993 ms |

Aggregate ≈ 21 req/s; a separate 10-concurrent run showed the same shape with p50
well under 1 s.

### exam (read-only) — 50 concurrent, 200 requests, 0 errors

| Endpoint | Reqs | p50 | p95 | p99 | max |
| :--- | --: | --: | --: | --: | --: |
| GET /api/candidate/exams | 67 | 595 ms | 2 805 ms | 3 515 ms | 3 515 ms |
| GET /api/hub/overview (candidate) | 67 | 827 ms | 1 935 ms | 2 865 ms | 2 865 ms |
| GET /api/exam/list (admin, page=1) | 66 | 608 ms | 2 878 ms | 3 524 ms | 3 524 ms |

### code (Judge0 disabled, 503 guard path) — 50 concurrent, 200 requests, 0 errors

| Endpoint | Reqs | p50 | p95 | p99 | max |
| :--- | --: | --: | --: | --: | --: |
| POST /api/compiler/run | 200 | 659 ms | 2 903 ms | 3 411 ms | 4 191 ms |

Probe confirmed `503 Code execution is not configured` — the shared public Judge0 was
never contacted.

### websocket — 100 clients × 10 round trips, 0 errors

| Operation | Reqs | p50 | p95 | p99 | max |
| :--- | --: | --: | --: | --: | --: |
| socket.io connect (`40` + `auth={"token"}`) | 100 | 293 ms | 320 ms | 355 ms | 355 ms |
| ping→pong round trip | 1 000 | 40 ms | 147 ms | 234 ms | 239 ms |
| notifications:join (emit) | 100 | 0.1 ms | 0.1 ms | 0.2 ms | 0.2 ms |
| proctor events emitted (admin, fire-and-forget) | 75 | – | – | – | – |

100/100 clients authenticated and 1 000/1 000 round trips completed. Under a quieter
machine another run measured connect p50 ≈ 1.9 s / RTT p50 ≈ 240 ms for 100 clients —
the spread comes from client- and server-side event-loop contention, so treat single-run
websocket numbers as indicative.

## Exclusions (honest limitations)

- **Exam write flow (start / answer autosave / submission): EXCLUDED.** The seeded DB's
  exam assignments and attempts belong to `candidate@example.com`, whose password is
  unknown (not `admin123`; verified offline against the bcrypt hash). The documented
  candidate (`candidate@intellihire.com`) has no assignments, so `POST /api/exam/start`
  would either `403` or — for accounts that do have assignments — INSERT rows into the
  `attempts` table (graded data). Per policy ("never submit garbage into graded rows")
  only read paths are measured. To load-test the full flow safely, create a dedicated
  throwaway DB (or a test candidate + assignment) and re-run.
- **Real code execution: EXCLUDED by design.** `app/compiler.py` has no mock mode; it
  always proxies to Judge0 (`JUDGE0_API_URL`, default `https://ce.judge0.com`). With
  `JUDGE0_API_URL=""` the endpoint short-circuits to 503 and the scenario measures the
  guard path only. **Never** point this scenario at a Judge0 with a live shared
  instance; the script enforces this with its 503 probe.
- **WebSocket `AsyncClient`:** python-socketio 5.16's AsyncClient refuses to run without
  aiohttp (not installed; deps may not be added). The scenario instead implements the
  same engine.io v4 / socket.io v5 protocol over the installed `websockets` package —
  same handshake, same auth payload, same events, measured against the same server code
  paths.

## Running against production (if you must)

- The target is just an env var: `--base https://staging.example.com --allow-remote`.
- **Warning — shared Judge0:** production deployments may proxy code execution to
  Judge0. The `code` scenario's safety probe refuses to run unless the endpoint answers
  503 "not configured"; never bypass that check against a shared instance
  (e.g. `ce.judge0.com`) — it is a public service other tenants rely on.
- Run **off-peak**, start tiny (`--users 5 --requests 20 --ws-clients 5`), watch server
  CPU/memory, and prefer a staging replica of the database over the production one.
- Every login issued during a test creates a real `refresh_tokens` row; pass
  `--cleanup-tokens` (or run `--scenario none --cleanup-tokens`) afterwards.

## Bottlenecks observed (single uvicorn worker, dev machine)

1. **Login is CPU-bound on the event loop.** `bcrypt.checkpw` (cost 12, ≈350–640 ms
   per check on this machine) runs synchronously inside the `async def login` handler,
   so concurrent logins serialize: throughput stays at ~2.2–2.8 req/s from 1 to 50
   concurrent clients, and at 50 concurrent 21–86 % of requests exceed the 30 s
   client timeout. Fixes: move the bcrypt call to a thread pool
   (`asyncio.to_thread` / `run_in_executor`), or reduce cost, or add more workers —
   and add client-side pacing so a burst of logins cannot monopolize the loop.
2. **Dashboard/hub endpoints are DB-heavy.** At 50 concurrent, hub overview and both
   dashboards sit at p50 ≈ 0.9–1.2 s and p95 ≈ 2.9–4.2 s (> 500 ms p95 on every
   endpoint); requests queue behind the 20-connection psycopg pool while each request
   re-fetches the user row and runs many sub-queries per payload. Candidates for
   batching/caching.
3. **Exam read paths degrade under the same load** (p50 ≈ 0.6–0.8 s, p95 ≈ 1.9–2.9 s),
   with the same pool-queueing signature.
4. **WebSocket is the healthiest path:** 100 clients connect in < 0.4 s p95 and the
   ping→pong RTT p50 stays at 40 ms (147 ms p95) once the HTTP side is quiet.

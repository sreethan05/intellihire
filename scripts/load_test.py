#!/usr/bin/env python
"""IntelliHire load test (stdlib + httpx + python-socketio.AsyncClient only).

Run against a LOCAL stack you own:

    cd <repo-root>
    # start the backend (from another shell) with rate limits disabled and
    # Judge0 DISABLED so the `code` scenario never touches the shared public
    # instance (ce.judge0.com):
    PYTHONPATH=server_py DISABLE_RATE_LIMITS=true DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/intellihire \
        JWT_SECRET=ci-secret-key-for-testing-purposes-only-1234567890 JUDGE0_API_URL="" \
        node scripts/run-uvicorn.js server_py.app.main:app --port 5010 --host 127.0.0.1

    # then:
    server_py/.venv/Scripts/python.exe scripts/load_test.py --base http://127.0.0.1:5010 --scenario all

Scenarios
---------
login      POST /api/auth/login round-robin over the four seeded role accounts.
dashboard  Authenticated GETs of /api/hub/overview + candidate/recruiter dashboards
           (role-matched, Bearer/cookie JWT captured from a real login).
exam       READ-ONLY exam read paths for the candidate (GET /api/candidate/exams,
           GET /api/hub/overview) plus admin GET /api/exam/list. The write flow
           (POST /api/exam/start, answer autosave, submission) is intentionally
           NOT exercised against a seeded database: the only candidate that has
           seeded exam assignments (candidate@example.com) has an unknown
           password, and starting exams for candidate@intellihire.com would
           either 403 or INSERT garbage attempt rows into graded data. See
           scripts/LOAD_TESTING.md.
code       POST /api/compiler/run ONLY when the backend was started with
           JUDGE0_API_URL="" (endpoint then short-circuits to 503 without any
           external call). The script probes once and refuses to continue if the
           endpoint is configured to hit a real Judge0, so the shared public
           instance is never hammered.
websocket  K concurrent socket.io clients authenticating exactly like the
           frontend: engine.io v4 websocket handshake + socket.io CONNECT packet
           carrying auth={"token": <jwt>} (see app/websocket.py connect handler).
           The clients join the notifications room, admin clients emit proctoring
           events (room join + violations, read-only server-side), and every
           client measures ping->pong application-level round trips.
           NOTE: python-socketio's AsyncClient is used when its HTTP backend
           (aiohttp) is available; this venv has no aiohttp and dependencies may
           not be added, so the script speaks the identical socket.io v5 wire
           protocol directly over the installed `websockets` package.

Safety: refuses to run against a non-localhost host unless --allow-remote is given.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

LOADTEST_UA = "intellihire-loadtest/1.0"

# The four seeded role accounts (README "Default Test Accounts & Credentials").
ACCOUNTS: List[Tuple[str, str]] = [
    ("admin", "admin@intellihire.com", "admin123"),
    ("recruiter", "recruiter@intellihire.com", "admin123"),
    ("candidate", "candidate@intellihire.com", "admin123"),
    ("tpo", "tpo@intellihire.com", "admin123"),
]


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
@dataclass
class Result:
    label: str
    latencies_ms: List[float] = field(default_factory=list)
    errors: int = 0
    notes: List[str] = field(default_factory=list)

    def add(self, ms: float) -> None:
        self.latencies_ms.append(ms)

    def fail(self) -> None:
        self.errors += 1


def percentile(values: List[float], p: float) -> float:
    """Nearest-rank percentile of a non-empty list."""
    if not values:
        return float("nan")
    s = sorted(values)
    idx = max(0, min(len(s) - 1, int(round(p / 100.0 * len(s) + 0.5)) - 1))
    return s[idx]


def print_table(results: List[Result], title: str) -> None:
    print(f"\n=== {title} ===")
    header = f"{'operation':44s} {'reqs':>6s} {'errors':>7s} {'err%':>6s} {'p50(ms)':>9s} {'p95(ms)':>9s} {'p99(ms)':>9s} {'max(ms)':>9s}"
    print(header)
    print("-" * len(header))
    for r in results:
        n = len(r.latencies_ms)
        total = n + r.errors
        err_pct = (100.0 * r.errors / total) if total else 0.0
        if n:
            p50, p95, p99, mx = percentile(r.latencies_ms, 50), percentile(r.latencies_ms, 95), percentile(r.latencies_ms, 99), max(r.latencies_ms)
            print(f"{r.label:44s} {total:6d} {r.errors:7d} {err_pct:5.1f}% {p50:9.1f} {p95:9.1f} {p99:9.1f} {mx:9.1f}")
        else:
            print(f"{r.label:44s} {total:6d} {r.errors:7d} {err_pct:5.1f} {'-':>9s} {'-':>9s} {'-':>9s} {'-':>9s}")
    for note in sorted({n for r in results for n in r.notes}):
        print(f"  note: {note}")


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #
async def login_role(client: httpx.AsyncClient, base: str, email: str, password: str, res: Optional[Result] = None) -> Optional[str]:
    """Perform one real login; return the access-token JWT from the session cookie."""
    t0 = time.perf_counter()
    try:
        resp = await client.post(
            f"{base}/api/auth/login",
            json={"email": email, "password": password},
            headers={"User-Agent": LOADTEST_UA},
        )
        ms = (time.perf_counter() - t0) * 1000.0
        if res is not None:
            res.add(ms)
        ok = resp.status_code == 200
        if not ok:
            if res is not None:
                res.fail()
            print(f"  [login] {email}: HTTP {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
            return None
        if "csrfToken" not in resp.json():
            if res is not None:
                res.fail()
            print(f"  [login] {email}: 200 but missing csrfToken", file=sys.stderr)
            return None
        jwt = resp.cookies.get("access_token")
        if not jwt:
            if res is not None:
                res.fail()
            print(f"  [login] {email}: 200 but no access_token cookie", file=sys.stderr)
            return None
        return jwt
    except Exception as exc:
        if res is not None:
            res.fail()
        print(f"  [login] {email}: exception {exc!r}", file=sys.stderr)
        return None


async def get_role_tokens(client: httpx.AsyncClient, base: str) -> Dict[str, Dict[str, str]]:
    """Login once per role; return {role: {jwt, csrf, user_id}}."""
    out: Dict[str, Dict[str, str]] = {}
    for role, email, password in ACCOUNTS:
        resp = await client.post(
            f"{base}/api/auth/login",
            json={"email": email, "password": password},
            headers={"User-Agent": LOADTEST_UA},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"login failed for {email}: HTTP {resp.status_code} {resp.text[:200]}")
        body = resp.json()
        jwt = resp.cookies.get("access_token")
        if not jwt:
            raise RuntimeError(f"login for {email} returned no access_token cookie")
        csrf = str(body.get("csrfToken") or "")
        out[role] = {"jwt": jwt, "csrf": csrf, "user_id": str(body["user"]["id"])}
    return out


def auth_headers(tok: Dict[str, str], post: bool = False) -> Dict[str, str]:
    """Headers used by the frontend: cookie session + Bearer fallback both work.

    Cookie-authenticated POSTs must pass CSRF middleware: X-CSRF-Token header
    matching the csrf_token cookie (see app/middleware/csrf.py).
    """
    h = {
        "Authorization": f"Bearer {tok['jwt']}",
        "Cookie": f"access_token={tok['jwt']}",
        "User-Agent": LOADTEST_UA,
    }
    if post and tok.get("csrf"):
        h["Cookie"] = f"access_token={tok['jwt']}; csrf_token={tok['csrf']}"
        h["X-CSRF-Token"] = tok["csrf"]
    return h


# --------------------------------------------------------------------------- #
# Scenario: login
# --------------------------------------------------------------------------- #
async def scenario_login(base: str, users: int, requests: int, ramp: float, timeout: float) -> List[Result]:
    res = Result("POST /api/auth/login (4 roles, refresh token issued)")
    limits = httpx.Limits(max_connections=max(users, 10), max_keepalive_connections=max(users, 10))

    async def worker(client: httpx.AsyncClient, start_delay: float) -> None:
        if start_delay:
            await asyncio.sleep(start_delay)
        i = 0
        while True:
            my_idx = request_counter[0]
            if my_idx >= requests:
                return
            request_counter[0] = my_idx + 1
            i = my_idx % len(ACCOUNTS)
            await login_role(client, base, ACCOUNTS[i][1], ACCOUNTS[i][2], res)

    request_counter = [0]
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        t0 = time.perf_counter()
        delays = [i * (ramp / users) if users else 0.0 for i in range(users)]
        await asyncio.gather(*(worker(client, d) for d in delays))
        wall = time.perf_counter() - t0
    rps = requests / wall if wall > 0 else 0.0
    print(f"\n[login] wall={wall:.2f}s throughput={rps:.1f} req/s (concurrency={users}, ramp={ramp}s)")
    return [res]


# --------------------------------------------------------------------------- #
# Scenario: dashboard
# --------------------------------------------------------------------------- #
DASHBOARD_PLAN: List[Tuple[str, str]] = [
    ("candidate", "GET /api/hub/overview (candidate)"),
    ("candidate", "GET /api/candidate/dashboard"),
    ("recruiter", "GET /api/hub/overview (recruiter)"),
    ("recruiter", "GET /api/recruiter/dashboard"),
    ("admin", "GET /api/hub/overview (admin)"),
    ("tpo", "GET /api/hub/overview (tpo)"),
]
DASHBOARD_PATHS = {
    "GET /api/hub/overview (candidate)": ("/api/hub/overview", "candidate"),
    "GET /api/candidate/dashboard": ("/api/candidate/dashboard", "candidate"),
    "GET /api/hub/overview (recruiter)": ("/api/hub/overview", "recruiter"),
    "GET /api/recruiter/dashboard": ("/api/recruiter/dashboard", "recruiter"),
    "GET /api/hub/overview (admin)": ("/api/hub/overview", "admin"),
    "GET /api/hub/overview (tpo)": ("/api/hub/overview", "tpo"),
}


async def scenario_dashboard(base: str, users: int, requests: int, ramp: float, timeout: float) -> List[Result]:
    limits = httpx.Limits(max_connections=max(users, 10), max_keepalive_connections=max(users, 10))
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        tokens = await get_role_tokens(client, base)
        results = {label: Result(label) for _, label in DASHBOARD_PLAN}
        counter = [0]

        async def worker(start_delay: float) -> None:
            if start_delay:
                await asyncio.sleep(start_delay)
            while True:
                idx = counter[0]
                if idx >= requests:
                    return
                counter[0] = idx + 1
                role, label = DASHBOARD_PLAN[idx % len(DASHBOARD_PLAN)]
                path, _ = DASHBOARD_PATHS[label]
                tok = tokens[role]
                t0 = time.perf_counter()
                try:
                    resp = await client.get(f"{base}{path}", headers=auth_headers(tok))
                    ms = (time.perf_counter() - t0) * 1000.0
                    if resp.status_code == 200:
                        results[label].add(ms)
                    else:
                        results[label].fail()
                        if resp.status_code in (401, 403) and results[label].errors == 1:
                            results[label].notes.append(f"{label}: HTTP {resp.status_code} {resp.text[:120]}")
                except Exception:
                    results[label].fail()

        t0 = time.perf_counter()
        delays = [i * (ramp / users) if users else 0.0 for i in range(users)]
        await asyncio.gather(*(worker(d) for d in delays))
        wall = time.perf_counter() - t0
    total = requests
    print(f"\n[dashboard] wall={wall:.2f}s throughput={total / wall:.1f} req/s (concurrency={users}, ramp={ramp}s)")
    return [results[label] for _, label in DASHBOARD_PLAN]


# --------------------------------------------------------------------------- #
# Scenario: exam (READ-ONLY against seeded DB)
# --------------------------------------------------------------------------- #
EXAM_PLAN: List[Tuple[str, str, str]] = [
    ("candidate", "GET /api/candidate/exams", "/api/candidate/exams"),
    ("candidate", "GET /api/hub/overview (candidate)", "/api/hub/overview"),
    ("admin", "GET /api/exam/list (admin, page=1)", "/api/exam/list?page=1&limit=10"),
]


async def scenario_exam(base: str, users: int, requests: int, ramp: float, timeout: float) -> List[Result]:
    limits = httpx.Limits(max_connections=max(users, 10), max_keepalive_connections=max(users, 10))
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        tokens = await get_role_tokens(client, base)
        results = {label: Result(label) for _, label, _ in EXAM_PLAN}
        counter = [0]

        async def worker(start_delay: float) -> None:
            if start_delay:
                await asyncio.sleep(start_delay)
            while True:
                idx = counter[0]
                if idx >= requests:
                    return
                counter[0] = idx + 1
                role, label, path = EXAM_PLAN[idx % len(EXAM_PLAN)]
                t0 = time.perf_counter()
                try:
                    resp = await client.get(f"{base}{path}", headers=auth_headers(tokens[role]))
                    ms = (time.perf_counter() - t0) * 1000.0
                    if resp.status_code == 200:
                        results[label].add(ms)
                    else:
                        results[label].fail()
                        if results[label].errors == 1:
                            results[label].notes.append(f"{label}: HTTP {resp.status_code} {resp.text[:120]}")
                except Exception:
                    results[label].fail()

        t0 = time.perf_counter()
        delays = [i * (ramp / users) if users else 0.0 for i in range(users)]
        await asyncio.gather(*(worker(d) for d in delays))
        wall = time.perf_counter() - t0
    print(f"\n[exam] wall={wall:.2f}s throughput={requests / wall:.1f} req/s (concurrency={users}, ramp={ramp}s)")
    print("[exam] NOTE: start/autosave/submit excluded — read-only against seeded DB (see scripts/LOAD_TESTING.md)")
    return [results[label] for _, label, _ in EXAM_PLAN]


# --------------------------------------------------------------------------- #
# Scenario: code (Judge0 must be DISABLED on the target)
# --------------------------------------------------------------------------- #
async def scenario_code(base: str, users: int, requests: int, ramp: float, timeout: float) -> List[Result]:
    res = Result("POST /api/compiler/run (Judge0 disabled, 503 guard path)")
    limits = httpx.Limits(max_connections=max(users, 10), max_keepalive_connections=max(users, 10))
    payload = {"code": "print('loadtest')", "language": "python", "stdin": ""}
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        tokens = await get_role_tokens(client, base)
        tok = tokens["candidate"]

        # SAFETY PROBE: the endpoint must be configured OFF (503 "not configured").
        # If a real Judge0 answers, we stop immediately and never hammer it.
        try:
            probe = await client.post(f"{base}/api/compiler/run", json=payload, headers=auth_headers(tok, post=True))
        except Exception as exc:
            res.fail()
            res.notes.append(f"probe request failed: {exc!r}")
            return [res]
        if probe.status_code == 503:
            res.notes.append(f"probe: 503 ({probe.json().get('detail', '')[:80]}) — external Judge0 NOT called; measuring guard path only")
        else:
            res.fail()
            res.notes.append(
                f"EXCLUDED: /api/compiler/run answered HTTP {probe.status_code} — target has a live code-execution "
                "backend; refusing to load-test it (would hit external/shared Judge0). Start the backend with "
                "JUDGE0_API_URL='' to enable this scenario."
            )
            return [res]

        counter = [0]

        async def worker(start_delay: float) -> None:
            if start_delay:
                await asyncio.sleep(start_delay)
            while True:
                idx = counter[0]
                if idx >= requests:
                    return
                counter[0] = idx + 1
                t0 = time.perf_counter()
                try:
                    resp = await client.post(f"{base}/api/compiler/run", json=payload, headers=auth_headers(tok, post=True))
                    ms = (time.perf_counter() - t0) * 1000.0
                    if resp.status_code == 503:
                        res.add(ms)
                    else:
                        res.fail()
                except Exception:
                    res.fail()

        t0 = time.perf_counter()
        delays = [i * (ramp / users) if users else 0.0 for i in range(users)]
        await asyncio.gather(*(worker(d) for d in delays))
        wall = time.perf_counter() - t0
    print(f"\n[code] wall={wall:.2f}s throughput={requests / wall:.1f} req/s (concurrency={users}, ramp={ramp}s)")
    return [res]


# --------------------------------------------------------------------------- #
# Scenario: websocket
# --------------------------------------------------------------------------- #
class SioV5Client:
    """Minimal socket.io v5 client over engine.io v4 websocket transport.

    Speaks the same wire protocol python-socketio's AsyncClient would:
      ws  open   -> server sends 0{...} (engine.io open)
      sio connect-> client sends 40{"token": <jwt>}   (auth dict, like the
                    browser client's auth={"token": ...}); server acks 40{...}
      event      -> 42["<event>", <payload>]
      disconnect -> 41
    Engine.io-level pings from the server ("2") are answered with "3" pongs so
    long-lived connections survive; application-level RTT is measured with the
    app's own ping -> pong events (app/websocket.py on_ping).
    """

    def __init__(self, base: str, token: str) -> None:
        ws_base = base.replace("http://", "ws://", 1).replace("https://", "wss://", 1)
        self.url = f"{ws_base}/socket.io/?EIO=4&transport=websocket"
        self.token = token
        self.ws: Any = None
        self.events: asyncio.Queue = asyncio.Queue()
        self._reader: Optional[asyncio.Task] = None

    async def connect(self, timeout: float) -> None:
        import websockets

        try:  # websockets >= 14
            cm = websockets.connect(self.url, additional_headers=None, open_timeout=timeout)
        except TypeError:  # older signature
            cm = websockets.connect(self.url, open_timeout=timeout)
        self.ws = await cm

        # engine.io open packet: 0{...}
        pkt = await asyncio.wait_for(self.ws.recv(), timeout)
        if not isinstance(pkt, str) or not pkt.startswith("0"):
            raise ConnectionError(f"expected engine.io open packet, got {pkt!r:.80}")

        # socket.io namespace CONNECT with auth payload (token auth handshake)
        await self.ws.send("40" + json.dumps({"token": self.token}))
        while True:
            pkt = await asyncio.wait_for(self.ws.recv(), timeout)
            if isinstance(pkt, bytes):
                pkt = pkt.decode("utf-8", "replace")
            if pkt.startswith("40"):
                self._reader = asyncio.create_task(self._read_loop())
                return
            if pkt.startswith("44"):
                raise ConnectionError(f"namespace connect rejected: {pkt[:200]}")
            if pkt == "2":  # engine.io ping during handshake
                await self.ws.send("3")

    async def _read_loop(self) -> None:
        try:
            async for msg in self.ws:
                if isinstance(msg, bytes):
                    msg = msg.decode("utf-8", "replace")
                if msg == "2":  # engine.io ping -> pong
                    await self.ws.send("3")
                elif msg.startswith("42"):
                    try:
                        data = json.loads(msg[2:])
                        await self.events.put(data if isinstance(data, list) else [None, data])
                    except (ValueError, TypeError):
                        pass
                elif msg.startswith("44"):
                    await self.events.put(["__connect_error__", msg])
                elif msg == "41":
                    break
        except Exception:
            pass

    async def emit(self, event: str, payload: Any) -> None:
        await self.ws.send("42" + json.dumps([event, payload]))

    async def wait_event(self, name: str, timeout: float) -> Any:
        """Return the payload of the next event with the given name."""
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"timed out waiting for event {name!r}")
            ev_name, payload = await asyncio.wait_for(self.events.get(), timeout=remaining)
            if ev_name == name:
                return payload

    async def close(self) -> None:
        if self._reader:
            self._reader.cancel()
        try:
            await self.ws.send("41")  # socket.io DISCONNECT
        except Exception:
            pass
        try:
            await self.ws.close()
        except Exception:
            pass


async def scenario_websocket(base: str, ws_clients: int, ws_roundtrips: int, ramp: float, timeout: float) -> List[Result]:
    connect_res = Result("ws: socket.io connect (40+auth={'token'})")
    rtt_res = Result("ws: ping->pong round trip")
    join_res = Result("ws: notifications:join")
    proctor_res = Result("ws: proctor:join+3x violation (admin)")

    limits = httpx.Limits(max_connections=max(10, ws_clients), max_keepalive_connections=max(10, ws_clients))
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        tokens = await get_role_tokens(client, base)

    pong_timeout = max(timeout, 10.0)
    stats = {"connect_ok": 0, "connect_err": 0, "rtt_ok": 0, "rtt_err": 0,
             "join_ok": 0, "join_err": 0, "proctor_sent": 0}

    async def one_client(idx: int, start_delay: float) -> None:
        if start_delay:
            await asyncio.sleep(start_delay)
        role = ACCOUNTS[idx % len(ACCOUNTS)][0]
        tok = tokens[role]
        sio = SioV5Client(base, tok["jwt"])
        try:
            t0 = time.perf_counter()
            await sio.connect(timeout)
            connect_res.add((time.perf_counter() - t0) * 1000.0)
            stats["connect_ok"] += 1
        except Exception as exc:
            connect_res.fail()
            stats["connect_err"] += 1
            if stats["connect_err"] == 1:
                connect_res.notes.append(f"connect failed: {type(exc).__name__}: {str(exc)[:120]}")
            return

        try:
            # Join the notifications room (as the web client does after connect).
            t1 = time.perf_counter()
            await sio.emit("notifications:join", {"userId": tok["user_id"]})
            emit_ms = (time.perf_counter() - t1) * 1000.0
            # No server ack on success; drain briefly (outside the measured
            # latency) to catch an "error" event if the join was rejected.
            deadline = time.monotonic() + 0.5
            join_error = False
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    name, _payload = await asyncio.wait_for(sio.events.get(), timeout=remaining)
                except asyncio.TimeoutError:
                    break
                if name in ("error", "__connect_error__"):
                    join_error = True
                    break
                await sio.events.put([name, _payload])  # re-queue unrelated event
            if join_error:
                stats["join_err"] += 1
                join_res.fail()
                if stats["join_err"] == 1:
                    join_res.notes.append("notifications:join rejected with an error event")
            else:
                join_res.add(emit_ms)
                stats["join_ok"] += 1

            # Admin clients exercise the proctoring path: room join + violations.
            # Admin bypasses ownership DB checks, so this stays read-only server-side.
            if role == "admin":
                try:
                    await sio.emit("proctor:join", {"attemptId": "load-test-attempt", "role": "admin"})
                    for v in range(3):
                        await sio.emit(
                            "proctor:violation",
                            {
                                "examId": "load-test-exam",
                                "attemptId": "load-test-attempt",
                                "violationCount": v + 1,
                                "message": "loadtest violation",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            },
                        )
                        stats["proctor_sent"] += 1
                    await sio.emit("proctor:leave", {"attemptId": "load-test-attempt"})
                    proctor_res.notes.append(
                        "fire-and-forget proctor events (no server ack event; server-side room join + "
                        "broadcast + violation name-resolution reads exercised)"
                    )
                except Exception:
                    proctor_res.fail()

            # Application-level ping -> pong round trips (deterministic acks).
            for i in range(ws_roundtrips):
                t2 = time.perf_counter()
                try:
                    await sio.emit("ping", {"seq": i, "t": t2})
                    await sio.wait_event("pong", timeout=pong_timeout)
                    rtt = (time.perf_counter() - t2) * 1000.0
                    rtt_res.add(rtt)
                    stats["rtt_ok"] += 1
                except Exception:
                    rtt_res.fail()
                    stats["rtt_err"] += 1
        finally:
            try:
                await sio.close()
            except Exception:
                pass

    t0 = time.perf_counter()
    delays = [i * (ramp / ws_clients) if ws_clients else 0.0 for i in range(ws_clients)]
    await asyncio.gather(*(one_client(i, d) for i, d in enumerate(delays)))
    wall = time.perf_counter() - t0

    print(
        f"\n[websocket] wall={wall:.2f}s clients={ws_clients} connected_ok={stats['connect_ok']} "
        f"connect_errors={stats['connect_err']} roundtrips_ok={stats['rtt_ok']} "
        f"roundtrip_errors={stats['rtt_err']} proctor_events_sent={stats['proctor_sent']} (ramp={ramp}s)"
    )
    return [connect_res, rtt_res, join_res, proctor_res]


# --------------------------------------------------------------------------- #
# Cleanup
# --------------------------------------------------------------------------- #
def cleanup_tokens() -> int:
    """Delete refresh_tokens rows created by this tool (marker user-agent)."""
    try:
        import psycopg
    except ImportError:
        print("cleanup: psycopg not available; delete manually:\n"
              "  DELETE FROM refresh_tokens WHERE user_agent = 'intellihire-loadtest/1.0';")
        return -1
    dsn = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/intellihire")
    with psycopg.connect(dsn, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM refresh_tokens WHERE user_agent = %s", (LOADTEST_UA,))
            n = cur.rowcount
    print(f"cleanup: deleted {n} refresh_tokens rows with user_agent={LOADTEST_UA!r}")
    return n


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description="IntelliHire local load test (httpx + socketio.AsyncClient)")
    ap.add_argument("--base", default="http://127.0.0.1:5010", help="target base URL (default http://127.0.0.1:5010)")
    ap.add_argument("--scenario", default="all", choices=["login", "dashboard", "exam", "code", "websocket", "all", "none"],
                    help="which scenario(s) to run (default all; 'none' only cleans up tokens)")
    ap.add_argument("--users", type=int, default=50, help="concurrent HTTP workers per scenario (default 50)")
    ap.add_argument("--requests", type=int, default=200, help="total requests per HTTP scenario (default 200)")
    ap.add_argument("--ramp", type=float, default=0.0, help="seconds to stagger worker/client start-up (default 0)")
    ap.add_argument("--ws-clients", type=int, default=100, help="concurrent websocket clients (default 100)")
    ap.add_argument("--ws-roundtrips", type=int, default=10, help="ping->pong round trips per client (default 10)")
    ap.add_argument("--timeout", type=float, default=30.0, help="per-request timeout seconds (default 30)")
    ap.add_argument("--allow-remote", action="store_true", help="permit a non-localhost target (you accept the risk)")
    ap.add_argument("--json", default=None, help="also dump raw percentile summary to this JSON file")
    ap.add_argument("--cleanup-tokens", action="store_true", help="after the run, DELETE refresh_tokens rows created by this tool")
    args = ap.parse_args()

    base = args.base.rstrip("/")
    host = urlparse(base).hostname or ""
    if host not in ("127.0.0.1", "localhost", "::1") and not args.allow_remote:
        print(f"Refusing to load-test non-localhost target {base!r} without --allow-remote.\n"
              "Load testing a shared/production instance can take it down; only proceed against a host you own,\n"
              "off-peak, and never with a shared public Judge0 configured (see scripts/LOAD_TESTING.md).")
        return 2

    scenarios = ["login", "dashboard", "exam", "code", "websocket"] if args.scenario == "all" else [args.scenario]

    if args.cleanup_tokens:
        # Cleanup runs FIRST so it works even when the target is unreachable.
        cleanup_tokens()

    if args.scenario == "none" or (args.cleanup_tokens and "--scenario" not in sys.argv):
        return 0

    all_results: Dict[str, List[Result]] = {}

    async def run() -> None:
        for name in scenarios:
            if name == "login":
                all_results["login"] = await scenario_login(base, args.users, args.requests, args.ramp, args.timeout)
            elif name == "dashboard":
                all_results["dashboard"] = await scenario_dashboard(base, args.users, args.requests, args.ramp, args.timeout)
            elif name == "exam":
                all_results["exam"] = await scenario_exam(base, args.users, args.requests, args.ramp, args.timeout)
            elif name == "code":
                all_results["code"] = await scenario_code(base, args.users, args.requests, args.ramp, args.timeout)
            elif name == "websocket":
                all_results["websocket"] = await scenario_websocket(base, args.ws_clients, args.ws_roundtrips, args.ramp, args.timeout)

    asyncio.run(run())

    for name, results in all_results.items():
        print_table(results, f"scenario: {name}")

    if args.json:
        dump = {}
        for name, results in all_results.items():
            rows = []
            for r in results:
                lats = r.latencies_ms
                rows.append({
                    "operation": r.label,
                    "requests": len(lats) + r.errors,
                    "errors": r.errors,
                    "p50_ms": round(percentile(lats, 50), 1) if lats else None,
                    "p95_ms": round(percentile(lats, 95), 1) if lats else None,
                    "p99_ms": round(percentile(lats, 99), 1) if lats else None,
                    "max_ms": round(max(lats), 1) if lats else None,
                    "notes": r.notes,
                })
            dump[name] = rows
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(dump, fh, indent=2)
        print(f"\nJSON summary written to {args.json}")

    if args.cleanup_tokens:
        cleanup_tokens()
    return 0


if __name__ == "__main__":
    sys.exit(main())

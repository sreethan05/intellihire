import base64
import httpx
import os
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, field_validator
from typing import Any, Dict, List, Optional

from .auth_router import get_current_user
from .rate_limit import limiter

router = APIRouter(prefix="/api/compiler", tags=["compiler"])

from .config import JUDGE0_API_KEY, JUDGE0_API_URL as JUDGE0_API, NODE_ENV

LANGUAGE_MAP = {
    "c": 50,
    "python": 71,
    "python3": 71,
    "py": 71,
    "javascript": 63,
    "js": 63,
    "node": 63,
    "cpp": 54,
    "c++": 54,
    "java": 62,
    "typescript": 74,
    "ts": 74,
}

MAX_CODE_LENGTH = 20000
MAX_STDIN_LENGTH = 5000
MAX_TEST_CASES = 50

# Cap concurrent Judge0 calls fired from a single /submit request instead of
# an unbounded fan-out (previously: one Judge0 call per test case, all firing
# effectively back-to-back with no ceiling on how many test cases a caller
# could submit).
CONCURRENCY_LIMIT = 5

# Global semaphore: caps total in-flight Judge0 requests across ALL users /
# requests, preventing a coordinated cohort from exhausting the Judge0 pool.
# Sized to a reasonable default for a shared ce.judge0.com instance; raise
# for a dedicated private instance.
import asyncio as _asyncio
_GLOBAL_JUDGE0_SEMAPHORE = _asyncio.Semaphore(int(os.getenv("JUDGE0_GLOBAL_CONCURRENCY", "10")))

# Hardened Sandbox Container Cgroups Resource Bounds
SANDBOX_MEMORY_LIMIT = os.getenv("SANDBOX_MEMORY_LIMIT", "128m")
SANDBOX_CPU_LIMIT = float(os.getenv("SANDBOX_CPU_LIMIT", "0.5"))
SANDBOX_NETWORK_MODE = os.getenv("SANDBOX_NETWORK_MODE", "none")


def parse_memory_limit_kb(mem_str: str) -> int:
    """Parse memory limit string (e.g. '128m', '256mb', '1g', '131072') to kilobytes (KB)."""
    try:
        s = str(mem_str).strip().lower()
        if s.endswith("gb") or s.endswith("g"):
            return int(float(s.rstrip("gb")) * 1024 * 1024)
        if s.endswith("mb") or s.endswith("m"):
            return int(float(s.rstrip("mb")) * 1024)
        if s.endswith("kb") or s.endswith("k"):
            return int(float(s.rstrip("kb")))
        return int(s)
    except (ValueError, TypeError):
        return 131072  # Fallback to 128 MB (131072 KB)


class RunCodeRequest(BaseModel):
    code: str
    language: str
    stdin: Optional[str] = ""

    @field_validator("code")
    @classmethod
    def validate_code_length(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("code must not be empty")
        if "\x00" in v:
            raise ValueError("code must not contain null bytes")
        if len(v) > MAX_CODE_LENGTH:
            raise ValueError(f"code exceeds maximum length of {MAX_CODE_LENGTH} characters")
        return v

    @field_validator("stdin")
    @classmethod
    def validate_stdin_length(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v) > MAX_STDIN_LENGTH:
            raise ValueError(f"stdin exceeds maximum length of {MAX_STDIN_LENGTH} characters")
        return v


class TestCase(BaseModel):
    input: Optional[str] = ""
    expected_output: Optional[str] = ""

    @field_validator("input", "expected_output", mode="before")
    @classmethod
    def coerce_none(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v)

    @field_validator("input", "expected_output")
    @classmethod
    def validate_field_length(cls, v: str) -> str:
        if v and len(v) > MAX_STDIN_LENGTH:
            raise ValueError(f"test case field exceeds maximum length of {MAX_STDIN_LENGTH} characters")
        return v


class SubmitCodeRequest(BaseModel):
    code: str
    language: str
    test_cases: List[TestCase]

    @field_validator("code")
    @classmethod
    def validate_code_length(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("code must not be empty")
        if "\x00" in v:
            raise ValueError("code must not contain null bytes")
        if len(v) > MAX_CODE_LENGTH:
            raise ValueError(f"code exceeds maximum length of {MAX_CODE_LENGTH} characters")
        return v

    @field_validator("test_cases")
    @classmethod
    def validate_test_case_count(cls, v: List[TestCase]) -> List[TestCase]:
        if not v:
            raise ValueError("at least one test case is required")
        if len(v) > MAX_TEST_CASES:
            raise ValueError(f"maximum {MAX_TEST_CASES} test cases per submission")
        return v


def b64encode(s: Optional[str]) -> str:
    if s is None:
        return ""
    return base64.b64encode(s.encode("utf-8")).decode("utf-8")


def b64decode(s: Optional[str]) -> str:
    if not s:
        return ""
    try:
        return base64.b64decode(s.encode("utf-8")).decode("utf-8", errors="replace")
    except Exception:
        return s


async def run_with_judge0(code: str, language: str, stdin: str = "", timeout: int = 5):
    lang_key = (language or "").lower().strip()
    lang_id = LANGUAGE_MAP.get(lang_key)
    if not lang_id:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {language}")

    if not JUDGE0_API:
        raise HTTPException(status_code=503, detail="Code execution is not configured")
    if NODE_ENV == "production" and "ce.judge0.com" in JUDGE0_API:
        raise HTTPException(status_code=503, detail="Production code execution requires a private Judge0 instance")

    url = f"{JUDGE0_API.rstrip('/')}/submissions?base64_encoded=true&wait=true"

    # Enforce resource bounds on sandbox container
    memory_limit_kb = parse_memory_limit_kb(SANDBOX_MEMORY_LIMIT)
    wall_time_limit = max(timeout * 2, timeout + 2)
    is_network_enabled = False if str(SANDBOX_NETWORK_MODE).lower() in ("none", "disabled", "false", "0") else True

    payload = {
        "source_code": b64encode(code),
        "language_id": lang_id,
        "stdin": b64encode(stdin),
        "cpu_time_limit": timeout,
        "cpu_extra_time": 1.0,
        "wall_time_limit": wall_time_limit,
        "memory_limit": memory_limit_kb,
        "max_file_size": 4096,  # 4 MB disk write limit
        "max_processes_and_or_threads": 60,  # Fork bomb protection
        "enable_network": is_network_enabled,
    }

    headers = {"Content-Type": "application/json"}
    if JUDGE0_API_KEY:
        if "rapidapi.com" in JUDGE0_API.lower():
            headers["X-RapidAPI-Key"] = JUDGE0_API_KEY
            parsed_host = httpx.URL(JUDGE0_API).host
            if parsed_host:
                headers["X-RapidAPI-Host"] = parsed_host
        else:
            headers["X-Auth-Token"] = JUDGE0_API_KEY

    # Acquire the global semaphore so total concurrent Judge0 calls across all
    # users stay bounded.
    async with _GLOBAL_JUDGE0_SEMAPHORE:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code not in [200, 201]:
                    raise HTTPException(status_code=500, detail="Judge0 request failed")

                data = response.json()

                # Handle asynchronous processing if Judge0 returns In Queue (1) or Processing (2)
                status_obj = data.get("status") or {}
                status_id = status_obj.get("id")
                token = data.get("token")
                if status_id in (1, 2) and token:
                    poll_url = f"{JUDGE0_API.rstrip('/')}/submissions/{token}?base64_encoded=true"
                    poll_start = _asyncio.get_event_loop().time()
                    max_poll_time = wall_time_limit + 3
                    while status_id in (1, 2) and (_asyncio.get_event_loop().time() - poll_start) < max_poll_time:
                        await _asyncio.sleep(0.5)
                        poll_resp = await client.get(poll_url, headers=headers)
                        if poll_resp.status_code in (200, 201):
                            data = poll_resp.json()
                            status_obj = data.get("status") or {}
                            status_id = status_obj.get("id")
                        else:
                            break

                return {
                    "stdout": b64decode(data.get("stdout")),
                    "stderr": b64decode(data.get("stderr")),
                    "compile_output": b64decode(data.get("compile_output")),
                    "status": status_obj.get("description", "Unknown"),
                    "status_id": status_id,
                }
            except httpx.RequestError as exc:
                raise HTTPException(status_code=500, detail=f"Judge0 request failed: {str(exc)}")


async def _run_with_concurrency_limit(test_cases: List[TestCase], code: str, language: str, limit: int):
    import asyncio

    semaphore = asyncio.Semaphore(limit)

    async def worker(tc: TestCase):
        async with semaphore:
            try:
                result = await run_with_judge0(code, language, tc.input or "")
                actual = (result.get("stdout") or "").replace("\r\n", "\n").strip()
                expected = (tc.expected_output or "").replace("\r\n", "\n").strip()
                status_desc = result.get("status", "Unknown")
                passed = (status_desc == "Accepted") and (actual == expected)
                return {
                    "input": tc.input or "",
                    "expected_output": expected,
                    "actual_output": actual,
                    "passed": passed,
                    "status": status_desc,
                    "error": result.get("stderr") or result.get("compile_output") or "",
                }
            except HTTPException as exc:
                return {
                    "input": tc.input or "",
                    "expected_output": (tc.expected_output or "").strip(),
                    "actual_output": "",
                    "passed": False,
                    "status": f"Error: {exc.detail}",
                    "error": str(exc.detail),
                }
            except Exception as exc:
                return {
                    "input": tc.input or "",
                    "expected_output": (tc.expected_output or "").strip(),
                    "actual_output": "",
                    "passed": False,
                    "status": "Error",
                    "error": str(exc),
                }

    return await asyncio.gather(*(worker(tc) for tc in test_cases))


@router.post("/run")
@limiter.limit("10/minute")
async def run_code(
    request: Request,
    req: RunCodeRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    result = await run_with_judge0(req.code, req.language, req.stdin or "")
    return {
        "output": result["stdout"],
        "error": result["stderr"],
        "compile_output": result["compile_output"],
        "status": result["status"],
    }


@router.post("/submit")
@limiter.limit("5/minute")
async def submit_code(
    request: Request,
    req: SubmitCodeRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    lang_key = (req.language or "").lower().strip()
    if lang_key not in LANGUAGE_MAP:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {req.language}")

    if not JUDGE0_API:
        raise HTTPException(status_code=503, detail="Code execution is not configured")

    results = await _run_with_concurrency_limit(req.test_cases, req.code, req.language, CONCURRENCY_LIMIT)

    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(req.test_cases)
    score = round((passed_count / total_count) * 100) if total_count > 0 else 0

    return {
        "results": results,
        "passed": passed_count,
        "total": total_count,
        "score": score,
    }

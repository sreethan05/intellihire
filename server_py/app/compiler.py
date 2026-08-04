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
    "javascript": 63,
    "js": 63,
    "cpp": 54,
    "c++": 54,
    "java": 62,
}

MAX_CODE_LENGTH = 20000
MAX_STDIN_LENGTH = 5000
MAX_TEST_CASES = 50

# Cap concurrent Judge0 calls fired from a single /submit request instead of
# an unbounded fan-out (previously: one Judge0 call per test case, all firing
# effectively back-to-back with no ceiling on how many test cases a caller
# could submit).
CONCURRENCY_LIMIT = 5

# Hardened Sandbox Container Cgroups Resource Bounds
SANDBOX_MEMORY_LIMIT = os.getenv("SANDBOX_MEMORY_LIMIT", "128m")
SANDBOX_CPU_LIMIT = float(os.getenv("SANDBOX_CPU_LIMIT", "0.5"))
SANDBOX_NETWORK_MODE = os.getenv("SANDBOX_NETWORK_MODE", "none")


class RunCodeRequest(BaseModel):
    code: str
    language: str
    stdin: Optional[str] = ""

    @field_validator("code")
    @classmethod
    def validate_code_length(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("code must not be empty")
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
    input: str = ""
    expected_output: str = ""

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


def b64encode(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("utf-8")


def b64decode(s: Optional[str]) -> str:
    if not s:
        return ""
    try:
        return base64.b64decode(s.encode("utf-8")).decode("utf-8")
    except Exception:
        return s


async def run_with_judge0(code: str, language: str, stdin: str = "", timeout: int = 5):
    lang_id = LANGUAGE_MAP.get(language.lower())
    if not lang_id:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {language}")

    if not JUDGE0_API:
        raise HTTPException(status_code=503, detail="Code execution is not configured")
    if NODE_ENV == "production" and "ce.judge0.com" in JUDGE0_API:
        raise HTTPException(status_code=503, detail="Production code execution requires a private Judge0 instance")

    url = f"{JUDGE0_API.rstrip('/')}/submissions?base64_encoded=true&wait=true"
    payload = {
        "source_code": b64encode(code),
        "language_id": lang_id,
        "stdin": b64encode(stdin),
        "cpu_time_limit": timeout,
        "cpu_extra_time": 1,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            headers = {"Content-Type": "application/json"}
            if JUDGE0_API_KEY:
                headers["X-Auth-Token"] = JUDGE0_API_KEY
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code not in [200, 201]:
                raise HTTPException(status_code=500, detail="Judge0 request failed")

            data = response.json()
            return {
                "stdout": b64decode(data.get("stdout")),
                "stderr": b64decode(data.get("stderr")),
                "compile_output": b64decode(data.get("compile_output")),
                "status": data.get("status", {}).get("description", "Unknown"),
            }
        except httpx.RequestError as exc:
            raise HTTPException(status_code=500, detail=f"Judge0 request failed: {str(exc)}")


async def _run_with_concurrency_limit(test_cases: List[TestCase], code: str, language: str, limit: int):
    import asyncio

    semaphore = asyncio.Semaphore(limit)

    async def worker(tc: TestCase):
        async with semaphore:
            result = await run_with_judge0(code, language, tc.input)
            actual = result["stdout"].strip()
            expected = tc.expected_output.strip()
            return {
                "input": tc.input,
                "expected_output": expected,
                "actual_output": actual,
                "passed": actual == expected,
                "status": result["status"],
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

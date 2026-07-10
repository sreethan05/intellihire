import base64
import httpx
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/compiler", tags=["compiler"])

JUDGE0_API = os.getenv("JUDGE0_API_URL", "https://ce.judge0.com")

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

class RunCodeRequest(BaseModel):
    code: str
    language: str
    stdin: Optional[str] = ""

class TestCase(BaseModel):
    input: str
    expected_output: str

class SubmitCodeRequest(BaseModel):
    code: str
    language: str
    test_cases: List[TestCase]

def b64encode(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("utf-8")

def b64decode(s: Optional[str]) -> str:
    if not s:
        return ""
    try:
        return base64.b64decode(s.encode("utf-8")).decode("utf-8")
    except Exception:
        return s

async def run_with_judge0(code: str, language: str, stdin: str = ""):
    lang_id = LANGUAGE_MAP.get(language.lower())
    if not lang_id:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {language}")

    url = f"{JUDGE0_API}/submissions?base64_encoded=true&wait=true"
    payload = {
        "source_code": b64encode(code),
        "language_id": lang_id,
        "stdin": b64encode(stdin),
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
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

@router.post("/run")
async def run_code(req: RunCodeRequest):
    result = await run_with_judge0(req.code, req.language, req.stdin)
    return {
        "output": result["stdout"],
        "error": result["stderr"],
        "compile_output": result["compile_output"],
        "status": result["status"],
    }

@router.post("/submit")
async def submit_code(req: SubmitCodeRequest):
    results = []
    for tc in req.test_cases:
        result = await run_with_judge0(req.code, req.language, tc.input)
        actual = result["stdout"].strip()
        expected = tc.expected_output.strip()
        is_passed = actual == expected
        results.append({
            "input": tc.input,
            "expected_output": expected,
            "actual_output": actual,
            "passed": is_passed,
            "status": result["status"],
        })

    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(req.test_cases)
    score = round((passed_count / total_count) * 100) if total_count > 0 else 0

    return {
        "results": results,
        "passed": passed_count,
        "total": total_count,
        "score": score
    }

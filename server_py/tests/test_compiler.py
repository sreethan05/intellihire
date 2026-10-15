import asyncio
import base64
import pytest
import httpx
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi import HTTPException
from pydantic import ValidationError

from app.compiler import (
    run_with_judge0,
    _run_with_concurrency_limit,
    run_code,
    submit_code,
    RunCodeRequest,
    SubmitCodeRequest,
    TestCase,
    parse_memory_limit_kb,
    b64encode,
    b64decode,
    MAX_CODE_LENGTH,
    MAX_STDIN_LENGTH,
    MAX_TEST_CASES,
)
from starlette.requests import Request
from app.rate_limit import limiter

# Tell pytest not to collect the Pydantic model TestCase as a test class
TestCase.__test__ = False


@pytest.fixture(autouse=True)
def disable_rate_limits():
    orig = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = orig


_req_counter = 0

def make_request() -> Request:
    global _req_counter
    _req_counter += 1
    return Request({
        "type": "http",
        "method": "POST",
        "path": f"/api/compiler/test_{_req_counter}",
        "headers": [],
        "client": (f"127.0.{_req_counter // 250}.{_req_counter % 250 + 1}", 8000),
    })


# ── 1. Helpers & Utility Tests ───────────────────────────────────────────────

def test_parse_memory_limit_kb():
    assert parse_memory_limit_kb("128m") == 128 * 1024
    assert parse_memory_limit_kb("128mb") == 128 * 1024
    assert parse_memory_limit_kb("256M") == 256 * 1024
    assert parse_memory_limit_kb("1g") == 1 * 1024 * 1024
    assert parse_memory_limit_kb("512k") == 512
    assert parse_memory_limit_kb("131072") == 131072
    # Invalid fallback
    assert parse_memory_limit_kb("invalid") == 131072


def test_b64encode_and_b64decode():
    assert b64encode(None) == ""
    assert b64encode("print(1)") == base64.b64encode(b"print(1)").decode("utf-8")
    assert b64decode("") == ""
    assert b64decode(None) == ""
    encoded = base64.b64encode(b"hello world").decode("utf-8")
    assert b64decode(encoded) == "hello world"

    # Non-utf8 binary bytes handled safely with replace
    raw_bytes = b"hello \xff world"
    encoded_binary = base64.b64encode(raw_bytes).decode("utf-8")
    decoded = b64decode(encoded_binary)
    assert "hello" in decoded and "world" in decoded


# ── 2. Request Validation Tests ──────────────────────────────────────────────

def test_run_code_request_validation():
    # Empty code rejected
    with pytest.raises(ValidationError):
        RunCodeRequest(code="", language="python")

    # Whitespace only code rejected
    with pytest.raises(ValidationError):
        RunCodeRequest(code="   ", language="python")

    # Null byte in code rejected
    with pytest.raises(ValidationError):
        RunCodeRequest(code="print('hello')\x00malicious", language="python")

    # Code exceeding max length rejected
    with pytest.raises(ValidationError):
        RunCodeRequest(code="a" * (MAX_CODE_LENGTH + 1), language="python")

    # Stdin exceeding max length rejected
    with pytest.raises(ValidationError):
        RunCodeRequest(code="print(1)", language="python", stdin="b" * (MAX_STDIN_LENGTH + 1))

    # Valid request
    req = RunCodeRequest(code="print(1)", language="python", stdin="123")
    assert req.code == "print(1)"
    assert req.stdin == "123"


def test_submit_code_request_validation():
    # Empty test cases list rejected
    with pytest.raises(ValidationError):
        SubmitCodeRequest(code="print(1)", language="python", test_cases=[])

    # More than MAX_TEST_CASES rejected
    with pytest.raises(ValidationError):
        SubmitCodeRequest(
            code="print(1)",
            language="python",
            test_cases=[TestCase(input="1", expected_output="1") for _ in range(MAX_TEST_CASES + 1)],
        )

    # Test case None coercion
    tc = TestCase(input=None, expected_output=None)
    assert tc.input == ""
    assert tc.expected_output == ""

    # Test case field exceeding max length rejected
    with pytest.raises(ValidationError):
        TestCase(input="a" * (MAX_STDIN_LENGTH + 1), expected_output="1")


# ── 3. Judge0 Execution Isolation & Sandboxing Tests ─────────────────────────

@pytest.mark.asyncio
async def test_run_with_judge0_unsupported_language():
    with pytest.raises(HTTPException) as exc:
        await run_with_judge0("print(5)", "invalid_lang")
    assert exc.value.status_code == 400
    assert "Unsupported language" in exc.value.detail


@pytest.mark.asyncio
async def test_run_with_judge0_not_configured():
    with patch("app.compiler.JUDGE0_API", ""):
        with pytest.raises(HTTPException) as exc:
            await run_with_judge0("print(5)", "python")
        assert exc.value.status_code == 503
        assert "Code execution is not configured" in exc.value.detail


@pytest.mark.asyncio
async def test_run_with_judge0_production_blocks_public_ce():
    with patch("app.compiler.NODE_ENV", "production"):
        with patch("app.compiler.JUDGE0_API", "https://ce.judge0.com"):
            with pytest.raises(HTTPException) as exc:
                await run_with_judge0("print(5)", "python")
            assert exc.value.status_code == 503
            assert "requires a private Judge0 instance" in exc.value.detail


@pytest.mark.asyncio
async def test_run_with_judge0_sandbox_bounds_and_payload():
    """Verify memory limit, CPU limit, wall time limit, process limits, and network isolation are sent to Judge0."""
    with patch("app.compiler.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "stdout": b64encode("output123\n"),
            "stderr": "",
            "compile_output": "",
            "status": {"id": 3, "description": "Accepted"},
        }
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        with patch("app.compiler.JUDGE0_API_KEY", "xxxx_test_key_xxxx"):
            with patch("app.compiler.SANDBOX_MEMORY_LIMIT", "128m"):
                with patch("app.compiler.SANDBOX_NETWORK_MODE", "none"):
                    result = await run_with_judge0("print('test')", "python", stdin="my_input", timeout=5)

        assert result["stdout"] == "output123\n"
        assert result["status"] == "Accepted"

        # Verify posted payload
        assert mock_instance.post.called
        call_args = mock_instance.post.call_args
        payload = call_args.kwargs["json"]
        headers = call_args.kwargs["headers"]

        # Resource bounds & security isolation verification
        assert payload["cpu_time_limit"] == 5
        assert payload["cpu_extra_time"] == 1.0
        assert payload["wall_time_limit"] >= 10  # Wall time kills runaway/sleeping processes
        assert payload["memory_limit"] == 128 * 1024  # 128MB in KB
        assert payload["max_file_size"] == 4096  # 4MB disk limit
        assert payload["max_processes_and_or_threads"] == 60  # Fork bomb protection
        assert payload["enable_network"] is False  # Network isolation: no SSRF or exfiltration
        assert payload["source_code"] == b64encode("print('test')")
        assert payload["stdin"] == b64encode("my_input")
        assert headers.get("X-Auth-Token") == "xxxx_test_key_xxxx"


@pytest.mark.asyncio
async def test_run_with_judge0_rapidapi_headers():
    """Verify RapidAPI headers when using rapidapi.com endpoint."""
    with patch("app.compiler.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "stdout": b64encode("done"),
            "stderr": "",
            "compile_output": "",
            "status": {"id": 3, "description": "Accepted"},
        }
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        with patch("app.compiler.JUDGE0_API", "https://judge0-ce.p.rapidapi.com"):
            with patch("app.compiler.JUDGE0_API_KEY", "rapid_xxxx_key"):
                await run_with_judge0("print(1)", "python")

        headers = mock_instance.post.call_args.kwargs["headers"]
        assert headers.get("X-RapidAPI-Key") == "rapid_xxxx_key"
        assert headers.get("X-RapidAPI-Host") == "judge0-ce.p.rapidapi.com"


# ── 4. Edge Cases: Timeout, Memory Limit, Errors, Polling ────────────────────

@pytest.mark.asyncio
async def test_run_with_judge0_infinite_loop_timeout():
    """Verify handling of Time Limit Exceeded (infinite loop or runaway execution)."""
    with patch("app.compiler.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "stdout": "",
            "stderr": "",
            "compile_output": "",
            "status": {"id": 5, "description": "Time Limit Exceeded"},
        }
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        result = await run_with_judge0("while True: pass", "python")
        assert result["status"] == "Time Limit Exceeded"
        assert result["stdout"] == ""


@pytest.mark.asyncio
async def test_run_with_judge0_memory_limit_exceeded():
    """Verify handling of Memory Limit Exceeded (large memory allocations)."""
    with patch("app.compiler.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "stdout": "",
            "stderr": b64encode("Killed\n"),
            "compile_output": "",
            "status": {"id": 12, "description": "Memory Limit Exceeded"},
        }
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        result = await run_with_judge0("a = [0] * (10**9)", "python")
        assert result["status"] == "Memory Limit Exceeded"
        assert "Killed" in result["stderr"]


@pytest.mark.asyncio
async def test_run_with_judge0_syntax_compilation_error():
    """Verify compilation error extraction."""
    with patch("app.compiler.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "stdout": "",
            "stderr": "",
            "compile_output": b64encode("main.cpp:2:1: error: expected ';' before '}' token"),
            "status": {"id": 6, "description": "Compilation Error"},
        }
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        result = await run_with_judge0("int main() { return 0 }", "cpp")
        assert result["status"] == "Compilation Error"
        assert "expected ';'" in result["compile_output"]


@pytest.mark.asyncio
async def test_run_with_judge0_runtime_error_nzec():
    """Verify runtime error (NZEC, exception) stderr extraction."""
    with patch("app.compiler.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "stdout": "",
            "stderr": b64encode("ZeroDivisionError: division by zero"),
            "compile_output": "",
            "status": {"id": 11, "description": "Runtime Error (NZEC)"},
        }
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        result = await run_with_judge0("1 / 0", "python")
        assert result["status"] == "Runtime Error (NZEC)"
        assert "ZeroDivisionError" in result["stderr"]


@pytest.mark.asyncio
async def test_run_with_judge0_polling_async_queue():
    """Verify that when Judge0 returns In Queue (1) or Processing (2), it polls until completed."""
    with patch("app.compiler.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()

        # Initial POST returns Processing with a token
        mock_post_resp = MagicMock()
        mock_post_resp.status_code = 201
        mock_post_resp.json.return_value = {
            "token": "test-poll-token-123",
            "status": {"id": 2, "description": "Processing"},
        }

        # Subsequent GET returns Accepted
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {
            "token": "test-poll-token-123",
            "stdout": b64encode("Async Result\n"),
            "stderr": "",
            "compile_output": "",
            "status": {"id": 3, "description": "Accepted"},
        }

        mock_instance.post = AsyncMock(return_value=mock_post_resp)
        mock_instance.get = AsyncMock(return_value=mock_get_resp)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        result = await run_with_judge0("print('async')", "python")
        assert result["status"] == "Accepted"
        assert result["stdout"] == "Async Result\n"
        assert mock_instance.get.called


@pytest.mark.asyncio
async def test_run_with_judge0_client_error():
    with patch("app.compiler.httpx.AsyncClient") as mock_client:
        mock_instance = AsyncMock()
        mock_instance.post.side_effect = httpx.RequestError("Connection refused")
        mock_client.return_value.__aenter__.return_value = mock_instance

        with pytest.raises(HTTPException) as exc:
            await run_with_judge0("print(5)", "python")
        assert exc.value.status_code == 500
        assert "Judge0 request failed" in exc.value.detail


@pytest.mark.asyncio
async def test_run_with_judge0_non_200_status():
    with patch("app.compiler.httpx.AsyncClient") as mock_client:
        mock_instance = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 502
        mock_instance.post.return_value = mock_response
        mock_client.return_value.__aenter__.return_value = mock_instance

        with pytest.raises(HTTPException) as exc:
            await run_with_judge0("print(5)", "python")
        assert exc.value.status_code == 500
        assert "Judge0 request failed" in exc.value.detail


# ── 5. Test Case Execution & Submit Endpoint Logic ───────────────────────────

@pytest.mark.asyncio
async def test_submit_code_all_passed():
    """Verify test cases execution when all test cases match and succeed."""
    mock_results = [
        {"stdout": "3\n", "stderr": "", "compile_output": "", "status": "Accepted"},
        {"stdout": "5\n", "stderr": "", "compile_output": "", "status": "Accepted"},
    ]

    with patch("app.compiler.run_with_judge0", side_effect=mock_results):
        mock_request = make_request()
        req = SubmitCodeRequest(
            code="a, b = map(int, input().split()); print(a + b)",
            language="python",
            test_cases=[
                TestCase(input="1 2", expected_output="3"),
                TestCase(input="2 3", expected_output="5"),
            ],
        )
        res = await submit_code(mock_request, req, user={"id": "user1"})

        assert res["passed"] == 2
        assert res["total"] == 2
        assert res["score"] == 100
        assert all(r["passed"] for r in res["results"])


@pytest.mark.asyncio
async def test_submit_code_mixed_results():
    """Verify test cases execution when 1 passes and 1 fails."""
    mock_results = [
        {"stdout": "3\n", "stderr": "", "compile_output": "", "status": "Accepted"},
        {"stdout": "4\n", "stderr": "", "compile_output": "", "status": "Accepted"},
    ]

    with patch("app.compiler.run_with_judge0", side_effect=mock_results):
        mock_request = make_request()
        req = SubmitCodeRequest(
            code="print(3)",
            language="python",
            test_cases=[
                TestCase(input="1 2", expected_output="3"),
                TestCase(input="2 3", expected_output="5"),  # Output will be 4 != 5
            ],
        )
        res = await submit_code(mock_request, req, user={"id": "user1"})

        assert res["passed"] == 1
        assert res["total"] == 2
        assert res["score"] == 50
        assert res["results"][0]["passed"] is True
        assert res["results"][1]["passed"] is False


@pytest.mark.asyncio
async def test_submit_code_infinite_loop_not_passed_even_with_empty_expected():
    """CRITICAL SECURITY/LOGIC CHECK:
    If a program runs an infinite loop (status: 'Time Limit Exceeded') and produces empty stdout,
    it MUST NOT pass even if the test case expected_output is empty!
    """
    mock_result = {"stdout": "", "stderr": "", "compile_output": "", "status": "Time Limit Exceeded"}

    with patch("app.compiler.run_with_judge0", return_value=mock_result):
        mock_request = make_request()
        req = SubmitCodeRequest(
            code="while True: pass",
            language="python",
            test_cases=[
                TestCase(input="", expected_output=""),
            ],
        )
        res = await submit_code(mock_request, req, user={"id": "user1"})

        assert res["passed"] == 0
        assert res["score"] == 0
        assert res["results"][0]["passed"] is False
        assert res["results"][0]["status"] == "Time Limit Exceeded"


@pytest.mark.asyncio
async def test_submit_code_compilation_error_not_passed():
    """CRITICAL: If compilation fails, test case must fail."""
    mock_result = {
        "stdout": "",
        "stderr": "",
        "compile_output": "SyntaxError: invalid syntax",
        "status": "Compilation Error",
    }

    with patch("app.compiler.run_with_judge0", return_value=mock_result):
        mock_request = make_request()
        req = SubmitCodeRequest(
            code="def invalid code",
            language="python",
            test_cases=[
                TestCase(input="", expected_output=""),
            ],
        )
        res = await submit_code(mock_request, req, user={"id": "user1"})

        assert res["passed"] == 0
        assert res["score"] == 0
        assert res["results"][0]["passed"] is False
        assert res["results"][0]["status"] == "Compilation Error"
        assert "SyntaxError" in res["results"][0]["error"]


@pytest.mark.asyncio
async def test_submit_code_crlf_normalization():
    """Windows CRLF vs Linux LF should not cause false negative test failures."""
    mock_result = {"stdout": "Line1\nLine2\n", "stderr": "", "compile_output": "", "status": "Accepted"}

    with patch("app.compiler.run_with_judge0", return_value=mock_result):
        mock_request = make_request()
        req = SubmitCodeRequest(
            code="print('Line1\\nLine2')",
            language="python",
            test_cases=[
                TestCase(input="", expected_output="Line1\r\nLine2"),
            ],
        )
        res = await submit_code(mock_request, req, user={"id": "user1"})

        assert res["passed"] == 1
        assert res["score"] == 100
        assert res["results"][0]["passed"] is True


@pytest.mark.asyncio
async def test_submit_code_unsupported_language_fails_fast():
    """Verify submit_code validates language upfront before launching worker coroutines."""
    mock_request = make_request()
    req = SubmitCodeRequest(
        code="print(1)",
        language="unsupported_lang_xyz",
        test_cases=[TestCase(input="1", expected_output="1")],
    )
    with pytest.raises(HTTPException) as exc:
        await submit_code(mock_request, req, user={"id": "user1"})
    assert exc.value.status_code == 400
    assert "Unsupported language" in exc.value.detail


@pytest.mark.asyncio
async def test_run_code_endpoint():
    """Verify /run endpoint response structure."""
    mock_result = {
        "stdout": "Hello world\n",
        "stderr": "",
        "compile_output": "",
        "status": "Accepted",
    }

    with patch("app.compiler.run_with_judge0", return_value=mock_result):
        mock_request = make_request()
        req = RunCodeRequest(code="print('Hello world')", language="python")
        res = await run_code(mock_request, req, user={"id": "user1"})

        assert res["output"] == "Hello world\n"
        assert res["error"] == ""
        assert res["compile_output"] == ""
        assert res["status"] == "Accepted"

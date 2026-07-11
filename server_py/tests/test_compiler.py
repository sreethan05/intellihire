import pytest
import httpx
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from app.compiler import run_with_judge0

@pytest.mark.asyncio
async def test_run_with_judge0_unsupported_language():
    with pytest.raises(HTTPException) as exc:
        await run_with_judge0("print(5)", "invalid_lang")
    assert exc.value.status_code == 400
    assert "Unsupported language" in exc.value.detail

@pytest.mark.asyncio
async def test_run_with_judge0_client_error():
    with patch("app.compiler.httpx.AsyncClient") as mock_client:
        mock_instance = MagicMock()
        # Raise httpx.RequestError as expected by the try-except handler
        mock_instance.post.side_effect = httpx.RequestError("HTTP Error")
        mock_client.return_value.__aenter__.return_value = mock_instance
        
        with pytest.raises(HTTPException) as exc:
            await run_with_judge0("print(5)", "python")
        assert exc.value.status_code == 500
        assert "Judge0 request failed" in exc.value.detail

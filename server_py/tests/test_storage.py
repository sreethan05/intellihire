import pytest
from unittest.mock import MagicMock, patch
from app.storage import upload_file, delete_file, storage_service

@pytest.mark.asyncio
async def test_upload_file_dummy():
    # When NODE_ENV is test or s3_client is None, it should return a dummy path
    with patch("app.storage.is_test", True):
        result = await upload_file("test_key.txt", b"hello world", "text/plain")
        assert "/dummy-storage/" in result
        assert "test_key.txt" in result

@pytest.mark.asyncio
async def test_delete_file_dummy():
    # Should not raise exception
    with patch("app.storage.is_test", True):
        await delete_file("test_key.txt")

def test_storage_service_interface():
    assert "upload_file" in storage_service
    assert "delete_file" in storage_service

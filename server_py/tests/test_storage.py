import pytest
from unittest.mock import MagicMock, patch
from app.storage import upload_file, delete_file, storage_service, validate_storage_key


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
    assert "validate_storage_key" in storage_service


@pytest.mark.asyncio
async def test_storage_rejects_path_traversal():
    with pytest.raises(ValueError, match="Path traversal detected"):
        await upload_file("../../etc/passwd", b"bad", "text/plain")

    with pytest.raises(ValueError, match="Path traversal detected"):
        await delete_file("../secret.txt")

    with pytest.raises(ValueError, match="Path traversal detected"):
        validate_storage_key("uploads/../../passwords.txt")


def test_storage_rejects_null_byte():
    with pytest.raises(ValueError, match="null byte"):
        validate_storage_key("file.txt\x00.exe")


def test_storage_rejects_empty_key():
    with pytest.raises(ValueError, match="non-empty string"):
        validate_storage_key("")

    with pytest.raises(ValueError, match="non-empty string"):
        validate_storage_key(None)


@pytest.mark.asyncio
async def test_upload_file_s3_success():
    mock_s3 = MagicMock()
    with patch("app.storage.is_test", False), patch("app.storage.s3_client", mock_s3):
        res = await upload_file("resumes/candidate1.pdf", b"%PDF-1.4", "application/pdf")
        assert "candidate1.pdf" in res
        mock_s3.put_object.assert_called_once()


@pytest.mark.asyncio
async def test_delete_file_s3_success():
    mock_s3 = MagicMock()
    with patch("app.storage.is_test", False), patch("app.storage.s3_client", mock_s3):
        await delete_file("resumes/candidate1.pdf")
        mock_s3.delete_object.assert_called_once()


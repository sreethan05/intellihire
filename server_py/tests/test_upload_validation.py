import pytest
from fastapi import HTTPException, UploadFile

from app.upload_validation import read_validated_pdf, sanitize_upload_filename


def make_upload(filename: str, content_type: str, content: bytes) -> UploadFile:
    from io import BytesIO

    return UploadFile(filename=filename, file=BytesIO(content), headers={"content-type": content_type})


@pytest.mark.asyncio
async def test_pdf_upload_requires_pdf_signature():
    with pytest.raises(HTTPException, match="valid PDF"):
        await read_validated_pdf(make_upload("resume.pdf", "application/pdf", b"not-a-pdf"))


@pytest.mark.asyncio
async def test_pdf_upload_rejects_oversized_files():
    with pytest.raises(HTTPException, match="5 MB"):
        await read_validated_pdf(make_upload("resume.pdf", "application/pdf", b"%PDF-" + b"a" * (5 * 1024 * 1024)))


@pytest.mark.asyncio
async def test_pdf_upload_accepts_valid_pdf():
    content = b"%PDF-1.7 valid content"
    data = await read_validated_pdf(make_upload("resume.pdf", "application/pdf", content))
    assert data == content


@pytest.mark.asyncio
async def test_pdf_upload_accepts_pdf_with_charset_parameter():
    content = b"%PDF-1.4 header"
    data = await read_validated_pdf(make_upload("doc.pdf", "application/pdf; charset=utf-8", content))
    assert data == content


@pytest.mark.asyncio
async def test_pdf_upload_rejects_non_pdf_extension():
    with pytest.raises(HTTPException, match="Only PDF files are accepted"):
        await read_validated_pdf(make_upload("resume.exe", "application/pdf", b"%PDF-1.4"))


@pytest.mark.asyncio
async def test_pdf_upload_rejects_non_pdf_mime_type():
    with pytest.raises(HTTPException, match="must have a PDF content type"):
        await read_validated_pdf(make_upload("resume.pdf", "image/png", b"%PDF-1.4"))


@pytest.mark.asyncio
async def test_pdf_upload_rejects_path_traversal():
    with pytest.raises(HTTPException, match="Path traversal characters detected"):
        await read_validated_pdf(make_upload("../../etc/passwd.pdf", "application/pdf", b"%PDF-1.4"))


@pytest.mark.asyncio
async def test_pdf_upload_rejects_null_byte_filename():
    with pytest.raises(HTTPException, match="null byte"):
        await read_validated_pdf(make_upload("resume.pdf\x00.exe", "application/pdf", b"%PDF-1.4"))


def test_sanitize_upload_filename():
    assert sanitize_upload_filename("my_resume.pdf") == "my_resume.pdf"
    assert sanitize_upload_filename(None) == "unnamed.pdf"
    with pytest.raises(HTTPException):
        sanitize_upload_filename("../evil.pdf")
    with pytest.raises(HTTPException):
        sanitize_upload_filename("evil.pdf\x00")

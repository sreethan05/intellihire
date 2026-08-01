import pytest
from fastapi import HTTPException, UploadFile

from app.upload_validation import read_validated_pdf


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

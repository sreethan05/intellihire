import os
import re
from pathlib import Path

from fastapi import HTTPException, UploadFile


MAX_PDF_UPLOAD_BYTES = 5 * 1024 * 1024
PDF_CONTENT_TYPES = {"application/pdf", "application/x-pdf"}


def sanitize_upload_filename(filename: str) -> str:
    """
    Sanitize uploaded filename to prevent directory traversal and null-byte injection.
    Extracts base filename and strips path traversal characters.
    """
    if not filename:
        return "unnamed.pdf"
    if "\x00" in filename:
        raise HTTPException(status_code=400, detail="Filename contains null byte")

    # Normalize slashes and extract basename
    normalized = filename.replace("\\", "/")
    parts = normalized.split("/")
    if any(part == ".." for part in parts):
        raise HTTPException(status_code=400, detail="Path traversal characters detected in filename")

    base = os.path.basename(normalized).strip()
    if not base or base.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid filename")

    return base


async def read_validated_pdf(upload: UploadFile) -> bytes:
    raw_filename = upload.filename or ""
    sanitized_filename = sanitize_upload_filename(raw_filename)

    if Path(sanitized_filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    raw_ct = (upload.content_type or "").split(";")[0].strip().lower()
    if raw_ct not in PDF_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Uploaded file must have a PDF content type")

    chunks: list[bytes] = []
    size = 0
    while chunk := await upload.read(64 * 1024):
        size += len(chunk)
        if size > MAX_PDF_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="PDF uploads are limited to 5 MB")
        chunks.append(chunk)

    data = b"".join(chunks)
    if len(data) < 5 or not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded content is not a valid PDF")
    return data

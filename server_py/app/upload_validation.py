from pathlib import Path

from fastapi import HTTPException, UploadFile


MAX_PDF_UPLOAD_BYTES = 5 * 1024 * 1024
PDF_CONTENT_TYPES = {"application/pdf", "application/x-pdf"}


async def read_validated_pdf(upload: UploadFile) -> bytes:
    filename = upload.filename or ""
    if Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    if upload.content_type not in PDF_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Uploaded file must have a PDF content type")

    chunks: list[bytes] = []
    size = 0
    while chunk := await upload.read(64 * 1024):
        size += len(chunk)
        if size > MAX_PDF_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="PDF uploads are limited to 5 MB")
        chunks.append(chunk)

    data = b"".join(chunks)
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded content is not a valid PDF")
    return data

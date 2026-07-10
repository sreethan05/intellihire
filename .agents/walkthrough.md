# Python Gateway Backend & AI Service Migration Walkthrough

We have successfully migrated the backend architecture to run on Python (FastAPI) as the primary gateway (port 5000) and proxy non-migrated REST and WebSocket services (Express) on port 5001. Core computational tasks—such as code running/compilation, AI resume parsing, OCR text extraction, and remote proctoring webcam analysis—are processed natively in Python.

## Changes Made

### 1. Python Gateway Server Setup (`server_py/`)
- Created `server_py/requirements.txt` with FastAPI, Uvicorn, httpx, pdfplumber, and pytesseract.
- Created `server_py/app/config.py` to parse environment variables from the root `.env`.
- Implemented `server_py/app/main.py` configuring a reverse proxy gateway with:
  - CORS configurations.
  - Transparent HTTP request forwarding to port 5001.
  - WebSocket proxying for real-time Socket.IO communication.
  - Request header sanitization and duplicate response headers preservation (e.g. duplicate `Set-Cookie` headers for CSRF and session management).

### 2. Native Python AI & Proctoring Services (`server_py/app/ai.py`)
- Implemented `/api/ai/resume-parse` natively to process candidate resume text and extract matching job skills.
- Implemented `/internal/ocr` natively to perform PDF text extraction (using `pdfplumber`) and image OCR text extraction (using `pytesseract`), parsing names, roll numbers, branches, CGPAs, and graduation years. If confidence is low, it calls Groq Chat Completions for AI-based error correction.
- Implemented `/internal/proctoring/verify` natively to run webcam snapshot audits (e.g. check for single person, multiple people, looking away, phone detection) using Groq Vision API.
- Implemented `/internal/ai/generate-text` and `/internal/ai/generate-json` endpoints for other general AI generation needs.

### 3. Native Python Compiler Service (`server_py/app/compiler.py`)
- Implemented `/api/compiler/run` and `/api/compiler/submit` natively in Python to send code execution requests to Judge0 CE or private instance.

### 4. Express Server Route & Config Port Update
- Updated default startup port to `5001` in [index.ts](file:///c:/Users/USER/OneDrive/Desktop/intellihire/server/src/index.ts).
- Rewrote [ocr.ts](file:///c:/Users/USER/OneDrive/Desktop/intellihire/server/src/lib/ocr.ts) to delegate all OCR extraction to the Python server `/internal/ocr` loopback endpoint.
- Rewrote [ai.ts](file:///c:/Users/USER/OneDrive/Desktop/intellihire/server/src/lib/ai.ts) to delegate all webcam proctoring checks, text/JSON generation, and marksheet validation to Python `/internal/` endpoints.

### 5. Concurrent Starting Script (`package.json`)
- Updated root `package.json` with scripts to concurrently launch:
  - `server:py` (FastAPI gateway on port 5000 bound to `0.0.0.0` to support both IPv4 and IPv6 on Windows).
  - `server:node` (Express helper on port 5001).
  - `client` (Vite dev server on port 3000).

---

## Verification Results

All automated tests passed successfully:
- **Client Unit Tests**: 18 tests passed cleanly (`npm --prefix client run test`).
- **Server Unit Tests**: 179 tests passed cleanly (`npm --prefix server run test`).
- **Playwright E2E Integration Tests**: 17 tests passed cleanly (`npm run test:e2e`), verifying all recruiter, candidate, admin, TPO, proctoring, and compilation workflows run perfectly through the Python gateway.

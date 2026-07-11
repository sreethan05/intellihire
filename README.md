# IntelliHire Platform

IntelliHire is a full-stack recruitment, assessment, and proctoring platform for Admin, TPO, Recruiter, and Candidate workflows.

The frontend remains React + TypeScript. The backend runtime is now Python/FastAPI in `server_py`.

## Features

- Candidate exams with MCQ, coding, results, certificates, and profile onboarding.
- Recruiter hiring drives, candidate management, analytics, offers, proctoring review, and AI interview scheduling.
- TPO student upload, verification, placement readiness, and college analytics.
- Admin account creation, platform analytics, and system health views.
- FastAPI REST API, Socket.IO-compatible realtime events, PostgreSQL, Redis fallback behavior, Judge0 code execution, Groq-powered AI/OCR/proctoring helpers, and local file uploads.

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, Monaco Editor.
- Backend: Python 3.11, FastAPI, Uvicorn, python-socketio.
- Database: PostgreSQL.
- Cache/realtime support: Redis when configured, in-process fallback otherwise.
- AI/OCR: Groq APIs, pdfplumber, pytesseract.
- Code execution: Judge0 CE API.

## Project Structure

```text
intellihire/
├── client/          # React/Vite frontend
├── server_py/       # Python/FastAPI backend
│   ├── app/         # API routers, DB wrapper, Socket.IO app, helpers
│   └── requirements.txt
├── server/          # Legacy TypeScript backend reference and frontend build output
├── database/        # SQL migrations and seed data
├── e2e/             # Playwright tests
├── Dockerfile       # Python production image with frontend build stage
└── package.json     # Workspace scripts for frontend + Python backend
```

## Setup

```bash
npm install
npm --prefix client install
python -m venv server_py/.venv
server_py/.venv/Scripts/python -m pip install -r server_py/requirements.txt
```

Create `.env` from `.env.example` and set at least:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/intellihire
JWT_SECRET=change-this-to-a-long-random-secret-min-32-chars
PORT=5000
VITE_API_URL=http://localhost:3000/api
```

Start backing services:

```bash
docker compose up -d
```

Apply database migrations with your preferred PostgreSQL client using files in `database/` in numeric order.

## Run

Development:

```bash
npm run dev
```

On Windows PowerShell, if script execution policy blocks `npm`, use:

```powershell
npm.cmd run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- Health: http://localhost:5000/api/health

Production-style local run:

```bash
npm run build
npm run start
```

## Docker

```bash
docker build -t intellihire .
docker run -p 5000:5000 --env-file .env intellihire
```

The Docker image builds the React frontend, installs Python backend dependencies, and serves the SPA plus API from FastAPI.

## Tests

```bash
npm --prefix client run check
npm run test:e2e
```

Python syntax/import sanity:

```bash
server_py/.venv/Scripts/python -m compileall server_py/app
server_py/.venv/Scripts/python -c "from server_py.app.main import app; print(len(app.routes))"
```

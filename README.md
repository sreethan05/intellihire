# IntelliHire Application

**IntelliHire** is a full‑stack recruitment platform supporting Admin, TPO, Recruiter, and Candidate workflows. It provides exam creation, coding assessments, AI‑powered voice interviews, real‑time proctoring, and analytics.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Features Overview](#features-overview)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Docker](#docker)
- [Contributing](#contributing)
- [License](#license)

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Express 5 with TypeScript (`tsx`), PostgreSQL
- **AI Services**: Groq (LLM) and local Ollama (optional)
- **Code Execution**: Monaco editor + Judge0 CE public API (or private instance)
- **Real‑time**: Socket.IO for proctoring snapshots
- **Email**: Nodemailer (SMTP)
- **Logging & Monitoring**: Pino, Sentry (optional)
- **API Docs**: Swagger / OpenAPI

---

## Project Structure

```
intellihire/
├─ client/                     # React frontend
│   ├─ src/                    # Application source code
│   ├─ public/                 # Static assets
│   └─ vite.config.ts
├─ server/                     # Express backend
│   ├─ src/                    # Server source code
│   │   ├─ lib/                # Utilities (AI, validation, etc.)
│   │   ├─ routes/             # API route definitions
│   │   └─ app.ts              # Express app bootstrap
│   ├─ tests/                  # Jest / Supertest unit & integration tests
│   └─ tsconfig.json
├─ database/                   # SQL schema and seed files
│   ├─ postgres-schema.sql
│   ├─ schema-question-bank.sql
│   └─ seed-question-bank.sql
├─ docs/                       # Supplemental documentation
│   ├─ ARCHITECTURE.md
│   ├─ SECURITY.md
│   ├─ VALIDATION_TEST_CASES.md
│   └─ SCREENSHOTS.md
├─ e2e/                        # Playwright end‑to‑end tests
├─ .env.example                # Example environment file
├─ README.md                   # You are here
└─ package.json                # Root scripts for monorepo
```

---

## Setup & Installation

1. **Prerequisites**
   - Node.js (v18+ recommended)
   - PostgreSQL instance
   - (Optional) Docker for containerised deployment
2. **Database**
   ```bash
   psql -f database/postgres-schema.sql
   psql -f database/schema-question-bank.sql
   psql -f database/seed-question-bank.sql
   ```
3. **Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your values (see section below)
   ```
4. **Install dependencies**
   ```bash
   npm install                     # Root dependencies (scripts)
   npm --prefix client install     # Front‑end deps
   npm --prefix server install     # Back‑end deps
   ```

---

## Environment Variables

```env
# Core configuration
VITE_API_URL=http://localhost:5000/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/intellihire
JWT_SECRET=change-this-to-a-long-random-secret-min-32-chars
PORT=5000
NODE_ENV=development

# Optional AI services (only required for voice interviews & proctoring)
GROQ_API_KEY=your-groq-key
GROQ_MODEL=llama-3.3-70b-versatile

# Judge0 (code execution) – defaults to the public CE instance
JUDGE0_API_URL=https://ce.judge0.com

# Email (SMTP) – optional for notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="IntelliHire <noreply@intellihire.com>"

# Sentry (error tracking) – optional
SENTRY_DSN=https://your-sentry-dsn.ingest.sentry.io/project-id

# Logging level (info, debug, warn, error)
LOG_LEVEL=info
```

> **Note**: The application works fully without any AI keys for the core exam pipeline. Only voice‑interview grading, proctoring snapshot analysis, and optional AI chat features need Groq/Ollama.

---

## Running the Application

### Development (client + server concurrently)
```bash
npm run dev
```
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

### Individual services
```bash
npm run server        # Server only
npm run server:dev    # Server with hot‑reload
npm run client        # Client only
```

### Production build & start
```bash
npm run build   # Builds the client bundle
npm run start   # Starts the backend and serves static client assets
```

---

## Features Overview

- **User Roles**: Admin, TPO, Recruiter, Candidate
- **Exam Pipeline**: Deterministic, zero‑API question selection with variation engine
- **Coding Execution**: Monaco editor + Judge0 CE (or private instance)
- **AI Voice Interview**: Groq/Llama‑3.3 for transcript generation and scoring
- **Real‑time Proctoring**: Socket.IO streams snapshots; AI analysis via Groq/Ollama
- **Analytics Dashboard**: System health metrics, usage statistics
- **Email Notifications**: Interview invites, result alerts
- **Security**: JWT auth, bcrypt passwords, rate limiting, Helmet headers

---

## API Documentation

Interactive Swagger UI is available at:
- Local development: `http://localhost:5000/api/docs`
- JSON spec: `http://localhost:5000/api/docs/json`

---

## Testing

```bash
npm run test       # Unit & integration tests (Jest)
npm run test:e2e   # End‑to‑end tests (Playwright)
```

Tests cover validation, authentication, health endpoints, and core business logic.

---

## Docker

```bash
docker build -t intellihire .
docker run -p 5000:5000 --env-file .env intellihire
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/awesome-feature`)
3. Ensure linting and type‑checking pass (`npm run lint && npm run check`)
4. Add or update tests as needed
5. Submit a Pull Request

---

## License

This project is licensed under the MIT License – see the `LICENSE` file for details.

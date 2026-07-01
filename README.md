# IntelliHire App

Active full-stack recruitment platform for Admin, TPO, Recruiter, and Candidate workflows.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Express 5 with TypeScript via `tsx`
- PostgreSQL
- IntelliHire Exam Pipeline — zero-API, intelligent question bank with deterministic variation engine
- JWT auth with bcrypt password hashes
- Monaco editor and Judge0 CE public API for code execution
- Gemini API for marksheet scanning and proctoring (optional)
- Groq API for AI voice interviews and test evaluation (optional)
- Socket.IO for real-time proctoring
- Nodemailer for email notifications
- Pino for structured logging
- Sentry for error tracking
- Swagger/OpenAPI for API documentation

## Required Setup

1. Create a PostgreSQL database.
2. Run `database/postgres-schema.sql` against that database.
3. Run `database/schema-question-bank.sql` to add question metadata columns.
4. Run `database/seed-question-bank.sql` to seed the question bank (500+ MCQs, 20+ coding problems).
5. Copy `.env.example` to `.env`.
6. Fill:

```env
VITE_API_URL=http://localhost:5000/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/intellihire
JWT_SECRET=change-this-to-a-long-random-secret-min-32-chars
PORT=5000
NODE_ENV=development
```

### Optional Environment Variables

```env
# Gemini API — required for marksheet scanning and proctoring snapshot analysis
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.0-flash

# Groq API — required for AI voice interviews and test evaluation (NOT for exams)
GROQ_API_KEY=your-groq-key
GROQ_MODEL=llama-3.3-70b-versatile

# Private Judge0 instance (recommended for production)
JUDGE0_API_URL=https://your-judge0-instance.com

# Email notifications (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=IntelliHire <noreply@intellihire.com>

# Error tracking
SENTRY_DSN=https://your-sentry-dsn.ingest.sentry.io/project-id

# Logging verbosity
LOG_LEVEL=info
```

## Run

From this folder:

```bash
npm install          # Install root dependencies
npm --prefix client install
npm --prefix server install
npm run dev          # Start both client and server
```

Frontend runs on `http://localhost:3000`.
Backend runs on `http://localhost:5000`.

## Production-Style Local Run

```bash
npm run build
npm run start
```

Open `http://localhost:5000`.

## Default Admin

After running `database/postgres-schema.sql`:

```text
Email: admin@intellihire.com
Password: admin123
```

Change this before real deployment.

## Main Flow

1. Admin logs in and creates colleges, TPOs, and recruiters.
2. TPO uploads students manually or scans marksheets with Gemini.
3. Recruiter creates exams, coding questions, drives, and assigns exams.
4. Candidate logs in, completes onboarding, takes assigned exams, and views results.
5. Recruiter reviews results, proctoring events, analytics, and voice interview feedback.

## IntelliHire Exam Pipeline (Zero-API Exam Generation)

IntelliHire uses a **local, deterministic question-selection engine** for exam generation that outperforms cloud LLM APIs:

- **Zero API calls** — no Groq, no Gemini, no Ollama needed for exams
- **500+ verified MCQs** across 12 topics (Python, JavaScript, Java, C++, SQL, DSA, OS, DBMS, Networks, OOP, Web, Aptitude)
- **20+ verified coding problems** across 4 difficulty levels (easy, medium, hard, very hard)
- **Intelligent selection** based on topic match, difficulty profile, Bloom taxonomy, concept diversity, and recency
- **Deterministic variation engine** creates fresh versions of questions by shuffling options, rephrasing, and adjusting constraints
- **Balanced topic coverage** ensures exams cover multiple subtopics, not random repetition
- **<50ms response time** vs. 2–10 seconds for API generation
- **100% answer accuracy** vs. AI hallucination risk

### Difficulty Levels

| Level | Bloom Taxonomy | Concepts per Question | Estimated Time |
|---|---|---|---|
| **Easy** | remember, understand | 1 | 30–90 sec |
| **Medium** | understand, apply | 2 | 60–180 sec |
| **Hard** | apply, analyze | 2–3 | 120–300 sec |
| **Very Hard** | analyze, evaluate, create | 3–5 | 180–600 sec |

The pipeline accepts flexible difficulty names: `easy`, `medium`, `hard`, `tough`, `very hard`, `very tough` — all are normalized automatically.

### How It Works

1. Recruiter selects topic, difficulty, and question count
2. Pipeline queries the local question bank (PostgreSQL)
3. Multi-dimensional scoring ranks questions by topic relevance, difficulty match, concept diversity, and recency
4. Weighted random sampling selects the final set (avoids repetition)
5. Variation engine applies deterministic transformations (option shuffling, rephrasing, numeric adjustments)
6. Selected questions are marked as "used" to ensure rotation
7. Result is returned instantly with metadata (topic coverage, Bloom distribution, estimated duration)

### API Keys Still Required For

- **Gemini API** — marksheet scanning (OCR + data extraction)
- **Gemini or Groq API** — webcam proctoring snapshot analysis
- **Groq API** — AI voice interview grading and test evaluation
- **Exams work without any API keys** — fully powered by the local pipeline

## API Documentation

Interactive API docs are available at:
- Local: `http://localhost:5000/api/docs`
- JSON spec: `http://localhost:5000/api/docs/json`

## WebSocket Real-Time Proctoring

Socket.IO is available on the same port as the HTTP server. The `useProctorSocket` hook in `client/src/hooks/use-proctor-socket.ts` handles:
- Candidate joining their exam attempt room
- Recruiter joining the monitoring room
- Real-time snapshot and violation broadcasts

## Scripts

```bash
npm run dev           # Client + server concurrently
npm run server        # Server only
npm run server:dev    # Server with hot reload
npm run client        # Client only
npm run check         # TypeScript type check (client + server)
npm run lint          # ESLint (client + server)
npm run test          # Server unit/integration tests
npm run test:e2e      # Playwright E2E tests
npm run build         # Production frontend build
npm run start         # Production server start
```

## Security Features

- JWT authentication with 24h expiration
- bcrypt password hashing
- Rate limiting (100 req/15min general, 10 login/15min)
- Helmet security headers
- Environment-aware CORS
- Zod input validation
- Centralized error handling with Sentry integration
- No hardcoded secrets (app crashes if JWT_SECRET is missing)

## Testing

- **Unit tests**: `server/src/lib/validation.test.ts`, `server/tests/*.test.ts`
- **Integration tests**: `server/tests/health.test.ts`, `server/tests/auth.test.ts`
- **E2E tests**: `e2e/*.spec.ts` (Playwright)
- **CI/CD**: GitHub Actions runs lint, type check, tests, build, and E2E on every PR

## Docker

```bash
docker build -t intellihire .
docker run -p 5000:5000 --env-file .env intellihire
```

## Project Documentation

Use these files for report, PPT, and viva preparation:

- `docs/SCREENSHOTS.md` - polished UI screenshot checklist and file naming guide.
- `docs/VALIDATION_TEST_CASES.md` - simple validation rules and test cases.
- `docs/SECURITY.md` - explanation of password hashing, JWT authentication, and role-based access control.
- `docs/ARCHITECTURE.md` - architecture diagram, modules, and data flow.

## Notes

- The compiler route uses the public Judge0 CE endpoint by default: `https://ce.judge0.com`. Set `JUDGE0_API_URL` to use a private instance.
- Use `DATABASE_URL` or the `PGHOST`/`PGUSER`/`PGDATABASE` variables to connect to PostgreSQL.
- Local uploaded interview audio is stored under `FILE_STORAGE_DIR` and served from `/uploads`.
- Email notifications are silently skipped if SMTP is not configured.
- Sentry error tracking is silently disabled if `SENTRY_DSN` is not set.
- **Exams do NOT require any AI API keys** — the IntelliHire Pipeline uses the local question bank. Groq/Gemini are only needed for marksheet scanning, proctoring, and AI voice interviews.
- To re-seed or extend the question bank, edit `database/seed-question-bank.sql` and run it against your PostgreSQL database.

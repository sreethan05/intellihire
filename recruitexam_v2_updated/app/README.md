# IntelliHire App

Active full-stack recruitment platform for Admin, TPO, Recruiter, and Candidate workflows.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Express 5 with TypeScript via `tsx`
- Supabase PostgreSQL
- JWT auth with bcrypt password hashes
- Monaco editor and Judge0 CE public API for code execution
- Gemini API for marksheet scanning and optional AI generation

## Required Setup

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env`.
4. Fill:

```env
VITE_API_URL=http://localhost:5000/api
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=change-this-to-a-long-random-secret
PORT=5000
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.0-flash
```

`GEMINI_API_KEY` is optional for login, dashboards, exams, and compiler. It is required for marksheet scanning and real AI generation.

## Run

From this folder:

```bash
npm install
npm run dev:full
```

Or from the workspace root:

```bash
npm run dev
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

After running `supabase-schema.sql`:

```text
Email: admin@recruitexam.com
Password: admin123
```

Change this before real deployment.

## Main Flow

1. Admin logs in and creates colleges, TPOs, and recruiters.
2. TPO uploads students manually or scans marksheets with Gemini.
3. Recruiter creates exams, coding questions, drives, and assigns exams.
4. Candidate logs in, completes onboarding, takes assigned exams, and views results.
5. Recruiter reviews results, proctoring events, analytics, and voice interview feedback.

## Project Documentation

Use these files for report, PPT, and viva preparation:

- `docs/SCREENSHOTS.md` - polished UI screenshot checklist and file naming guide.
- `docs/VALIDATION_TEST_CASES.md` - simple validation rules and test cases.
- `docs/SECURITY.md` - explanation of password hashing, JWT authentication, and role-based access control.
- `docs/ARCHITECTURE.md` - architecture diagram, modules, and data flow.

## Scripts

```bash
npm run dev
npm run server
npm run dev:full
npm run check
npm run test
npm run lint
npm run build
npm run start
```

## Notes

- The compiler route uses the public Judge0 CE endpoint: `https://ce.judge0.com`.
- The project does not use `SUPABASE_SERVICE_KEY`; use `SUPABASE_SERVICE_ROLE_KEY`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only on the backend/server side.

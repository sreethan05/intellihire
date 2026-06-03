# IntelliHire

Full-stack campus recruitment platform scaffold.

## Structure

- `frontend/` - React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui-ready UI, Recharts, Axios, React Router v6.
- `backend/` - Node.js, Express, TypeScript, Supabase SDK, Judge0 integration, Multer uploads.
- `database/schema.sql` - Supabase-compatible PostgreSQL schema with enums, indexes, triggers, and RLS policies.

## Quick Start

```bash
cd backend
npm install
cp .env.example .env
npm run dev

cd ../frontend
npm install
cp .env.example .env
npm run dev
```

Apply `database/schema.sql` in the Supabase SQL editor before using the app.

## AI Interview Merge

The interview module follows the recruiter-led flow: recruiters create an AI interview template from a job title, job description, duration, and question types; the system generates questions and returns a candidate link. Candidates start the interview from that link, answer text-based questions, receive AI follow-ups, and the recruiter can review a structured scorecard.

The scorecard is intentionally richer than the basic recruiter tutorial pattern: it includes overall, technical, communication, problem-solving, and confidence scores, plus strengths, improvement areas, per-question feedback, summary, and recommendation.

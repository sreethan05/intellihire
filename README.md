# IntelliHire

This workspace now uses one active project:

```text
recruitexam_v2_updated/app
```

The other folder, `intellihire-platform`, is a separate scaffold/reference and is not the app to run.

## Run From This Root Folder

```bash
npm run dev
```

This starts:

- API server: `http://localhost:5000`
- Vite frontend: `http://localhost:3000`

For production-style local serving:

```bash
npm run build
npm run start
```

Then open:

```text
http://localhost:5000
```

## Checks

```bash
npm run check
npm run lint
npm run build
```

## Environment

Copy the active app env example:

```bash
copy recruitexam_v2_updated\app\.env.example recruitexam_v2_updated\app\.env
```

Then fill the real values in:

```text
recruitexam_v2_updated/app/.env
```

Required for normal app flow:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `PORT`

Required only for marksheet scanning and real AI generation:

- `GEMINI_API_KEY`


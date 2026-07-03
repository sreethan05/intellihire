# IntelliHire Platform

**IntelliHire** is a full‑stack recruitment and assessment platform supporting Admin, TPO (Training & Placement Officer), Recruiter, and Candidate workflows. It provides exam creation, coding assessments with sandboxed execution, AI‑powered voice interviews, real‑time proctoring, and candidate performance analytics.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Database Schema & Migrations](#database-schema--migrations)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Manual Testing & Verification](#manual-testing--verification)
- [Testing](#testing)
- [Docker](#docker)
- [License](#license)

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Express 5 with TypeScript (`tsx`), PostgreSQL, Socket.IO
- **AI Integrations**: Groq SDK (Llama 3.3 70B & Whisper) for audio evaluation & proctoring logs
- **Code Execution**: Monaco Editor + Judge0 CE sandboxed API
- **Email**: Nodemailer (SMTP)

---

## Project Structure

```text
intellihire/
├── client/                    # React frontend (Vite SPA)
│   ├── src/                   # Components, contexts, pages, hooks
│   └── public/                # Static public assets
├── server/                    # Express backend API
│   ├── src/                   # Routing, core libraries, DB scripts
│   └── tests/                 # Jest backend unit & integration tests
├── database/                  # SQL schema & seed scripts
│   ├── 01_users_colleges.sql  # Users and colleges schema
│   ├── 02_questions.sql       # Questions tables schema
│   ├── 03_exams.sql           # Exams tables schema
│   ├── ...                    # Migrations 04 through 08
│   ├── 09_seed_data.sql       # Default MCQ and coding questions seed data
│   ├── 10_indexes.sql         # Primary database optimization indexes
│   └── 11_audit_logs.sql      # System audit logging schema
├── e2e/                       # Playwright E2E integration test suites
└── .github/workflows/ci.yml   # CI/CD pipeline configuration
```

---

## Setup & Installation

### Prerequisites
- Node.js (v18+ recommended)
- Docker & Docker Compose (for running DB & Redis services locally)

### Step 1: Install Dependencies
Run the following commands to install dependencies for the workspace, client, and server:
```bash
npm install
npm --prefix client install
npm --prefix server install
```

### Step 2: Configure Environment
Copy the example environment file to `.env` in the root directory:
```bash
cp .env.example .env
# Edit .env with your local credentials
```

### Step 3: Run Database & Cache via Docker Compose (Recommended)
You can start a local PostgreSQL database, Redis instance, and MinIO storage server in one command:
```bash
docker compose up -d
```
This starts:
- **PostgreSQL** on port `5432` (database: `intellihire`, user: `dev`, password: `devpass`)
- **Redis** on port `6379`
- **MinIO** console on [http://localhost:9001](http://localhost:9001) (credentials: `minioadmin` / `minioadminpass`)


---

## Database Schema & Migrations

To apply all database schemas, table setups, and seed data automatically to your PostgreSQL database, run:
```bash
npm --prefix server run migrate
```

This runs the migration script which sequentially applies the SQL migration files located in the `database/` folder (from `01_users_colleges.sql` through `11_audit_logs.sql`).

To seed additional test roles (Recruiter, Candidate) for E2E tests or manual verification:
```bash
npx tsx server/src/seed_e2e_users.ts
```

---

## Environment Variables

Configure these keys in the `.env` file in the project root:

```env
# Server Config
PORT=5000
NODE_ENV=development
VITE_API_URL=http://localhost:5000/api

# PostgreSQL Connection
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/intellihire

# Authentication
JWT_SECRET=xxxx-your-secret-key-xxxx

# Optional AI Services (Required for voice grading & visual proctoring)
GROQ_API_KEY=xxxx-your-groq-key-xxxx
GROQ_MODEL=llama-3.3-70b-versatile

# Judge0 Sandboxed Execution (defaults to public CE instance)
JUDGE0_API_URL=https://ce.judge0.com

# SMTP Mailer Configurations (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=YOUR_EMAIL@gmail.com
SMTP_PASS=xxxx-your-app-password-xxxx
SMTP_FROM="IntelliHire <noreply@intellihire.com>"
```

---

## Running the Application

### Development (client + server concurrently)
```bash
npm run dev
```
* **Frontend**: [http://localhost:3000](http://localhost:3000)
* **Backend**: [http://localhost:5000](http://localhost:5000)

### Production Build & Start
```bash
npm run build   # Compiles frontend assets
npm run start   # Starts production backend serving the client
```

---

## Manual Testing & Verification

Once your development server is running:
* **Pre-seeded Accounts**: To inspect or modify the pre-seeded credentials for **Admin**, **Recruiter**, or **Candidate** portal flows, please refer to the source configuration files directly:
  - Base Admin: [postgres-schema.sql](file:///database/postgres-schema.sql)
  - Recruiter & Candidate: [seed_e2e_users.ts](file:///server/src/seed_e2e_users.ts)

---

## Testing

```bash
# Run backend Jest tests
npm run test

# Run Playwright E2E browser tests
npm run test:e2e
```

---

## Docker

To build and run the application in a Docker container:
```bash
docker build -t intellihire .
docker run -p 5000:5000 --env-file .env intellihire
```

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

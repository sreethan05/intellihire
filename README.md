# IntelliHire Platform

**IntelliHire** is a modern, enterprise-grade full‑stack recruitment and assessment platform. It supports Admin, TPO (Training & Placement Officer), Recruiter, and Candidate workflows, facilitating:
- Zero-API question bank selection and exam paper generation.
- Dynamic coding assessments with live compilation and test case execution.
- AI-powered voice interview recording, transcription, and scoring.
- Real-time video/tab proctoring snapshot streaming and face-verification tracking.
- Interactive, responsive dashboards detailing candidate performance and system analytics.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Architecture](#project-architecture)
- [Detailed Setup & Local Installation](#detailed-setup--local-installation)
- [Database Schema & Migrations](#database-schema--migrations)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Manual Testing & Account Verification](#manual-testing--account-verification)
- [CI/CD Pipeline & GitHub Actions](#cicd-pipeline--github-actions)
- [Troubleshooting & FAQs](#troubleshooting--faqs)
- [Docker Deployment](#docker-deployment)
- [License](#license)

---

## Tech Stack

### Frontend
- **Framework**: React 19 (Vite-powered SPA)
- **Language**: TypeScript
- **Styling**: Tailwind CSS & shadcn/ui
- **State & Routing**: React Router, Context API
- **Real-Time Client**: Socket.IO client (for proctoring stream)
- **Rich Text / Code Editor**: Monaco Editor (VS Core engine)

### Backend
- **Framework**: Express 5 (using `tsx` for high-performance TypeScript execution)
- **Database Access**: Direct pg-pool client with raw optimized SQL
- **Real-Time Server**: Socket.IO
- **AI Orchestration**: Groq SDK (Llama 3.3 70B Versatile) for voice transcripts and proctoring analysis
- **Compiling / Sandbox**: Judge0 CE API (or private instances)

### Databases & Cache
- **Primary Database**: PostgreSQL 15+

---

## Project Architecture

```text
intellihire/
├─ client/                     # React Single Page Application (SPA)
│   ├─ src/
│   │   ├─ components/         # Reusable UI widgets (cards, layout, auth-guards)
│   │   ├─ contexts/           # Authentication state & settings context
│   │   ├─ pages/              # Portal pages (Admin, Recruiter, Candidate panels)
│   │   └─ App.tsx             # Main routing and global provider registration
│   ├─ public/                 # Static public assets
│   └─ vite.config.ts          # Vite asset building configuration
├─ server/                     # Express API Backend
│   ├─ src/
│   │   ├─ lib/                # Shared helper libraries (AI client, auth, SMTP)
│   │   ├─ routes/             # REST endpoints (auth, exams, candidates, reports)
│   │   ├─ scripts/            # Database initialization and migration runners
│   │   └─ app.ts              # Server bootstrap and port mapping
│   ├─ tests/                  # Backend Jest unit & integration tests
│   └─ tsconfig.json           # Compiler specifications for backend
├─ database/                   # Schema generation & seeding files
│   ├─ postgres-schema.sql     # Core tables, constraints, indexes, and initial admin seed
│   ├─ schema-question-bank.sql# Question-bank table modifications and indexes
│   ├─ schema-analytics.sql    # Candidate tracking and statistics structures
│   └─ seed-question-bank.sql  # 1,500+ pre-configured MCQ and coding questions
├─ e2e/                        # Playwright E2E integration test suites
├─ .github/workflows/ci.yml    # Comprehensive CI/CD workflow pipeline definition
├─ .env.example                # Blueprint for local configuration
└─ package.json                # Root scripts and workspace settings
```

---

## Detailed Setup & Local Installation

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v15 or higher running locally or in Docker

### 2. Dependency Installation
Run the following commands in order to pull dependencies for the root, frontend, and backend environments:
```bash
# Install root tasks and runner utilities
npm install

# Install client packages
npm --prefix client install

# Install server packages
npm --prefix server install
```

### 3. Local Environment Blueprint
Copy the `.env.example` file to `.env` in the root directory:
```bash
cp .env.example .env
```
Open the `.env` file and configure the settings according to your local environment (see [Environment Variables](#environment-variables) below).

---

## Database Schema & Migrations

The platform database uses a tiered schema layer applied sequentially. The migration script automates this flow.

### Running Migrations Automatically
To apply all schema files and insert the default seed data automatically, run:
```bash
npm --prefix server run migrate
```
The script will perform the following steps sequentially:
1. Read `.env` credentials.
2. Establish a PostgreSQL connection.
3. Apply `database/postgres-schema.sql` (Creates core schemas, tables, constraints, and indexes).
4. Apply `database/schema-question-bank.sql` (Applies tables for standard and coding assessments).
5. Apply `database/schema-analytics.sql` (Applies candidate analytics tracking structures).
6. Apply `database/seed-question-bank.sql` (Seeds the database with 1,563 default questions).

### Seeding Test Accounts
To seed additional test roles (Admin, Recruiter, and Candidate users) for local testing or E2E suites:
```bash
npx tsx server/src/seed_e2e_users.ts
```

---

## Environment Variables

The application reads configurations from the `.env` file in the project root:

```env
# Core API & Server Configuration
PORT=5000
NODE_ENV=development
VITE_API_URL=http://localhost:5000/api

# Database Connection (update port/username/password as needed)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/intellihire

# JWT Token Secret (must be at least 32 characters long)
JWT_SECRET=xxxx-your-secret-key-xxxx

# AI Evaluation Services (Optional: Required for voice transcriptions & face verification)
GROQ_API_KEY=xxxx-your-groq-api-key-xxxx
GROQ_MODEL=llama-3.3-70b-versatile

# Code Execution Sandbox
# Default: public Judge0 CE server. For high volume, configure a private instance.
JUDGE0_API_URL=https://ce.judge0.com

# Automated System Mailer (Optional: SMTP host configuration)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=YOUR_EMAIL@gmail.com
SMTP_PASS=xxxx-your-app-password-xxxx
SMTP_FROM="IntelliHire <noreply@intellihire.com>"

# Logging level (debug, info, warn, error)
LOG_LEVEL=info
```

---

## Running the Application

### Development Mode (Concurrent Client & Server)
To spin up both backend and frontend development servers concurrently with live reload:
```bash
npm run dev
```
- **Client Application**: [http://localhost:3000](http://localhost:3000)
- **Server API Gateway**: [http://localhost:5000](http://localhost:5000)

### Production Build & Serve
To bundle the frontend application assets and run the server serving static build files:
```bash
# Compile and build frontend assets
npm run build

# Start production server
npm run start
```

---

## Manual Testing & Account Verification

Once local development servers are running, you can authenticate and test each portal user path using these pre-seeded accounts:

### 1. Super Admin Panel
* **Purpose**: Manage platforms, system parameters, college registrations, and global databases.
* **Credentials**:
  - **Email**: `admin@intellihire.com`
  - **Password**: `admin123`

### 2. Recruiter Portal
* **Purpose**: Create exams, manage question variants, configure custom test cases, review proctoring logs, and inspect performance analytics.
* **Credentials**:
  - **Email**: `recruiter@example.com`
  - **Password**: `recruiter123`

### 3. Candidate Assessment Area
* **Purpose**: Take exams, write code in the live sandbox editor, and complete audio recording portions.
* **Credentials**:
  - **Email**: `candidate@example.com`
  - **Password**: `candidate123`

---

## CI/CD Pipeline & GitHub Actions

The platform integrates a complete automated pipeline (`.github/workflows/ci.yml`) executed on every commit to verify codebase integrity.

### Workflow Jobs
1. **Lint & Type Check**: Assures code meets formatting standards and TypeScript type-checks successfully.
2. **Server Tests**: Executes server unit tests using Jest.
3. **Build Frontend**: Compiles client-side React code to confirm there are no bundler/transpilation issues.
4. **Docker Build Check**: Verifies that the Docker container builds correctly.
5. **E2E Tests (Playwright)**:
   - Provisions a local **PostgreSQL 15** service container in GitHub Actions.
   - Binds the container database on port `5433` (to avoid conflicts with pre-installed host databases on default port `5432`).
   - Runs migrations (`npm --prefix server run migrate`) and user seeds.
   - Spins up the backend and triggers headless Playwright browsers to execute full end-to-end user journeys (Sign in -> Test Attempt -> Submission).

### Running Tests Locally
To trigger the test suite locally:
```bash
# Run unit & backend integration tests (Jest)
npm run test

# Run E2E tests (Playwright)
npm run test:e2e
```

---

## Troubleshooting & FAQs

### 1. `duplicate key value violates unique constraint "coding_questions_title_unique"`
* **Cause**: This occurs during migrations when applying `seed-question-bank.sql` if the database already contains coding questions initialized in the base schema step.
* **Solution**: The seed file is configured with `ON CONFLICT (title) DO NOTHING;` to safely ignore existing duplicates. Ensure you use the latest version of `database/seed-question-bank.sql` and run `npm --prefix server run migrate`.

### 2. Local DB connection failures or E2E Port Conflicts
* **Cause**: A local instance of PostgreSQL is already running on port `5432`, causing binding failures or credential mismatch.
* **Solution**: 
  - For local development, check that your local PostgreSQL server is active, verify credentials match your `.env`, and update the port if configured differently.
  - In CI, the PostgreSQL container is mapped to port `5433` (`5433:5432`) to prevent collisions with pre-installed services. Use the exact environment configuration defined in `ci.yml`.

### 3. Frontend compilation errors (`tsc` or dependency mismatches)
* **Cause**: Lockfile mismatches or corrupted node module installations.
* **Solution**: Remove the dependency folders and local locks, then run clean installs:
  ```bash
  rm -rf node_modules client/node_modules server/node_modules
  npm install
  npm --prefix client install
  npm --prefix server install
  ```

---

## Docker Deployment

To build a standalone image containerizing the full Express backend serving pre-compiled React frontend assets:

```bash
# Build the Docker image
docker build -t intellihire .

# Run the container (injecting your custom env configuration)
docker run -p 5000:5000 --env-file .env intellihire
```

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

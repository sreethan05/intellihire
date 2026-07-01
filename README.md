# IntelliHire Enterprise Assessment & Recruitment Platform

IntelliHire is an enterprise-grade, high-performance, full-stack recruitment, proctoring, and talent assessment suite. Designed for colleges, training & placement cells, corporate recruiters, and administrators, the system automates and scales candidate evaluations through custom exam configurations, sandboxed code execution, real-time AI-powered visual proctoring, and speech-to-text voice interviews.

---

## Table of Contents

1. [System Architecture & Directory Tour](#1-system-architecture--directory-tour)
2. [Tech Stack & Dependency Layer](#2-tech-stack--dependency-layer)
3. [Comprehensive Database Schema Walkthrough](#3-comprehensive-database-schema-walkthrough)
4. [API Endpoints Catalog](#4-api-endpoints-catalog)
5. [Core Algorithmic Engines](#5-core-algorithmic-engines)
   - [A. Deterministic Question Selection Engine](#a-deterministic-question-selection-engine)
   - [B. AI Voice Interview Recording & Transcription Pipeline](#b-ai-voice-interview-recording--transcription-pipeline)
   - [C. Real-Time Video & Tab Proctoring Engine](#c-real-time-video--tab-proctoring-engine)
6. [Detailed Local Setup & Installation Guide](#6-detailed-local-setup--installation-guide)
7. [Environment Configuration & Variables Blueprint](#7-environment-configuration--variables-blueprint)
8. [Running the Application](#8-running-the-application)
9. [Manual Testing & Account Verification Roadmap](#9-manual-testing--account-verification-roadmap)
10. [CI/CD Pipeline & Automated Workflows](#10-cicd-pipeline--automated-workflows)
11. [Production Deployment & Architectural Scaling](#11-production-deployment--architectural-scaling)
12. [Troubleshooting, Common Pitfalls, & FAQs](#12-troubleshooting-common-pitfalls--faqs)
13. [Contributing Rules & Development Guidelines](#13-contributing-rules--development-guidelines)
14. [License](#14-license)

---

## 1. System Architecture & Directory Tour

IntelliHire employs a clean monorepo architecture structure segregating the frontend React client, the backend Express REST API server, database scripts, and test suites.

```text
intellihire/
├── .github/                   # CI/CD Workflows
│   └── workflows/
│       └── ci.yml             # Main continuous integration pipeline config
├── client/                    # React 19 Frontend (Vite Single Page Application)
│   ├── public/                # Static public assets (icons, images)
│   ├── src/
│   │   ├── components/        # Reusable UI widgets and layout views
│   │   │   ├── auth/          # Authentication guards and role checkers
│   │   │   ├── dashboard/     # Shared charts and statistics displays
│   │   │   └── ui/            # shadcn/ui custom tailored styling primitives
│   │   ├── contexts/          # Global application state contexts
│   │   │   ├── AuthContext.tsx# Authentication and session tracker
│   │   │   └── ThemeContext.tsx# Color theme management (Light/Dark profiles)
│   │   ├── hooks/             # Custom utility React hooks
│   │   ├── pages/             # Portal pages mapping the user roles
│   │   │   ├── admin/         # Administrative college & user registries
│   │   │   ├── candidate/     # Exam attempt screens & sandbox editor panels
│   │   │   ├── recruiter/     # Exam generation, question banks, candidate reports
│   │   │   └── tpo/           # Training & Placement Officer statistics panels
│   │   ├── App.tsx            # Main router configuration & provider mappings
│   │   └── index.css          # Core CSS stylesheet housing global design tokens
│   ├── tailwind.config.js     # Tailwind compilation parameters
│   └── vite.config.ts         # Vite build properties
├── server/                    # Express 5 Backend API Server
│   ├── src/
│   │   ├── lib/               # Common helper packages and integrations
│   │   │   ├── ai.ts          # Groq SDK wrappers for transcripts and proctoring
│   │   │   ├── email.ts       # Nodemailer SMTP setup and templates
│   │   │   ├── postgres.ts    # pg connection pool setup and configuration
│   │   │   └── security.ts    # JWT token signing and bcrypt password utilities
│   │   ├── routes/            # REST API routers mapping functional domains
│   │   │   ├── admin.ts       # Portal operations for platform admins
│   │   │   ├── auth.ts        # Session authentication and user token issues
│   │   │   ├── candidate.ts   # Assessment session state, code compilers
│   │   │   ├── exam.ts        # Exam template, scheduling, metadata
│   │   │   ├── proctoring.ts  # Frame processing pipelines & proctor logs
│   │   │   └── recruiter.ts   # Recruiter exam and candidate analytics
│   │   ├── scripts/           # DB schema initialization & migrations
│   │   │   ├── applyMigrations.ts # Migration workflow runner
│   │   │   └── seed_e2e_users.ts # E2E tests test users seed script
│   │   └── app.ts             # Server entry point mapping routes & socket.io listener
│   ├── tests/                 # Jest integration and unit test files
│   └── tsconfig.json          # TypeScript compilation settings
├── database/                  # Core Database SQL definition scripts
│   ├── postgres-schema.sql    # Base database tables, keys, default seeds
│   ├── schema-question-bank.sql# Question-bank database modifications
│   ├── schema-analytics.sql   # Analytics structures for logging candidate data
│   └── seed-question-bank.sql # 1,563 default MCQs and Coding questions
├── e2e/                       # Playwright E2E integration test suites
├── docs/                      # Supplemental architecture documentation
├── .env.example               # Environmental configuration template
├── package.json               # Root scripts mapping commands
└── README.md                  # Project documentation (You are here)
```

---

## 2. Tech Stack & Dependency Layer

### Core Architecture
* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, Lucide icons, Recharts (for analytics visualizations).
* **Backend**: Node.js, Express 5, TypeScript (`tsx` runner), Socket.IO (for real-time snapshot streams and proctor events).
* **Database**: PostgreSQL 15+, pg-pool (client pooling).
* **AI Processing**: Groq Cloud SDK (Llama 3.3 70B Versatile model) for audio transcript generation, face verification logs, and tab activity evaluations.
* **Code Execution**: Monaco Editor component + Judge0 CE public API/private instances.
* **Mailing**: Nodemailer (SMTP).
* **Unit Testing**: Jest & Supertest.
* **E2E Testing**: Playwright Test.

---

## 3. Comprehensive Database Schema Walkthrough

The platform database consists of several core tables, relationships, and constraints. The main tables include:

### `users`
Stores all account profile credentials and role classifications.
* `id`: UUID (Primary Key)
* `name`: VARCHAR(255)
* `email`: VARCHAR(255) (Unique Index)
* `password_hash`: VARCHAR(255)
* `role`: VARCHAR(50) (e.g., `'admin'`, `'recruiter'`, `'tpo'`, `'candidate'`)
* `college_id`: UUID (Foreign Key to `colleges`, nullable)
* `created_at`: TIMESTAMPTZ (Default `now()`)

### `colleges`
Stores institutions registered on the platform.
* `id`: UUID (Primary Key)
* `name`: VARCHAR(255) (Unique Index)
* `code`: VARCHAR(50) (Unique Index)
* `created_at`: TIMESTAMPTZ (Default `now()`)

### `exams`
Stores templates and schedules for assessments.
* `id`: UUID (Primary Key)
* `title`: VARCHAR(255)
* `description`: TEXT
* `duration_minutes`: INTEGER
* `start_time`: TIMESTAMPTZ
* `end_time`: TIMESTAMPTZ
* `pass_percentage`: INTEGER
* `created_by`: UUID (Foreign Key to `users`)
* `college_id`: UUID (Foreign Key to `colleges`)

### `questions`
Contains multiple-choice questions (MCQs).
* `id`: UUID (Primary Key)
* `question_text`: TEXT
* `option_a`: TEXT
* `option_b`: TEXT
* `option_c`: TEXT
* `option_d`: TEXT
* `correct_option`: CHAR(1)
* `marks`: INTEGER
* `topic`: VARCHAR(100)
* `difficulty`: VARCHAR(50)
* `subtopic`: VARCHAR(100)
* `concept_tags`: JSONB
* `bloom_level`: VARCHAR(50)

### `coding_questions`
Stores programming tasks, constraints, and test cases.
* `id`: UUID (Primary Key)
* `title`: VARCHAR(255) (Unique Index)
* `description`: TEXT
* `difficulty`: VARCHAR(50)
* `starter_code`: TEXT
* `test_cases`: JSONB (Structure: `[{"input": "...", "expected_output": "..."}]`)
* `sample_cases`: JSONB
* `hidden_cases`: JSONB
* `input_format`: TEXT
* `output_format`: TEXT
* `constraints_text`: TEXT
* `topic_tags`: JSONB
* `accepted_languages`: JSONB
* `marks`: INTEGER

### `candidate_attempts`
Tracks a candidate's session on a specific exam.
* `id`: UUID (Primary Key)
* `candidate_id`: UUID (Foreign Key to `users`)
* `exam_id`: UUID (Foreign Key to `exams`)
* `status`: VARCHAR(50) (e.g., `'started'`, `'completed'`, `'submitted'`)
* `started_at`: TIMESTAMPTZ (Default `now()`)
* `completed_at`: TIMESTAMPTZ

### `submissions`
Stores answers submitted by a candidate during an attempt.
* `id`: UUID (Primary Key)
* `attempt_id`: UUID (Foreign Key to `candidate_attempts`)
* `question_id`: UUID (Foreign Key to `questions`, nullable)
* `coding_question_id`: UUID (Foreign Key to `coding_questions`, nullable)
* `selected_option`: CHAR(1) (For MCQs)
* `submitted_code`: TEXT (For coding questions)
* `language`: VARCHAR(50)
* `passed_test_cases`: INTEGER
* `total_test_cases`: INTEGER
* `score`: INTEGER

### `proctoring_logs`
Tracks warning flags and activities stream data during an exam session.
* `id`: UUID (Primary Key)
* `attempt_id`: UUID (Foreign Key to `candidate_attempts`)
* `flag_type`: VARCHAR(50) (e.g., `'tab_switch'`, `'multiple_faces'`, `'no_face'`, `'cell_phone'`)
* `screenshot_url`: VARCHAR(255)
* `description`: TEXT
* `timestamp`: TIMESTAMPTZ (Default `now()`)

### `recruiter_voice_feedback`
Holds results from speech-to-text analysis during vocal interviews.
* `id`: UUID (Primary Key)
* `attempt_id`: UUID (Foreign Key to `candidate_attempts`)
* `transcription`: TEXT
* `ai_score`: NUMERIC(4, 2)
* `ai_feedback`: TEXT
* `created_at`: TIMESTAMPTZ (Default `now()`)

---

## 4. API Endpoints Catalog

Here is an index of the Express REST API routes implemented across the system controllers:

### Authentication (`/api/auth`)
* `POST /register`: Registers a new user. Mapped body includes name, email, password, and role.
* `POST /login`: Authenticates user credentials and issues a JSON Web Token (JWT).
* `GET /me`: Returns the profile information of the currently authenticated session user.

### Admin Portal (`/api/admin`)
* `GET /colleges`: Retrieves a list of all registered colleges.
* `POST /colleges`: Creates a new college profile.
* `GET /users`: Lists system-wide users with advanced filters.
* `DELETE /users/:id`: Removes a user account from the database.

### Recruiter Operations (`/api/recruiter`)
* `GET /exams`: Lists all exams generated by the logged-in recruiter.
* `POST /exams`: Schedules and saves a new exam template.
* `GET /exams/:id/attempts`: Retrieves candidate attempt reports for a specific exam.
* `GET /candidates/:id/report`: Compiles detailed report data including MCQ scores, coding outputs, and proctoring warnings.

### Candidate Workflow (`/api/candidate`)
* `GET /exams/available`: Lists active and upcoming exams for the candidate.
* `POST /exams/:id/start`: Creates a new candidate attempt log and returns the assigned test paper.
* `POST /exams/:id/submit`: Submits the exam and calculates the score.
* `POST /submissions/mcq`: Saves the candidate's selection for a specific MCQ.
* `POST /submissions/coding`: Saves candidate code and logs execution results.

### Code Compilation Sandboxing (`/api/compiler`)
* `POST /execute`: Compiles and runs code against predefined test cases using the Judge0 CE engine.

### Proctoring Logs & Streams (`/api/proctoring`)
* `POST /log-warning`: Saves a proctoring violation flag (such as tab switching or browser minimized).
* `POST /upload-snapshot`: Uploads snapshot frames from the candidate's camera to process AI-based violation audits.

### Voice Interview Engine (`/api/interview`)
* `POST /upload-audio`: Receives audio clip recordings, routes them to Groq Whisper for transcription, and returns grading scores.

### Analytics dashboards (`/api/analytics`)
* `GET /admin/dashboard`: Compiles system health, registration distributions, and active exam counters.
* `GET /recruiter/dashboard`: Tracks completion distributions, aggregate pass ratios, and flag frequencies.
* `GET /tpo/dashboard`: Analyzes average scores and placement indicators across college students.

---

## 5. Core Algorithmic Engines

The application relies on three core processing components:

### A. Deterministic Question Selection Engine
When a recruiter configures an exam template with parameters like:
* Total Marks
* Specific Topics (e.g., `'Database'`, `'Algorithms'`)
* Difficulty Ratios (e.g., 50% Easy, 30% Medium, 20% Hard)

The selector engine dynamically selects matching questions using a multi-step query processor:
1. **Bucketing**: Questions are grouped by topic and difficulty level.
2. **Deterministic Selection**: Queries filter by parameters and order candidates by a pseudo-random hash derived from the `exam_id` and question UUID. This ensures that the generated question paper is consistent and reproducible for all candidates taking the same exam.
3. **Coding Variation Matching**: Language support constraints are verified against the programming editor config.

### B. AI Voice Interview Recording & Transcription Pipeline
This pipeline processes oral questions and records speech audio:
1. **Recording Capture**: The frontend records candidate responses in high-quality WebM/WAV formats.
2. **Streaming Transfer**: The recorded chunks are sent via binary multipart streams to the backend server.
3. **AI Transcription**: The backend routes the binary data to **Groq Whisper API** to generate accurate transcriptions.
4. **Context Evaluation**: The transcription is sent to the LLM (Llama-3.3-70B) along with the original question and grading criteria. The model outputs a rating between 0 and 10 and provides qualitative feedback.

```mermaid
sequenceDiagram
    candidate_app->>backend: POST /api/interview/upload-audio (multipart binary clip)
    backend->>Groq API: Transcribe audio using Whisper model
    Groq API-->>backend: Returns transcription text
    backend->>Groq API: Evaluate transcript against question + rubric (Llama 3.3)
    Groq API-->>backend: Returns score (0-10) + feedback text
    backend->>database: Save score to recruiter_voice_feedback table
    backend-->>candidate_app: Returns success confirmation
```

### C. Real-Time Video & Tab Proctoring Engine
To prevent cheating, the proctoring engine monitors candidate behavior during the exam:
1. **Real-time Event Stream**: A Socket.IO connection is established when the exam starts.
2. **Tab Switch Tracking**: The browser's visibility API monitors focus events. If the candidate switches tabs or minimizes the window, a warning is sent to the server.
3. **Camera Frame Capture**: The frontend captures camera frames at regular intervals.
4. **AI Visual Proctoring**: The captured frames are sent to the backend. The backend processes the images using a vision model or third-party API to detect violations such as:
   - Multiple faces present
   - No face detected
   - Cell phone present in frame
5. **Auto-submission Trigger**: If the number of warnings exceeds a predefined limit, the server automatically submits and ends the candidate's exam session.

---

## 6. Detailed Setup & Installation Guide

### Prerequisites
1. **Node.js**: Install version `18.x` or `20.x` from the official repository.
2. **PostgreSQL**: Install PostgreSQL version `15` or higher. Ensure the service is active and listening on port `5432`.
3. **pgAdmin** (Optional): Useful for database monitoring and schema inspection.

### Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone https://github.com/sreethan05/intellihire.git
   cd intellihire
   ```

2. **Install Root Dependencies**
   Install concurrently and other workspace utilities:
   ```bash
   npm install
   ```

3. **Install Client Dependencies**
   ```bash
   npm --prefix client install
   ```

4. **Install Server Dependencies**
   ```bash
   npm --prefix server install
   ```

5. **Initialize Database**
   Create a database named `intellihire` in your PostgreSQL server. You can run the migration script to set up all tables and seed data:
   ```bash
   npm --prefix server run migrate
   ```
   Alternatively, you can manually apply the SQL files in order using `psql`:
   ```bash
   psql -d intellihire -f database/postgres-schema.sql
   psql -d intellihire -f database/schema-question-bank.sql
   psql -d intellihire -f database/schema-analytics.sql
   psql -d intellihire -f database/seed-question-bank.sql
   ```

6. **Seed Test Accounts**
   Generate test accounts for local development and walkthroughs:
   ```bash
   npx tsx server/src/seed_e2e_users.ts
   ```

---

## 7. Environment Configuration & Variables Blueprint

Create a `.env` file in the root directory. Below is the blueprint of variables and configurations:

```env
# Server Port & Mode
PORT=5000
NODE_ENV=development

# Frontend API URL configuration (used by Vite client)
VITE_API_URL=http://localhost:5000/api

# Database Connection URI
# Format: postgresql://username:password@host:port/database_name
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/intellihire

# JWT Cryptographic Secret (min 32 characters suggested)
JWT_SECRET=xxxx-your-long-secure-secret-key-xxxx

# AI Keys (Required for transcription and visual proctoring)
GROQ_API_KEY=xxxx-your-groq-api-key-xxxx
GROQ_MODEL=llama-3.3-70b-versatile

# Judge0 Sandboxed Execution API URL
# Default: public server. Change to private deployment for production loads.
JUDGE0_API_URL=https://ce.judge0.com

# SMTP Automated System Mailer Configurations (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=YOUR_EMAIL@gmail.com
SMTP_PASS=xxxx-your-app-password-xxxx
SMTP_FROM="IntelliHire <noreply@intellihire.com>"

# Logging verbosity (debug, info, warn, error)
LOG_LEVEL=info
```

---

## 8. Running the Application

The platform uses concurrent execution scripts to run both the frontend and backend servers together.

### Development mode
Starts the Vite client server on port `3000` and the Express backend API server on port `5000`:
```bash
npm run dev
```

### Server Only (Hot reload)
```bash
npm run server:dev
```

### Client Only
```bash
npm run client
```

### Production Build and Start
Compiles assets to optimization packages and starts the Express production server to serve the frontend client statically:
```bash
# Build frontend static files
npm run build

# Start backend server
npm run start
```

---

## 9. Manual Testing & Account Verification Roadmap

You can authenticate and test the application portals using the pre-seeded accounts. For security reasons, the raw credentials and password hashes are configured in the source code. Refer to the files below to inspect or change the defaults:

* **Super Admin Configuration**: Defined in the base schema insert block inside `database/postgres-schema.sql`.
* **Recruiter & Candidate Configurations**: Defined inside `server/src/seed_e2e_users.ts`.

Refer to those source files to check or modify the pre-seeded emails and passwords before logging in locally.

---

## 10. CI/CD Pipeline & Automated Workflows

The repository uses GitHub Actions (`.github/workflows/ci.yml`) to automatically run test suites on every pull request or push to the `main` branch.

```mermaid
graph TD
    A[Push to main] --> B(GitHub Runner starts)
    B --> C1[Job: Lint & Type Check]
    B --> C2[Job: Server Tests]
    B --> C3[Job: Build Frontend]
    B --> C4[Job: Docker Build Check]
    B --> C5[Job: E2E Playwright Tests]
    
    C5 --> D1[Start pg:15 Container on 5433]
    D1 --> D2[Apply Schemas & Seeds]
    D2 --> D3[Seed E2E Users]
    D3 --> D4[Install Playwright Browsers]
    D4 --> D5[Run headless tests]
    
    C1 & C2 & C3 & C4 & D5 --> E[Workflow Result: Success]
```

### Configured Jobs & Operations
1. **Lint & Type Check**:
   - Sets up Node.js.
   - Installs dependencies.
   - Runs `npm run lint` and `npm run check` to check formatting and TypeScript errors.
2. **Server Tests**:
   - Runs Jest tests under `server/tests` to verify backend routes and controllers.
3. **Build Frontend**:
   - Compiles client assets into `client/dist` using Vite compiler to verify build stability.
4. **Docker Build Check**:
   - Builds the production Docker container to ensure there are no Dockerfile issues.
5. **E2E Tests (Playwright)**:
   - Provisions a `postgres:15-alpine` database service container on the runner.
   - Maps ports to `5433:5432` to avoid collisions with the runner's pre-installed host database.
   - Runs schema migrations and seeds test accounts.
   - Installs Playwright system browsers.
   - Runs `npx playwright test` to execute E2E test flows.

---

## 11. Production Deployment & Architectural Scaling

For production environments, the platform can be scaled using a multi-node load balancer architecture:

```text
                     [ HTTPS Request ]
                             │
                             ▼
                    [ Nginx Reverse Proxy ]
                   (SSL Offloading & Static)
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
     [ Node Engine 1 ]                 [ Node Engine 2 ]
     (PM2 Cluster Mode)               (PM2 Cluster Mode)
            │                                 │
            └────────────────┬────────────────┘
                             ▼
                 [ PgBouncer Connection Pool ]
                             │
                             ▼
                  [ PostgreSQL Cluster ]
                     (Primary/Replica)
```

### Recommended Production Deployment Setup

#### 1. Nginx Reverse Proxy Configuration
Place this Nginx configuration snippet behind an SSL certificate to enable safe routing and forward socket packets:

```nginx
server {
    listen 80;
    server_name assessment.company.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name assessment.company.com;

    ssl_certificate /etc/letsencrypt/live/assessment.company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/assessment.company.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Serve compiled frontend static assets directly
    location / {
        root /var/www/intellihire/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Route backend API requests
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Route WebSocket connections
    location /socket.io/ {
        proxy_pass http://localhost:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### 2. PM2 Cluster Management
Install PM2 globally and run the backend server in cluster mode to utilize all available CPU cores:
```bash
npm install -g pm2
pm2 start dist/app.js --name "intellihire-api" -i max --env production
```

#### 3. Database Tuning (PostgreSQL)
For production environments, adjust the settings in `/etc/postgresql/15/main/postgresql.conf` based on your server's hardware capacity:
* `max_connections = 500` (Use PgBouncer for pooling if connections exceed this limit).
* `shared_buffers = 4GB` (Set to 25% of system RAM).
* `effective_cache_size = 12GB` (Set to 75% of system RAM).
* `work_mem = 16MB`
* `maintenance_work_mem = 1GB`

---

## 12. Troubleshooting, Common Pitfalls, & FAQs

### Q: `duplicate key value violates unique constraint "coding_questions_title_unique"` when running migrations
* **Reason**: The migrations script applied `postgres-schema.sql` (which already seeds a few questions) and then ran `seed-question-bank.sql` (which contains overlapping questions) without conflict handling.
* **Fix**: Ensure your `database/seed-question-bank.sql` ends with the `on conflict (title) do nothing;` clause. This allows the database to safely ignore duplicate questions.

### Q: E2E Playwright tests fail with `ECONNREFUSED` or database timeout errors
* **Reason**: The Playwright runner is attempting to connect to PostgreSQL on port `5432`, but a local host database is blocked, running on a different port, or missing the E2E user seeds.
* **Fix**:
  1. Verify the `DATABASE_URL` in `.env` is configured correctly.
  2. If running locally, make sure to execute the seeding script (`npx tsx server/src/seed_e2e_users.ts`) to populate the test accounts.
  3. In CI, make sure the E2E job maps the PostgreSQL container to port `5433` (`5433:5432`) to prevent conflicts with the host runner's pre-installed PostgreSQL service.

### Q: Client assets fail to build or compile with errors in lockfiles
* **Reason**: Lockfiles can become corrupted or mismatched during git merges.
* **Fix**: Remove the lockfiles and dependency folders, then run clean installations:
  ```bash
  rm -rf node_modules client/node_modules server/node_modules client/package-lock.json server/package-lock.json
  npm install
  npm --prefix client install
  npm --prefix server install
  ```

---

## 13. Contributing Rules & Development Guidelines

To contribute code to this repository:
1. **Branch Naming Conventions**:
   - Features: `feature/short-description`
   - Bugfixes: `bugfix/short-description`
   - Refactoring: `refactor/short-description`
2. **Quality Checks**:
   - Ensure all files compile without TypeScript type-checking errors. Run:
     ```bash
     npm run check
     ```
   - Ensure code conforms to formatting standards:
     ```bash
     npm run lint
     ```
3. **Testing**:
   - Write unit tests for new routes or backend controllers under `server/tests`.
   - Run E2E verification tests (`npm run test:e2e`) before submitting pull requests to ensure core flows remain unbroken.

---

## 14. License

This project is licensed under the MIT License. See the `LICENSE` file for details.

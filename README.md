# IntelliHire Platform

**IntelliHire** is a state-of-the-art, full‑stack recruitment, assessment, and proctoring platform. Designed to streamline campus placements and hiring workflows, the platform provides seamless orchestration across four distinct user roles: **Admin**, **TPO (Training & Placement Officer)**, **Recruiter**, and **Candidate**. 

It features automated AI voice interviews, real-time proctoring analytics with vision model inspection, coding assessments using Monaco Editor and Judge0 sandboxed execution, batch marksheet parsing (OCR), and robust system resilience including Redis-free degradation.

---

## 🌟 Key Capabilities

### 1. Multi-Tenant Role Workflows
*   **Candidate Portal**: Completes profile onboarding, takes MCQs/coding/voice exams, runs code in a sandboxed IDE, participates in AI-powered voice interviews, and reviews performance analytics.
*   **Recruiter Portal**: Schedules AI voice interviews, designs MCQ and coding tests, creates hiring drives, monitors exams live via webcam snapshots, and reviews detailed candidate plagiarism & voice metrics.
*   **Training & Placement Officer (TPO) Portal**: Manages student databases, imports batches of student profiles via grade-sheet OCR, monitors placement activity, and exports college-wide analytics.
*   **Admin Portal**: Exercises global system control, manages database instances, creates Recruiter & TPO accounts, audits system logs, and inspects API consumption metrics.

### 2. Advanced Technical Features
*   **AI-Powered Voice Interviews**: Conducts automated conversational assessments using the **Groq SDK** (Llama 3.3 70B & Whisper). Transcribes spoken responses and evaluates candidates dynamically on accuracy, clarity, and communication depth.
*   **Visual & Event-Driven Proctoring**: Real-time webcam snapshots are processed by **Llama 3.2 11B Vision** to detect violations (e.g., looking away, multiple people in frame, mobile devices). Built-in browser event listeners track tab switching and full-screen exits.
*   **Smart Marksheet OCR Parsing**: Batch uploads of student marksheets are parsed via **Tesseract.js** (images) and **pdf-parse** (PDFs), with data extraction corrected via Groq JSON mode to extract student names, roll numbers, CGPAs, branches, and graduation years.
*   **Algorithmic Plagiarism Detection**: Features a custom cosine-similarity engine to analyze code submissions. Normalizes syntax (stripping comments/whitespaces) and compares tokenized structures to flag copy-paste behavior.
*   **Redis-Free Degradation & Resilience**: The backend is engineered to gracefully degrade. If Redis goes offline, websocket rooms and job queues seamlessly fall back to single-process in-memory queues without crashing the server.

---

## ⚙️ Tech Stack

*   **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, Monaco Editor
*   **Backend**: Express 5 (TypeScript with `tsx`), Socket.IO (WebSockets), Node.js v20
*   **Database**: PostgreSQL
*   **Storage & Caching**: Redis (Queue/Websocket adapter), MinIO / S3‑compatible object storage
*   **AI Models**: Groq APIs (Llama 3.3 70B, Llama 3.2 11B Vision, Whisper)
*   **Execution Sandbox**: Judge0 CE API

---

## 📁 Project Structure

```text
intellihire/
├── client/                     # React frontend (Vite SPA)
│   ├── src/
│   │   ├── components/         # Reusable UI elements (shadcn/ui layout)
│   │   ├── context/            # Auth and global application states
│   │   ├── hooks/              # Custom React hooks (WebSockets, media, etc.)
│   │   └── pages/              # Portal pages (admin/, candidate/, recruiter/, tpo/)
│   └── public/                 # Static assets
├── server/                     # Express backend API
│   ├── src/
│   │   ├── lib/                # Core engines: AI, OCR, storage, plagiarism, queue
│   │   ├── middleware/         # JWT Auth, rate limiting, and request validation
│   │   ├── repositories/       # Database access layers
│   │   └── routes/             # REST Endpoints (auth, AI, exams, proctoring)
│   └── tests/                  # Jest unit & integration tests
├── database/                   # SQL schemas and seed scripts
│   ├── 01_users_colleges.sql   # User profile tables
│   ├── 02_questions.sql        # MCQ, Coding, and Voice question schema
│   ├── ...                     # Database migrations 03 through 08
│   ├── 09_seed_data.sql        # Default exam question seeds
│   └── 11_audit_logs.sql       # Audit trail for admin logs
├── e2e/                        # Playwright E2E integration test suites
└── docker-compose.yml          # Postgres, Redis, and MinIO container definitions
```

---

## 🚀 Setup & Installation

### Prerequisites
*   **Node.js** (v20+ recommended)
*   **Docker & Docker Compose** (for local backing services)

### Step 1: Install Dependencies
Install all package dependencies in the workspace, client, and server:
```bash
npm install
npm --prefix client install
npm --prefix server install
```

### Step 2: Set Environment Variables
Create a `.env` file in the root directory by copying the example:
```bash
cp .env.example .env
# Edit .env and supply your API credentials and secrets
```

Ensure the following variables are configured (use placeholders for actual keys):
```env
PORT=5000
NODE_ENV=development
VITE_API_URL=http://localhost:5000/api

# PostgreSQL Configuration
DATABASE_URL=postgresql://dev:devpass@localhost:5432/intellihire

# Cache & Storage
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=intellihire

# Security & Authentication
JWT_SECRET=xxxx-your-secret-key-xxxx

# AI Credentials (Required for voice grading & webcam proctoring)
GROQ_API_KEY=xxxx-your-groq-api-key-xxxx
GROQ_MODEL=llama-3.3-70b-versatile

# Judge0 Sandboxed Compiler Config
JUDGE0_API_URL=https://ce.judge0.com

# SMTP Mail Settings (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=YOUR_EMAIL@gmail.com
SMTP_PASS=xxxx-your-app-password-xxxx
```

### Step 3: Run Infrastructure Container Suite
Start PostgreSQL, Redis, and MinIO locally via Docker:
```bash
docker compose up -d
```
*   **PostgreSQL** runs on port `5432`.
*   **Redis** runs on port `6379`.
*   **MinIO Console** is available at [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadminpass`).

### Step 4: Apply Database Migrations & Seeds
Initialize database tables, schemas, and default questions:
```bash
npm --prefix server run migrate
```

To seed mock recruiters, colleges, and candidate accounts for manual testing:
```bash
npx tsx server/src/seed_e2e_users.ts
```

---

## 🏃 Running the Application

### Development Mode
Runs both the client and server concurrently with hot‑reloading:
```bash
npm run dev
```
*   **Frontend**: [http://localhost:3000](http://localhost:3000)
*   **Backend**: [http://localhost:5000](http://localhost:5000)

### Production Build & Serve
Compile frontend assets and launch the backend in production mode:
```bash
npm run build
npm run start
```

---

## 🧪 Testing & Verification

### Unit & Integration Tests
Execute backend logic and helper function tests using Jest:
```bash
npm run test
```

### End-to-End Tests
Launch the Playwright automated testing suite to verify multi-portal workflows:
```bash
npm run test:e2e
```

---

## 🐋 Dockerization
To bundle and run the entire application inside a single production-ready container:
```bash
# Build the image
docker build -t intellihire .

# Run the container using environment configurations
docker run -p 5000:5000 --env-file .env intellihire
```

---

## 📄 License
This repository is licensed under the MIT License. See the `LICENSE` file for more details.

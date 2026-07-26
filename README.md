# 🚀 IntelliHire Platform

> **AI-Powered Enterprise Recruitment, Automated Technical Assessment & Proctoring System**

IntelliHire is a full-stack, enterprise-grade talent assessment and placement management platform engineered for **Administrators**, **Training & Placement Officers (TPOs)**, **Recruiters**, and **Candidates**. The platform combines real-time anti-cheat proctoring, AI-assisted interview generation, automated code execution sandboxing, interactive test case diffing, and comprehensive CSV/Excel analytics export workflows.

---

## 🌟 Key Platform Features

### 👤 1. Role-Based Workflows
* **Candidate Portal**:
  * Take multi-section assessments (MCQ & Interactive Coding Sandbox with Monaco Editor).
  * Real-time anti-cheat protection (copy/paste prevention, tab-switch monitoring, context menu restrictions).
  * Automated credential verification via public QR codes and PDF certificates.
  * Personal exam performance analytics, practice sandboxes, and candidate ranking leaderboards.
* **Recruiter & Hiring Portal**:
  * AI-assisted assessment generator for tailored coding and aptitude questions.
  * Comprehensive campus drive management, candidate tracking, and automated offer letter dispatch.
  * AI voice/text interview scheduling and real-time candidate proctoring monitor.
  * One-click CSV/Excel drive results exporter and candidate performance breakdowns.
* **TPO (Training & Placement Officer) Hub**:
  * Campus-wide student roster management with bulk CSV imports and OCR marksheet scanning.
  * Placement readiness heatmap analytics and branch-wise performance metrics.
  * One-click CSV analytics exporter for university management and recruiter sharing.
* **Admin Control Center**:
  * Platform user management (TPO and Recruiter onboarding).
  * System health diagnostics, global activity auditing, and usage metrics.

---

### 🛡️ 2. Security & Anti-Cheat Engine
* **Monaco Coding Sandbox**: Integrated code runner supporting multi-language test execution (Python, JavaScript, C++, Java) with detailed Expected vs Received test case diff visualizers.
* **Real-time Proctoring Monitor**: Active webcam snapshot capture, browser focus change detection, and automated flag logs.
* **Public Certificate Verification**: Verification endpoint (`/certificates/verify/:id`) with embedded QR code scanning to authenticate candidate credentials instantly.

---

## 🛠️ Technology Stack

| Layer | Technologies & Tools |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Monaco Editor, Lucide Icons, Sonner |
| **Backend** | Python 3.11, FastAPI, Uvicorn, Python-SocketIO, Pydantic |
| **Database & Cache** | PostgreSQL, Redis (for real-time event pub/sub with in-memory fallback) |
| **Code Sandbox** | Remote Sandbox API for secure multi-language execution |
| **Testing & Quality** | Pytest, Vitest, Playwright (E2E), ESLint, TypeScript Type Checker |
| **Containerization & CI** | Docker, Docker Compose, GitHub Actions CI Pipeline |

---

## 📂 Project Architecture

```text
intellihire/
├── client/                  # React 19 + TypeScript Vite Frontend
│   ├── src/
│   │   ├── components/      # UI components & Layout wrappers
│   │   ├── context/         # AuthContext, CollegeContext, ThemeProvider
│   │   ├── lib/             # API client, CSV exporter, utilities
│   │   └── pages/           # Candidate, Recruiter, TPO, & Admin views
│   └── package.json
├── server_py/               # Python 3.11 FastAPI Backend
│   ├── app/                 # Routers, DB wrapper, WebSockets, AI services
│   ├── tests/               # Backend Pytest suite (110+ unit/integration tests)
│   └── requirements.txt
├── database/                # PostgreSQL schema migrations & seed files
├── e2e/                     # Playwright End-to-End test suites
├── .github/workflows/       # GitHub Actions CI pipeline configuration
├── Dockerfile               # Multi-stage production container build
├── docker-compose.yml       # Local development backing services
└── package.json             # Root workspace management scripts
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory based on `.env.example`:

```env
# Database & Backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/intellihire
JWT_SECRET=YOUR_SECURE_JWT_SECRET_KEY_HERE_MIN_32_CHARS
PORT=5000

# Frontend API URL
VITE_API_URL=http://localhost:5000/api

# Code Sandbox API Execution (Optional)
JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
```

---

## 🚀 Quick Start Guide

### Prerequisites
* **Node.js**: `v20.x` or later
* **Python**: `v3.11.x`
* **PostgreSQL**: `v15.x` or later (or Docker Compose)

### 1. Install Dependencies

```bash
# Install root & frontend dependencies
npm install
npm --prefix client install

# Set up Python virtual environment
python -m venv server_py/.venv
server_py/.venv/Scripts/python -m pip install --upgrade pip
server_py/.venv/Scripts/python -m pip install -r server_py/requirements.txt
```

### 2. Start Backing Infrastructure (Docker)

```bash
docker compose up -d
```

### 3. Run Development Servers

```bash
npm run dev
```

* **Frontend App**: `http://localhost:3000`
* **FastAPI Backend**: `http://localhost:5000`
* **API Health Check**: `http://localhost:5000/api/health`

---

## 🧪 Testing & Quality Assurance

### Run Frontend Type Check & Linter
```bash
npm --prefix client run check
npm --prefix client run lint
```

### Run Backend Pytest Suite
```bash
.\server_py\.venv\Scripts\python.exe -m pytest server_py/tests
```

### Run Playwright End-to-End (E2E) Tests
```bash
npx playwright test
```

---

## 🐳 Production Deployment

### Docker Container Build

```bash
# Build multi-stage production image
docker build -t intellihire:latest .

# Run production container
docker run -p 5000:5000 --env-file .env intellihire:latest
```

---

## 📜 License

This project is proprietary software created for IntelliHire. All rights reserved.

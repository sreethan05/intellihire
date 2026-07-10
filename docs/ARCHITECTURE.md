# IntelliHire Architecture

## System Overview

IntelliHire is a full-stack recruitment examination platform with four user roles: Admin, TPO, Recruiter, and Candidate.

```mermaid
flowchart TD
  User["User Browser"] --> Frontend["React + Vite Frontend"]
  Frontend --> API["FastAPI Backend API"]
  
  subgraph Backend ["Backend Layers"]
    API --> Routes["Routes (HTTP Controller)"]
    Routes --> Services["Services (Business Logic)"]
    Services --> Repositories["Repositories (Database Layer)"]
  end

  Repositories --> DB["PostgreSQL DB"]
  Services --> Cache["Redis Cache / Queues"]
  Services --> AI["Groq AI Service"]
  Services --> Judge["Judge0 Code Runner"]
```

## Backend Architecture

The active backend lives in `server_py/app`. It is organized around FastAPI routers, shared helper modules, and a PostgreSQL compatibility wrapper that preserves the Supabase-style query pattern used by the earlier TypeScript code.

1. **Routers (HTTP Layer)**:
   - Handle incoming requests (validate inputs, verify route access, extract path/query variables).
   - Direct work to helper functions or route-local workflows.
   - Raise FastAPI `HTTPException` errors for consistent HTTP status handling.
2. **Domain Helpers**:
   - Contain the core business rules, calculations, AI scoring pipeline invocations, and integrations.
   - Include modules such as `ai.py`, `compiler.py`, `insights.py`, `plagiarism.py`, and `utils.py`.
3. **Database Layer**:
   - `server_py/app/db.py` owns PostgreSQL connection pooling and Supabase-style select/upsert/filter compatibility.
   - Raw SQL is still used in a few high-shape analytics paths where it is clearer.

---

## Detailed Data Flows

### 1. Candidate Exam Attempt Flow

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Candidate
    participant FE as Frontend (React)
    participant RT as FastAPI Router
    participant DBW as Python DB Wrapper
    participant DB as PostgreSQL

    Candidate->>FE: Click "Start Exam"
    FE->>RT: POST /api/exam/start
    RT->>DBW: getActiveAttempt() / createAttempt()
    DBW->>DB: INSERT INTO attempts (status = "in_progress")
    DB-->>DBW: Return attempt row
    RT-->>FE: Return attempt session
    
    Candidate->>FE: Submit Question Answers
    FE->>RT: POST /api/result/submit-mcq
    RT->>DBW: saveAnswer()
    DBW->>DB: UPSERT answers
    RT-->>FE: Confirm submission success
```

### 2. Real-Time Proctoring & Websocket Synchronization

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Candidate
    participant FE as Candidate Frontend
    participant API as FastAPI Proctoring Router
    participant WS as Python Socket.IO App
    participant DB as PostgreSQL
    participant REC as Recruiter Dashboard

    Candidate->>FE: Focus lost / tab switched
    FE->>API: POST /api/proctoring/events
    API->>DB: INSERT proctoring_snapshots
    WS->>REC: Push realtime alert when websocket context is available
```

---

## Security Controls

- **Encryption**: Passwords hashed using standard `bcrypt` algorithms.
- **Session Tokens**: REST routes and websocket handshakes authenticated via JSON Web Tokens (JWT).
- **Access Control**: Role-based access control (RBAC) middleware verifying user authorizations (Candidate, Recruiter, TPO, Admin).
- **Environment Isolation**: Database URLs, JWT secrets, and API credentials stored securely in environment configurations.


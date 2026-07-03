# IntelliHire Architecture

## System Overview

IntelliHire is a full-stack recruitment examination platform with four user roles: Admin, TPO, Recruiter, and Candidate.

```mermaid
flowchart TD
  User["User Browser"] --> Frontend["React + Vite Frontend"]
  Frontend --> API["Express Backend API"]
  
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

## 3-Layer Backend Architecture

To maintain clean codebase separation and adherence to the Single Responsibility Principle, we organize our backend code into three specialized layers:

1. **Routes (HTTP Layer)**:
   - Handle incoming requests (validate inputs, verify route access, extract path/query variables).
   - Direct work to the appropriate Service and return the HTTP response envelope.
   - Forward errors cleanly using the Express centralized error handler `next(err)`.
2. **Services (Business Logic)**:
   - Contain the core business rules, calculations, AI scoring pipeline invocations, and integrations.
   - Orchestrate calls to multiple repository methods or helper utilities.
   - Throw semantic custom errors (e.g. `ValidationError`, `NotFoundError`).
3. **Repositories (Database Layer)**:
   - The sole location for SQL query builders and direct database connection pool queries.
   - Handle tables mapping, schema transformations, and direct record CRUD.

---

## Detailed Data Flows

### 1. Candidate Exam Attempt Flow

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Candidate
    participant FE as Frontend (React)
    participant RT as Route / Controller
    participant SV as Exam Service
    participant RP as Database Repository
    participant DB as PostgreSQL

    Candidate->>FE: Click "Start Exam"
    FE->>RT: POST /api/exams/:id/start
    RT->>SV: startAttempt(examId, userId)
    SV->>RP: getActiveAttempt() / createAttempt()
    RP->>DB: INSERT INTO attempts (status = "started")
    DB-->>RP: Return attempt row
    SV-->>FE: Return attempt session + token
    
    Candidate->>FE: Submit Question Answers
    FE->>RT: POST /api/exams/:id/submit
    RT->>SV: submitAnswer(attemptId, questionId, answerData)
    SV->>RP: saveAnswer()
    RP->>DB: INSERT INTO answers
    SV-->>FE: Confirm submission success
```

### 2. Real-Time Proctoring & Websocket Synchronization

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Candidate
    participant FE as Candidate Frontend
    participant WS as Socket.IO Websocket Node
    participant RD as Redis Adapter
    participant REC as Recruiter Dashboard

    Candidate->>FE: Focus lost / tab switched
    FE->>WS: Emit "proctor:tab-switch" (with attempt context)
    WS->>RD: Broadcast event to Redis channel
    RD->>WS: Sync event across websocket nodes
    WS->>REC: Push real-time alert "Candidate tab switched"
```

---

## Security Controls

- **Encryption**: Passwords hashed using standard `bcrypt` algorithms.
- **Session Tokens**: REST routes and websocket handshakes authenticated via JSON Web Tokens (JWT).
- **Access Control**: Role-based access control (RBAC) middleware verifying user authorizations (Candidate, Recruiter, TPO, Admin).
- **Environment Isolation**: Database URLs, JWT secrets, and API credentials stored securely in environment configurations.



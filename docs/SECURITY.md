# IntelliHire Security Explanation

IntelliHire uses basic security controls suitable for a role-based recruitment examination platform.

## Password Hashing

User passwords are not stored directly in the database. During account creation, the backend hashes the password using `bcryptjs`. During login, the entered password is compared with the stored hash.

Benefit:

- Protects user passwords even if database records are exposed.
- Prevents plain-text password storage.

## JWT Authentication

After successful login, the backend generates a JWT token. The frontend stores and sends this token when calling protected API routes.

Benefit:

- Confirms the identity of the logged-in user.
- Allows protected routes to verify requests without asking for login again.

## Role-Based Access Control

The system supports four main roles:

- Admin
- TPO
- Recruiter
- Candidate

Each role has different access:

| Role | Main Access |
| --- | --- |
| Admin | Manage users, colleges, TPOs, recruiters, and platform data |
| TPO | Manage students/candidates and view assigned results |
| Recruiter | Create exams, assign exams, manage questions, and view results |
| Candidate | Take assigned exams, view results, and download certificates |

Benefit:

- Users can only access features related to their role.
- Sensitive admin and recruiter actions are protected from candidates.

## Protected API Routes

Backend middleware verifies the JWT token before allowing access to protected routes. If the token is missing or invalid, the request is rejected.

Benefit:

- Prevents unauthorized access to dashboards, exams, results, and user data.

## Environment Variable Protection

Sensitive keys are stored in `.env`, not hardcoded in frontend code.

Important keys:

```text
SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
GEMINI_API_KEY
```

Security note:

- `SUPABASE_SERVICE_ROLE_KEY` must remain backend-only.
- `JWT_SECRET` should be long, random, and changed before deployment.
- Default admin password should be changed before real use.

## Security Summary

IntelliHire protects the main workflow using password hashing, JWT-based login sessions, protected backend routes, and role-based access control. These controls make the platform safer for handling exams, users, answers, and results.


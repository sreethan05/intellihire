# IntelliHire Validation And Test Cases

This document lists simple test cases that can be shown in project documentation or used during demo validation.

| Test ID | Module | Test Case | Input | Expected Result |
| --- | --- | --- | --- | --- |
| TC-01 | Login | Login with valid admin credentials | `admin@recruitexam.com`, `admin123` | Admin is redirected to dashboard |
| TC-02 | Login | Login with wrong password | Valid email, wrong password | Error message is shown |
| TC-03 | Admin | Create recruiter account | Name, email, password | Recruiter account is created |
| TC-04 | Admin | Create TPO account | Name, email, password, college details | TPO account and college mapping are created |
| TC-05 | Recruiter | Create exam | Title, duration, questions | Exam is saved successfully |
| TC-06 | Recruiter | Add MCQ question | Question, options, correct answer | MCQ is added to exam |
| TC-07 | Recruiter | Add coding question | Problem, test cases, marks | Coding question is added |
| TC-08 | Recruiter/TPO | Assign exam to candidate | Exam and candidate selected | Candidate can see assigned exam |
| TC-09 | Candidate | Start assigned exam | Candidate opens exam | Attempt is created and exam starts |
| TC-10 | Candidate | Submit MCQ answer | Selected option | Answer is stored |
| TC-11 | Candidate | Submit coding answer | Code solution | Test cases run and score is calculated |
| TC-12 | Candidate | Submit full exam | Completed answers | Result is generated |
| TC-13 | Result | View result | Candidate opens result page | Score and status are displayed |
| TC-14 | Certificate | Download certificate | Eligible candidate result | Certificate is available |
| TC-15 | Security | Access protected route without login | Open dashboard URL directly | User is redirected or blocked |

## Validation Rules

- Required fields should not allow empty values.
- Email fields should accept valid email format only.
- Passwords should not be stored as plain text.
- Only logged-in users should access protected pages.
- Role-based pages should be accessible only to allowed roles.
- Exam submission should save answers before result calculation.
- Coding questions should be evaluated using defined test cases.
- Results should be linked to the correct candidate and exam.

## Commands For Technical Checks

```bash
npm run test
npm run check
npm run lint
npm run build
```

## Automated Validation Added

The project includes a lightweight automated validation test file:

```text
server/lib/validation.test.ts
```

It checks:

- Email format validation.
- Password strength validation.
- Exam duration, pass marks, and schedule validation.

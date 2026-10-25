# Privacy Policy

**Operator / Data Fiduciary:** [COMPANY-legal-entity], [COMPANY-registered-address]
**Contact:** [COMPANY-privacy-email] · **Grievance Officer / DPO:** [COMPANY-DPO-contact]
**Effective date:** [COMPANY-effective-date] · **Last updated:** 2026-10-25
**Applicable law:** this policy is drafted to satisfy the EU/UK GDPR where
EU/UK data subjects are in scope and India's Digital Personal Data Protection
Act, 2023 (DPDP) for users in India. The governing jurisdiction must be
confirmed: [COMPANY-jurisdiction].

IntelliHire is a campus hiring platform connecting colleges (TPOs), recruiters
and candidates. This policy explains what personal data the platform
processes, why, for how long, and what rights you have. It describes the
system as it is actually built (schema in `database/*.sql`, backend in
`server_py/app/`).

---

## 1. Roles

- **Candidates** (students): data subjects. Accounts are created by your
  college's placement cell (TPO) or by recruiters of a drive you join; email
  + roll number are pre-provisioned by your institution in most flows.
- **Recruiters / TPOs / Admins**: authorized users who process candidate data
  on behalf of their organisation.
- Where a recruiter or college uses IntelliHire to assess *their own*
  applicants, that organisation is the **controller** of the candidate data
  and [COMPANY-legal-entity] acts as **processor**; for the platform's own
  accounts and operations, [COMPANY-legal-entity] is the **controller**.

---

## 2. Data categories we process

| Category | Concrete fields (actual storage) | Source |
| --- | --- | --- |
| **Identity & contact** | `users.name`, `users.email`, `users.roll_number`, `users.role`; `candidate_profiles.phone`, branch, graduation year | Institution import (TPO bulk upload via `POST /api/tpo/scan-marksheets` / bulk import), self-onboarding (`POST /api/candidate/onboarding`), recruiter/admin creation |
| **Academic data** | `candidate_profiles.cgpa`, `semester_grades` (JSONB), extracted marksheet fields (roll number, name, branch, CGPA, graduation year). **Marksheet files themselves are not stored**: uploads to the marksheet scanner are parsed in memory (OCR) and the extracted fields are saved, the file is discarded | You / your institution |
| **Career documents** | Resume file at `/uploads/resumes/...` on the server filesystem (`FILE_STORAGE_DIR`, referenced by `candidate_profiles.resume_url`), parsed skills and ATS analysis (`resume_ats_analysis`), links (GitHub/LinkedIn/portfolio), `projects`, `bio`, photo (`photo_url`) | You |
| **Assessment data** | Exam attempts (`attempts.score`, status, timing), MCQ answers (`answers`), code submissions (`coding_submissions.code`, language, score), plagiarism similarity flags (`plagiarism_flags`), question-bank interactions | Generated during exams |
| **Proctoring data** | Rows in `proctoring_snapshots`: event type (`camera_check`, `snapshot`, `violation`, `submission`), webcam-derived snapshot images stored as text (base64) in `snapshot_data`, violation counts and severity, tab-switch / anomaly messages, typing speed (`typing_speed_wpm`) | Collected **only while a proctored exam is running**, only if you proceed with proctoring enabled |
| **AI interview data** | `ai_interviews` (schedule/status), `ai_interview_answers` (question + **answer text**), AI-generated scores and feedback (`ai_feedback_reports`, strengths/improvements), recruiter voice interview records (`recruiter_voice_interviews`, `recruiter_voice_feedback`). The platform does **not** persist interview audio on the server; spoken answers reach the backend as text (transcribed/typed in the browser) | You + AI evaluation |
| **AI-derived scores** | Model outputs: ATS resume score, AI interview answer scores, candidate ranking predictions (marked experimental at the API layer) | Derived |
| **Authentication & security** | `users.password_hash` (bcrypt — never plain), `refresh_tokens.token_hash` (hashed refresh sessions with `created_by_ip`, `user_agent`, 30-day expiry), `audit_logs` (action, resource, method, path, IP, user agent) | System |
| **Platform content** | `certificates.certificate_url`, `badges`, `notifications`, `activity_feed` | System |

We do **not** intentionally collect special-category data (health, religion,
caste, biometric templates). Webcam snapshots are images captured during
proctored exams; we do not build face-recognition templates from them. If your
institution requires any field that qualifies as special-category data,
contact [COMPANY-privacy-email] before enabling it.

---

## 3. Why we process it (purposes) and lawful basis

| Purpose | Lawful basis (GDPR) | DPDP framing |
| --- | --- | --- |
| Operating the assessment pipeline: delivering exams, grading, results, certificates | **Legitimate interest** (Art. 6(1)(f)) in providing the recruitment service your institution/recruiter engaged us for; contract necessity for direct recruiter-driven drives | Legitimate use for employment-related purposes; processing necessary for the agreed purpose |
| Proctoring (webcam snapshots, tab-switch tracking, typing speed) | **Consent** (Art. 6(1)(a)) — proctoring is activated per exam and you may decline; declining may make you ineligible for that exam (we tell you which) | Consent, with the option to withdraw (you may leave the exam) |
| AI evaluation of resumes, interview answers, ranking | **Legitimate interest** in efficient shortlisting; outputs are decision-support for humans (the ranking endpoint is flagged experimental) and are never an automated-only adverse decision | Legitimate use; you may request human review of any AI-derived score |
| Security, fraud & cheating prevention (bcrypt, refresh-token sessions, audit logs, plagiarism checks) | **Legitimate interest** (Art. 6(1)(f)) in protecting the platform and exam integrity | Legitimate use for network/information security |
| Emails about exams, results, interview scheduling | **Legitimate interest** / contract necessity (transactional, not marketing) | Consent where required; transactional notices |
| Service improvement & aggregate analytics | **Legitimate interest**, aggregate/non-identifying where possible | Legitimate use |

Consent that is relied on can be withdrawn via [COMPANY-privacy-email] or the
in-product control where present; withdrawal does not affect prior processing.

---

## 4. Retention (summary)

Full detail with mechanisms: **docs/RETENTION_SCHEDULE.md**. Highlights,
matching the automated cleanup job (`cleanup_old_logs()` in
`database/14_data_retention.sql`, run every `DATA_RETENTION_INTERVAL_HOURS`,
default 24 h, production only):

- Audit logs, proctoring snapshots, notifications, activity feed: **365 days**, automatic deletion.
- Refresh-token sessions: **30 days** expiry (`refresh_tokens.expires_at`).
- Resumes: kept while your profile is active; deleted immediately by you via `DELETE /api/candidate/resume`.
- Exam results, code submissions, certificates: kept while your account exists (no automatic purge yet — see gap list in the retention schedule).

---

## 5. Sharing & subprocessors

We do not sell personal data. We share it only with:

| Subprocessor | Service | Data involved | Region |
| --- | --- | --- | --- |
| **Groq, Inc.** | LLM inference (`https://api.groq.com`, model configurable via `GROQ_MODEL`) | Resume text/skills, marksheet OCR text, interview questions & answer text for evaluation | [COMPANY-region-per-Groq-DPA] |
| **Judge0** | Code execution sandbox (`JUDGE0_API_URL`; production uses a **self-hosted private Judge0 container** on our own host; the public `ce.judge0.com` is only the development default) | Submitted code + test-case I/O only; no identity data | Self-hosted, [COMPANY-hosting-region] |
| **SMTP email provider** (`[COMPANY-smtp-provider]`, configured via `SMTP_HOST/USER/PASS`, sender default `noreply@intellihire.com`) | Transactional email (credentials, results, scheduling) | Name, email, exam result lines | [COMPANY-region] |
| **Hosting provider** `[COMPANY-hosting-provider]` | Application, PostgreSQL, Redis, MinIO object storage (S3-compatible, bucket `intellihire-uploads`), filesystem uploads | All of the above at rest | [COMPANY-hosting-region] |
| **Sentry** (`sentry-sdk`, enabled when `SENTRY_DSN` is set) | Error monitoring | Error events/stack traces, which may include identifiers (user id, email) present in request context | [COMPANY-region-per-Sentry-DPA] |
| **Campus (TPO) & recruiters** | Intended recipients of assessment outcomes | Scores, proctoring trust indicators, resumes of candidates in their drives | — |

Candidate documents (resumes, offer letters) are **not** publicly reachable:
they are served only through the authenticated, per-row-authorized endpoint
`GET /api/assets/files/{path}` or a 5-minute signed URL minted by
`POST /api/assets/sign`. Public pages expose only what you publish: the
public portfolio (`/portfolio/{slug}`, opt-in via `public_portfolio_slug`) and
certificate verification (`/certificates/verify/{id}`).

---

## 6. Your rights

Subject to applicable law (GDPR Arts. 15–21; DPDP, ss. 11–14), you may:

- **Access & export** your data. Status: profile data is visible in-product;
  a one-click machine-readable export of all categories is **[TODO:
  not yet implemented — request via [COMPANY-privacy-email], fulfilled
  manually within 30 days]**.
- **Rectify** profile fields in-product (`PUT /api/candidate/profile`); academic
  corrections via your TPO.
- **Erase** (right to be forgotten):
  - Resume: immediate self-service — `DELETE /api/candidate/resume` removes
    the file from disk and clears `resume_url` / `resume_ats_analysis`.
  - Whole account: request via [COMPANY-privacy-email]. Accounts are
    soft-deleted (`users.deleted_at`); hard deletion of remaining rows is
    **[TODO: purge job not yet implemented — performed manually within 30
    days, except where retention is legally required (see §4)]**.
- **Object / restrict** processing, and object to purely automated decisions:
  request human review of any AI-derived score via [COMPANY-privacy-email].
- **Withdraw consent** for proctoring or AI evaluation (see §3).

We respond within 30 days (GDPR) / as specified by DPDP rules.

---

## 7. Security measures

Passwords are bcrypt-hashed; sessions use HttpOnly cookies + CSRF tokens with
hashed, revocable refresh tokens; private uploads require session or
short-lived signed URLs with per-role authorization; metrics endpoints are
bearer-token gated (`METRICS_TOKEN`); production requires explicit HTTPS
origins; dependency/secret/container scanning runs in CI (see
docs/SECURITY_TESTING.md); database backups are taken nightly and drill-tested
(docs/DISASTER_RECOVERY.md). Incidents are handled per
docs/INCIDENT_RESPONSE.md.

---

## 8. Children

IntelliHire is used in college placement contexts; users are expected to be 16
or older. If you believe a minor's data was processed without verifiable
consent of a lawful guardian, contact [COMPANY-privacy-email].

## 9. Changes

Material changes will be announced via [COMPANY-channel] at least
[COMPANY-notice-period] before taking effect. The version history is kept
below.

| Version | Date | Change |
| --- | --- | --- |
| 0.1 (draft) | 2026-10-25 | Initial draft aligned to actual schema & code |

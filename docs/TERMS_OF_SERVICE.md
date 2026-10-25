# Terms of Service

**Operator:** [COMPANY-legal-entity], [COMPANY-registered-address]
**Contact:** [COMPANY-legal-email] · **Effective:** [COMPANY-effective-date]
**Governing law / jurisdiction:** [COMPANY-jurisdiction]

These Terms govern use of the IntelliHire campus hiring platform (the
"Service") by four kinds of users: **candidates** (students), **TPOs**
(training & placement officers), **recruiters**, and **admins**. Privacy
practices are described in docs/PRIVACY_POLICY.md, which forms part of these
Terms.

> Draft status: this is a working draft for [COMPANY] to review with counsel
> before publication. Placeholders are marked `[COMPANY]`.

---

## 1. Accounts and eligibility

- Candidate accounts are typically provisioned by your college's placement
  cell or by a recruiter running a drive on the platform; you activate them by
  setting a password (forced via `must_change_password`). You must provide
  accurate identity, academic (name, email, roll number, CGPA) and document
  information.
- You are responsible for your credentials. Sessions use short-lived access
  tokens and 30-day refresh sessions; log out of shared machines.
- One person, one account. Roles (`candidate`, `recruiter`, `tpo`, `admin`)
  define what you may access; attempting to elevate your role or access data
  outside your scope is prohibited.

## 2. Proctored assessments

- Some exams run with proctoring: webcam snapshots, tab-switch/violation
  events and typing-speed telemetry are recorded (`proctoring_snapshots`) and
  made available to the recruiter/TPO running the exam.
- By starting a proctored exam you consent to that capture for the duration
  of the exam. If you do not consent, do not start the exam; the recruiter
  decides whether an unproctored attempt is acceptable.
- The examination window is enforced by time limits and monitored for
  anomalies; severity is rated `low`/`medium`/`high`/`critical` and can be
  reviewed or overridden by exam administrators.

## 3. Assessment integrity

- Do not impersonate anyone, submit code or answers that are not yours,
  collude, scrape the question bank, or attempt to defeat the proctoring
  pipeline or the code-execution sandbox.
- Submissions are checked for plagiarism (similarity flags are recorded in
  `plagiarism_flags` and visible to recruiters).
- Suspected violations may result in attempt invalidation, account
  suspension, and notification of your institution or the affected recruiter.

## 4. Acceptable use

You must not:

- attack the Service (scanning, brute-force login — login is rate-limited to
  5 attempts/minute per source, injection, path traversal), or attempt to
  access other users' files, results or sessions;
- use automated tools against the API outside documented interfaces;
- upload malicious files (uploads are content-type and size validated) or
  content that is unlawful, defamatory, or infringing;
- resell or re-publish other users' personal data or assessment results
  without their institution's/recruiter's rights to do so.

## 5. AI-assisted features and scores

- The Service uses AI (Groq-hosted LLMs) to parse resumes/marksheets,
  evaluate interview answers and generate feedback, and offers an
  experimental candidate-ranking model.
- **AI outputs are decision support for humans, not decisions.** Recruiters
  and TPOs are responsible for hiring decisions; you may request human review
  of any AI-derived score (docs/PRIVACY_POLICY.md §6).
- Scores may contain errors. They are indicative, not certified qualifications,
  except for certificates explicitly issued for passed exams.

## 6. Certificates and portfolio

- Certificates are issued for exam attempts meeting the pass mark
  (`certificates` table) and can be verified at the public verification page
  (`/certificates/verify/{id}`).
- You may publish an optional public portfolio at a slug of your choice
  (`public_portfolio_slug` → `/portfolio/{slug}`); you choose what appears on
  it and can unpublish it at any time.

## 7. Service availability

- Target availability and disaster-recovery commitments (nightly backups,
  quarterly restore drills) are described in docs/DISASTER_RECOVERY.md. They
  are operational targets, not warranties, unless separately agreed in an SLA:
  [COMPANY-SLA-reference].
- Third-party dependencies (LLM provider, code-execution sandbox, email
  delivery) may interrupt parts of the Service; we restore them as described
  in docs/INCIDENT_RESPONSE.md.

## 8. Intellectual property

- Question banks, exams and platform code belong to [COMPANY-legal-entity] or
  their owners. You retain ownership of your documents and submissions; you
  grant the Service and the recruiters/TPOs of drives you enter a
  limited licence to process them for recruitment evaluation (per the Privacy
  Policy).

## 9. Suspension and termination

- We may suspend or terminate accounts that violate these Terms, on notice
  except where immediate action is required for security or legal compliance.
- On termination, deletion follows the retention schedule
  (docs/RETENTION_SCHEDULE.md); data required by law or ongoing dispute is
  retained per that schedule.

## 10. Disclaimers

The Service is provided "as is" and "as available" to the maximum extent
permitted by law. [COMPANY-legal-entity] does not warrant that assessment
outcomes will reflect ability, that AI outputs are error-free, or that the
Service will be uninterrupted.

## 11. Limitation of liability

To the maximum extent permitted by applicable law,
[COMPANY-legal-entity]'s aggregate liability arising out of or relating to
the Service is limited to [COMPANY-liability-cap, e.g. the fees paid by the
relevant customer in the 12 months preceding the claim — for candidates using
the Service free of charge, liability is limited to the statutory minimum].
Nothing excludes liability that cannot be excluded by law.

## 12. Dispute resolution and governing law

These Terms are governed by the laws of [COMPANY-jurisdiction]. Disputes are
subject to [COMPANY-dispute-resolution: courts of X / arbitration seat X].
Consumer rights available under mandatory local law are unaffected.

## 13. Changes

We will announce material changes via [COMPANY-channel] at least
[COMPANY-notice-period] in advance; continued use after the effective date
constitutes acceptance.

## 14. Contact

[COMPANY-legal-entity] · [COMPANY-registered-address] ·
[COMPANY-legal-email] · Grievance Officer: [COMPANY-DPO-contact]

| Version | Date | Change |
| --- | --- | --- |
| 0.1 (draft) | 2026-10-25 | Initial draft aligned to actual product behaviour |

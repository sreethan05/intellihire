# IntelliHire — Roadmap / TODO

Living checklist for the next iterations. Completed items move to git history.

## Platform hardening
- [ ] Migrate remaining flat routers (`tpo.py`, `exam_pipeline.py`, `ai.py`) into `app/routers/` + `app/repositories/` (refactor in progress).
- [ ] Replace the hand-rolled query builder in `db.py` with the repository layer everywhere, then SQLAlchemy 2.0 async (see `docs/database_migration_evaluation.md`).
- [ ] Replace remaining `# nosec` SQL suppressions with reviewed, parameterized query paths plus dedicated tests.
- [ ] CI: report coverage trends; keep pip-audit + npm audit + bandit green on every PR.

## Code health
- [ ] Break up oversized frontend components into focused components + hooks: `CreateExam.tsx` (~1.5k lines), `CandidateInterview.tsx`, `RecruiterCandidateAnalytics.tsx`, `TakeExam.tsx`.
- [ ] Generate locked, reproducible Python builds; keep prod and dev dependencies separated in `requirements.txt`.

## Reliability & operations
- [ ] Load tests for login, dashboards, code execution, WebSockets, and concurrent exam candidates.
- [ ] Centralized error monitoring, structured log dashboards, and alerting (Prometheus instrumentation exists; wire alert rules + Sentry DSN).
- [ ] Document SLOs; schedule backup-restore drills for the production database.

## Product
- [ ] Self-serve onboarding: college/workspace signup wizard (currently seed-script based).
- [ ] Real face/gaze detection to replace the YCbCr heuristic proctoring (TensorFlow.js BlazeFace or similar).
- [ ] Retrain the ML candidate ranker on real drive outcomes (interview pass/fail labels) once live drives produce data; keep automated ranking advisory-only with human review.

## Trust & compliance
- [ ] Tenant-isolation test suite across all college-scoped endpoints (extends `test_authz_matrix.py`).
- [ ] GDPR/DPDP flows: consent capture, data export, data deletion, retention schedule enforcement surfaced in Admin UI.
- [ ] Proctoring bias review + candidate appeal workflow for flagged attempts.
- [ ] SOC 2 readiness checklist doc (audit logging exists; formalize controls).

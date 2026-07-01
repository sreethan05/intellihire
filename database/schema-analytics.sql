-- IntelliHire Analytics Schema Additions
-- Adds columns needed for deep analytics features

-- 1. Time tracking per answer (for question-level analytics, rushing detection)
alter table answers add column if not exists time_spent_seconds integer default 0;

-- 2. Track when background grading completed (for system health monitoring)
alter table attempts add column if not exists graded_at timestamptz;

-- 3. Track how long background grading took in milliseconds
alter table attempts add column if not exists grading_duration_ms integer;

-- 4. Severity weighting for proctoring violations (1 tab switch ≠ 5 tab switches)
alter table proctoring_snapshots add column if not exists violation_severity text default 'low' check (violation_severity in ('low', 'medium', 'high', 'critical'));

-- 5. Indexes for analytics queries
create index if not exists answers_attempt_question_idx on answers(attempt_id, question_id);
create index if not exists answers_correct_idx on answers(is_correct);
create index if not exists coding_submissions_attempt_idx on coding_submissions(attempt_id);
create index if not exists coding_submissions_question_idx on coding_submissions(coding_question_id);
create index if not exists coding_submissions_status_idx on coding_submissions(status);
create index if not exists proctoring_violation_idx on proctoring_snapshots(event_type, violation_severity);
create index if not exists attempts_recruiter_idx on attempts(recruiter_id, status);
create index if not exists attempts_score_idx on attempts(score);
create index if not exists candidate_status_job_idx on candidate_status(job_id, status);
create index if not exists ai_interviews_candidate_idx on ai_interviews(candidate_id, status);

-- 6. Resume parsing and ATS analytics
alter table candidate_profiles add column if not exists resume_ats_analysis jsonb;

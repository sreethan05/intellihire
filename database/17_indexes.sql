-- Database Performance Optimization Indexes

CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_cand ON exam_attempts(exam_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_status ON exam_attempts(status);
CREATE INDEX IF NOT EXISTS idx_students_college_branch_cgpa ON students(college_id, branch, cgpa);
CREATE INDEX IF NOT EXISTS idx_certificates_candidate_exam ON certificates(candidate_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_timestamp ON audit_logs(actor_id, timestamp DESC);

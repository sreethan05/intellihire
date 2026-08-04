-- Fixed table names: exam_attempts -> attempts, students -> candidate_profiles
CREATE INDEX IF NOT EXISTS idx_attempts_exam_cand ON attempts(exam_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_college_branch_cgpa ON candidate_profiles(college_id, branch, cgpa);
CREATE INDEX IF NOT EXISTS idx_certificates_candidate_exam ON certificates(candidate_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, created_at DESC);

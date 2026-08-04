-- 18. Add 'grading' status to attempts for background grading tracking
ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_status_check;
ALTER TABLE attempts ADD CONSTRAINT attempts_status_check
  CHECK (status IN ('in_progress', 'grading', 'completed'));

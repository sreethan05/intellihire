-- Allow the attempt-unlock override event recorded by
-- POST /api/proctoring/attempt/{attemptId}/override.
-- The original CHECK constraint in 06_proctoring.sql only allowed
-- ('camera_check', 'snapshot', 'violation', 'submission'), so the
-- insert always failed with a check violation and locked attempts
-- could never be unlocked.
ALTER TABLE proctoring_snapshots DROP CONSTRAINT IF EXISTS proctoring_snapshots_event_type_check;
ALTER TABLE proctoring_snapshots ADD CONSTRAINT proctoring_snapshots_event_type_check
  CHECK (event_type IN ('camera_check', 'snapshot', 'violation', 'submission', 'admin_override'));

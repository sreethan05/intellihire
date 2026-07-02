-- 1. Proctoring Snapshots Table
CREATE TABLE IF NOT EXISTS proctoring_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE NOT NULL,
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('camera_check', 'snapshot', 'violation', 'submission')),
  violation_count integer DEFAULT 0,
  violation_severity text DEFAULT 'low' CHECK (violation_severity IN ('low', 'medium', 'high', 'critical')),
  message text,
  snapshot_data text,
  typing_speed_wpm integer DEFAULT 0,
  captured_at timestamptz DEFAULT now()
);

-- Proctoring indexes
CREATE INDEX IF NOT EXISTS proctoring_snapshots_attempt_idx ON proctoring_snapshots(attempt_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS proctoring_snapshots_exam_idx ON proctoring_snapshots(exam_id, candidate_id);
CREATE INDEX IF NOT EXISTS proctoring_violation_idx ON proctoring_snapshots(event_type, violation_severity);

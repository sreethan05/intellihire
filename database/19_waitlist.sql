-- 19. Exam waitlist table for overbooked/capacity-limited exams
CREATE TABLE IF NOT EXISTS exam_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  position integer NOT NULL DEFAULT 0,
  status text DEFAULT 'waiting' CHECK (status IN ('waiting', 'promoted', 'expired', 'cancelled')),
  promoted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(exam_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_waitlist_exam_position ON exam_waitlist(exam_id, position);
CREATE INDEX IF NOT EXISTS idx_exam_waitlist_status ON exam_waitlist(status);

-- Add seat capacity to exams (nullable = unlimited)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS seat_capacity integer;

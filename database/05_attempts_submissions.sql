-- 1. Attempts Table (exam attempts)
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) NOT NULL,
  candidate_id uuid REFERENCES users(id) NOT NULL,
  recruiter_id uuid REFERENCES users(id) NOT NULL,
  status text DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  score integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  grading_duration_ms integer,
  UNIQUE(exam_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS attempts_recruiter_idx ON attempts(recruiter_id, status);
CREATE INDEX IF NOT EXISTS attempts_score_idx ON attempts(score);

-- 2. MCQ Answers Table
CREATE TABLE IF NOT EXISTS answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE NOT NULL,
  question_id uuid REFERENCES questions(id) NOT NULL,
  selected_option text NOT NULL,
  is_correct boolean DEFAULT false,
  marks_obtained integer DEFAULT 0,
  time_spent_seconds integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS answers_attempt_question_idx ON answers(attempt_id, question_id);
CREATE INDEX IF NOT EXISTS answers_correct_idx ON answers(is_correct);

-- 3. Coding Submissions Table
CREATE TABLE IF NOT EXISTS coding_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE NOT NULL,
  coding_question_id uuid REFERENCES coding_questions(id) NOT NULL,
  code text NOT NULL,
  language text NOT NULL,
  score integer DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(attempt_id, coding_question_id)
);

CREATE INDEX IF NOT EXISTS coding_submissions_attempt_idx ON coding_submissions(attempt_id);
CREATE INDEX IF NOT EXISTS coding_submissions_question_idx ON coding_submissions(coding_question_id);
CREATE INDEX IF NOT EXISTS coding_submissions_status_idx ON coding_submissions(status);

-- 4. Plagiarism Flags Table
CREATE TABLE IF NOT EXISTS plagiarism_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE NOT NULL,
  coding_submission_id uuid REFERENCES coding_submissions(id) ON DELETE CASCADE,
  similarity_score numeric(5,2) DEFAULT 0,
  matched_with_attempt_id uuid REFERENCES attempts(id) ON DELETE SET NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 5. Certificates Table
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  certificate_url text,
  issued_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, exam_id)
);

-- 6. Badges Table
CREATE TABLE IF NOT EXISTS badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  awarded_at timestamptz DEFAULT now()
);

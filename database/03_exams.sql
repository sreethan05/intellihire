-- 1. Exams Table
CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  duration integer NOT NULL, -- in minutes
  total_marks integer NOT NULL,
  pass_marks integer DEFAULT 0,
  available_from timestamptz,
  available_until timestamptz,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  shuffle_questions boolean DEFAULT false,
  negative_marking numeric DEFAULT 0,
  created_by uuid REFERENCES users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Exam MCQ Questions Link Table
CREATE TABLE IF NOT EXISTS exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  marks integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- 3. Exam Coding Questions Link Table
CREATE TABLE IF NOT EXISTS exam_coding_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  coding_question_id uuid REFERENCES coding_questions(id) ON DELETE CASCADE NOT NULL,
  marks integer DEFAULT 10,
  created_at timestamptz DEFAULT now()
);

-- 4. Exam Assignments Table
CREATE TABLE IF NOT EXISTS exam_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES users(id) NOT NULL,
  job_id uuid, -- Reference jobs if created
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(exam_id, candidate_id)
);

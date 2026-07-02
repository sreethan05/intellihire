-- 1. AI Interviews Table
CREATE TABLE IF NOT EXISTS ai_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  exam_id uuid REFERENCES exams(id) ON DELETE SET NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed')),
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  scheduled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  score integer DEFAULT 0,
  relevance_score integer DEFAULT 0,
  communication_score integer DEFAULT 0,
  intro_score integer DEFAULT 0,
  speaking_score integer DEFAULT 0,
  pronunciation_score integer DEFAULT 0,
  technical_score integer DEFAULT 0,
  selected boolean DEFAULT false,
  summary text,
  feedback text,
  started_at timestamptz DEFAULT now(),
  submitted_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_interviews_candidate_idx ON ai_interviews(candidate_id, status);

-- 2. AI Interview Answers Table
CREATE TABLE IF NOT EXISTS ai_interview_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid REFERENCES ai_interviews(id) ON DELETE CASCADE NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  score integer DEFAULT 0,
  feedback text,
  created_at timestamptz DEFAULT now()
);

-- 3. AI Feedback Reports Table
CREATE TABLE IF NOT EXISTS ai_feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE,
  report_type text DEFAULT 'improvement',
  content text NOT NULL,
  strengths jsonb DEFAULT '[]',
  improvements jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- 4. Recruiter Voice Interviews Table
CREATE TABLE IF NOT EXISTS recruiter_voice_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL,
  recruiter_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  job_position text NOT NULL,
  job_description text NOT NULL,
  duration_minutes integer DEFAULT 15,
  interview_types jsonb DEFAULT '[]',
  question_list jsonb DEFAULT '[]',
  status text DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recruiter_voice_interviews_recruiter_idx ON recruiter_voice_interviews(recruiter_id, created_at DESC);

-- 5. Recruiter Voice Feedback Table
CREATE TABLE IF NOT EXISTS recruiter_voice_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_interview_id uuid REFERENCES recruiter_voice_interviews(id) ON DELETE CASCADE NOT NULL,
  public_id text REFERENCES recruiter_voice_interviews(public_id) ON DELETE CASCADE NOT NULL,
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  transcript jsonb DEFAULT '[]',
  feedback jsonb DEFAULT '{}',
  recommended boolean DEFAULT false,
  overall_rating numeric(4,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recruiter_voice_feedback_public_idx ON recruiter_voice_feedback(public_id, created_at DESC);

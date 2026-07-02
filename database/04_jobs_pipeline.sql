-- 1. Jobs Table
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  company_name text NOT NULL,
  company_description text,
  college_id uuid REFERENCES colleges(id) NOT NULL,
  min_cgpa numeric(4,2) DEFAULT 0,
  allowed_branches jsonb DEFAULT '[]',
  required_skills jsonb DEFAULT '[]',
  salary_min numeric,
  salary_max numeric,
  drive_date timestamptz,
  exam_id uuid REFERENCES exams(id),
  status text DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
  interview_pass_score integer DEFAULT 60,
  interview_duration integer DEFAULT 15,
  created_by uuid REFERENCES users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add reference in exam_assignments
ALTER TABLE exam_assignments ADD CONSTRAINT fk_assignments_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

-- 2. Candidate Status Table
CREATE TABLE IF NOT EXISTS candidate_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'registered' CHECK (status IN ('registered', 'exam_taken', 'passed', 'shortlisted', 'on_hold', 'rejected', 'offered')),
  recruiter_notes text,
  offer_letter_url text,
  offer_accepted_at timestamptz,
  offer_declined_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS candidate_status_job_idx ON candidate_status(job_id, status);

-- 3. Candidate Pipeline Table (for tracking workflow states)
CREATE TABLE IF NOT EXISTS candidate_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  entered_at timestamptz DEFAULT now(),
  exited_at timestamptz,
  notes text,
  updated_by uuid REFERENCES users(id),
  UNIQUE(candidate_id, job_id, stage)
);

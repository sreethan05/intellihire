-- Unified Action Items (per user, per role)
CREATE TABLE IF NOT EXISTS action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  type text NOT NULL, -- 'exam_deadline', 'interview_pending', 'verify_docs', 'proctoring_alert', etc.
  title text NOT NULL,
  description text,
  priority text DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'
  action_url text, -- where to go when clicked
  entity_id uuid, -- related exam_id, interview_id, etc.
  entity_type text, -- 'exam', 'interview', 'candidate', 'drive'
  due_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Activity Feed (platform-wide events)
CREATE TABLE IF NOT EXISTS activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text,
  target_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'exam_completed', 'interview_scheduled', 'offer_made', 'drive_opened', etc.
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Candidate Status Pipeline (for journey tracking)
CREATE TABLE IF NOT EXISTS candidate_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  stage text NOT NULL, -- 'registered', 'eligible', 'exam_assigned', 'exam_taken', 'shortlisted', 'interview_scheduled', 'interviewed', 'offered', 'placed', 'rejected'
  entered_at timestamptz DEFAULT now(),
  exited_at timestamptz,
  notes text,
  updated_by uuid REFERENCES users(id),
  UNIQUE(candidate_id, job_id, stage)
);

-- Alter existing notifications table to add type and action_url
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url text;

-- Alter candidate_profiles to add placement indicators and portfolio links
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS placement_ready boolean DEFAULT false;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS public_portfolio_slug text UNIQUE;

-- Alter proctoring_snapshots to add typing speed
ALTER TABLE proctoring_snapshots ADD COLUMN IF NOT EXISTS typing_speed_wpm integer DEFAULT 0;

-- Alter candidate_status to support digital offers and response states
ALTER TABLE candidate_status ADD COLUMN IF NOT EXISTS offer_letter_url text;
ALTER TABLE candidate_status ADD COLUMN IF NOT EXISTS offer_accepted_at timestamptz;
ALTER TABLE candidate_status ADD COLUMN IF NOT EXISTS offer_declined_at timestamptz;

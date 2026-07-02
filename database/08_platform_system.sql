-- 1. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  body text,
  type text DEFAULT 'info',
  action_url text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. TPO Uploads Table
CREATE TABLE IF NOT EXISTS tpo_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tpo_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  college_id uuid REFERENCES colleges(id) ON DELETE CASCADE NOT NULL,
  file_name text,
  rows_total integer DEFAULT 0,
  rows_created integer DEFAULT 0,
  rows_failed integer DEFAULT 0,
  status text DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at timestamptz DEFAULT now()
);

-- 3. Action Items Table
CREATE TABLE IF NOT EXISTS action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'normal',
  action_url text,
  entity_id uuid,
  entity_type text,
  due_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 4. Activity Feed Table
CREATE TABLE IF NOT EXISTS activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text,
  target_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

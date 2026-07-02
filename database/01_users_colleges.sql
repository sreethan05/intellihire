CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Colleges Table
CREATE TABLE IF NOT EXISTS colleges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  location text,
  created_at timestamptz DEFAULT now()
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'tpo', 'recruiter', 'candidate')),
  roll_number text UNIQUE,
  college_id uuid REFERENCES colleges(id) ON DELETE SET NULL,
  must_change_password boolean DEFAULT false,
  profile_complete boolean DEFAULT true,
  interview_credits integer DEFAULT 3,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Alter colleges to link created_by user
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);

-- 3. Candidate Profiles Table
CREATE TABLE IF NOT EXISTS candidate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  college_id uuid REFERENCES colleges(id) ON DELETE CASCADE NOT NULL,
  roll_number text NOT NULL UNIQUE,
  branch text NOT NULL,
  cgpa numeric(4,2) NOT NULL,
  graduation_year integer NOT NULL,
  phone text,
  skills jsonb DEFAULT '[]',
  domain_preference text,
  marksheet_url text,
  resume_url text,
  photo_url text,
  public_portfolio_slug text UNIQUE,
  github_url text,
  linkedin_url text,
  portfolio_url text,
  bio text,
  projects jsonb DEFAULT '[]',
  resume_ats_analysis jsonb,
  documents_verified boolean DEFAULT false,
  profile_complete boolean DEFAULT false,
  placement_ready boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

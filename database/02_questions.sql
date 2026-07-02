-- 1. MCQ Questions Table
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_option text NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  marks integer DEFAULT 1,
  topic text DEFAULT 'general',
  difficulty text DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard', 'very_hard')),
  subtopic text DEFAULT 'general',
  concept_tags jsonb DEFAULT '[]',
  bloom_level text DEFAULT 'understand' CHECK (bloom_level IN ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create')),
  estimated_time_sec integer DEFAULT 60,
  last_used_at timestamptz,
  use_count integer DEFAULT 0,
  avg_candidate_score numeric(4,2),
  prerequisite_concepts jsonb DEFAULT '[]',
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Indexes for questions
CREATE INDEX IF NOT EXISTS questions_topic_difficulty_idx ON questions(topic, difficulty);
CREATE INDEX IF NOT EXISTS questions_subtopic_idx ON questions(subtopic);
CREATE INDEX IF NOT EXISTS questions_bloom_idx ON questions(bloom_level);

-- 2. Coding Questions Table
CREATE TABLE IF NOT EXISTS coding_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  difficulty text DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard', 'very_hard')),
  starter_code text DEFAULT '',
  test_cases jsonb DEFAULT '[]',
  input_format text,
  output_format text,
  constraints_text text,
  sample_cases jsonb DEFAULT '[]',
  hidden_cases jsonb DEFAULT '[]',
  topic_tags jsonb DEFAULT '[]',
  accepted_languages jsonb DEFAULT '["python","java","cpp","javascript"]',
  time_limit_ms integer DEFAULT 2000,
  memory_limit_kb integer DEFAULT 128000,
  marks integer DEFAULT 10,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coding_questions_title_unique ON coding_questions(title);

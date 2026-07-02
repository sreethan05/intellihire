-- IntelliHire Unified Production Database Schema
-- Combines all base schemas, analytics extensions, question-bank columns, and unified features tables.
-- Run this script first in pgAdmin to set up all tables and constraints.

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

-- 4. Exams Table
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

-- 5. Jobs Table
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

-- 6. Candidate Status Table
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

-- 7. MCQ Questions Table
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

-- 8. Exam MCQ Questions Link Table
CREATE TABLE IF NOT EXISTS exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  marks integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- 9. Coding Questions Table
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

-- 10. Exam Coding Questions Link Table
CREATE TABLE IF NOT EXISTS exam_coding_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  coding_question_id uuid REFERENCES coding_questions(id) ON DELETE CASCADE NOT NULL,
  marks integer DEFAULT 10,
  created_at timestamptz DEFAULT now()
);

-- 11. Exam Assignments Table
CREATE TABLE IF NOT EXISTS exam_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES users(id) NOT NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(exam_id, candidate_id)
);

-- 12. Attempts Table
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

-- 13. MCQ Answers Table
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

-- 14. Coding Submissions Table
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

-- 15. Proctoring Snapshots Table
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

-- 16. Plagiarism Flags Table
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

-- 17. Certificates Table
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  certificate_url text,
  issued_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, exam_id)
);

-- 18. Badges Table
CREATE TABLE IF NOT EXISTS badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  awarded_at timestamptz DEFAULT now()
);

-- 19. Notifications Table
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

-- 20. TPO Uploads Table
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

-- 21. AI Interviews Table
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

-- 22. AI Interview Answers Table
CREATE TABLE IF NOT EXISTS ai_interview_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid REFERENCES ai_interviews(id) ON DELETE CASCADE NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  score integer DEFAULT 0,
  feedback text,
  created_at timestamptz DEFAULT now()
);

-- 23. AI Feedback Reports Table
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

-- 24. Recruiter Voice Interviews Table
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

-- 25. Recruiter Voice Feedback Table
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

-- 26. Action Items Table
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

-- 27. Activity Feed Table
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

-- 28. Candidate Pipeline Table
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


-- ─── DATABASE INDEXES ───
CREATE INDEX IF NOT EXISTS answers_attempt_question_idx ON answers(attempt_id, question_id);
CREATE INDEX IF NOT EXISTS answers_correct_idx ON answers(is_correct);
CREATE INDEX IF NOT EXISTS coding_submissions_attempt_idx ON coding_submissions(attempt_id);
CREATE INDEX IF NOT EXISTS coding_submissions_question_idx ON coding_submissions(coding_question_id);
CREATE INDEX IF NOT EXISTS coding_submissions_status_idx ON coding_submissions(status);
CREATE INDEX IF NOT EXISTS proctoring_violation_idx ON proctoring_snapshots(event_type, violation_severity);
CREATE INDEX IF NOT EXISTS attempts_recruiter_idx ON attempts(recruiter_id, status);
CREATE INDEX IF NOT EXISTS attempts_score_idx ON attempts(score);
CREATE INDEX IF NOT EXISTS candidate_status_job_idx ON candidate_status(job_id, status);
CREATE INDEX IF NOT EXISTS ai_interviews_candidate_idx ON ai_interviews(candidate_id, status);
CREATE INDEX IF NOT EXISTS questions_topic_difficulty_idx ON questions(topic, difficulty);
CREATE INDEX IF NOT EXISTS questions_subtopic_idx ON questions(subtopic);
CREATE INDEX IF NOT EXISTS questions_bloom_idx ON questions(bloom_level);
CREATE INDEX IF NOT EXISTS proctoring_snapshots_attempt_idx ON proctoring_snapshots(attempt_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS proctoring_snapshots_exam_idx ON proctoring_snapshots(exam_id, candidate_id);
CREATE INDEX IF NOT EXISTS recruiter_voice_interviews_recruiter_idx ON recruiter_voice_interviews(recruiter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recruiter_voice_feedback_public_idx ON recruiter_voice_feedback(public_id, created_at DESC);


-- ─── SEED DEFAULT DATA ───

-- Seed default coding questions
INSERT INTO coding_questions (
  title,
  description,
  difficulty,
  starter_code,
  test_cases,
  sample_cases,
  hidden_cases,
  input_format,
  output_format,
  constraints_text,
  topic_tags,
  accepted_languages,
  marks
) VALUES
('Two Sum', 'Given an array of integers and a target, print the indices of two numbers that add up to the target. Print the smaller index first.', 'easy', 'n = int(input())\narr = list(map(int, input().split()))\ntarget = int(input())\n# write your code here', '[{"input":"4\n2 7 11 15\n9","expected_output":"0 1"},{"input":"5\n1 3 4 6 8\n10","expected_output":"2 3"}]', '[{"input":"4\n2 7 11 15\n9","expected_output":"0 1"}]', '[{"input":"6\n5 1 9 2 8 4\n13","expected_output":"0 4"}]', 'n, array elements, target', 'Two zero-based indices', '2 <= n <= 100000', '["array","hashing"]', '["python","java","cpp","javascript"]', 10),
('Reverse Words', 'Given a sentence, reverse the order of words while keeping each word unchanged.', 'easy', 's = input().strip()\n# write your code here', '[{"input":"campus hiring platform","expected_output":"platform hiring campus"},{"input":"hello world","expected_output":"world hello"}]', '[{"input":"campus hiring platform","expected_output":"platform hiring campus"}]', '[{"input":"one two three four","expected_output":"four three two one"}]', 'A single line string', 'Words in reversed order', '1 <= length <= 10000', '["string"]', '["python","java","cpp","javascript"]', 10),
('Valid Parentheses', 'Check whether a string containing brackets (), {}, [] is balanced. Print YES or NO.', 'easy', 's = input().strip()\n# write your code here', '[{"input":"({[]})","expected_output":"YES"},{"input":"([)]","expected_output":"NO"}]', '[{"input":"({[]})","expected_output":"YES"}]', '[{"input":"((()))[]{}","expected_output":"YES"}]', 'Bracket string', 'YES or NO', '1 <= length <= 100000', '["stack","string"]', '["python","java","cpp","javascript"]', 10),
('Maximum Subarray Sum', 'Find the maximum possible sum of a contiguous subarray.', 'easy', 'n = int(input())\narr = list(map(int, input().split()))\n# write your code here', '[{"input":"5\n-2 1 -3 4 -1","expected_output":"4"},{"input":"4\n1 2 3 4","expected_output":"10"}]', '[{"input":"5\n-2 1 -3 4 -1","expected_output":"4"}]', '[{"input":"6\n-5 -1 -8 -2 -3 -4","expected_output":"-1"}]', 'n and array', 'Maximum sum', '1 <= n <= 100000', '["array","dynamic-programming"]', '["python","java","cpp","javascript"]', 10),
('Count Frequencies', 'Print each distinct integer and its frequency in first-occurrence order.', 'easy', 'n = int(input())\narr = list(map(int, input().split()))\n# write your code here', '[{"input":"7\n4 5 4 6 5 4 7","expected_output":"4 3\n5 2\n6 1\n7 1"}]', '[{"input":"7\n4 5 4 6 5 4 7","expected_output":"4 3\n5 2\n6 1\n7 1"}]', '[{"input":"5\n1 1 1 1 1","expected_output":"1 5"}]', 'n and array', 'value frequency per line', '1 <= n <= 100000', '["hashing","array"]', '["python","java","cpp","javascript"]', 10),
('Binary Search', 'Given a sorted array and key, print the index of the key or -1 if absent.', 'easy', 'n = int(input())\narr = list(map(int, input().split()))\nkey = int(input())\n# write your code here', '[{"input":"5\n1 3 5 7 9\n7","expected_output":"3"},{"input":"4\n2 4 6 8\n5","expected_output":"-1"}]', '[{"input":"5\n1 3 5 7 9\n7","expected_output":"3"}]', '[{"input":"6\n10 20 30 40 50 60\n10","expected_output":"0"}]', 'n, sorted array, key', 'Index or -1', '1 <= n <= 100000', '["binary-search","array"]', '["python","java","cpp","javascript"]', 10),
('Merge Intervals Count', 'Given intervals, merge overlapping intervals and print the number of intervals after merging.', 'medium', 'n = int(input())\nintervals = [tuple(map(int, input().split())) for _ in range(n)]\n# write your code here', '[{"input":"4\n1 3\n2 6\n8 10\n15 18","expected_output":"3"},{"input":"2\n1 4\n4 5","expected_output":"1"}]', '[{"input":"4\n1 3\n2 6\n8 10\n15 18","expected_output":"3"}]', '[{"input":"3\n1 2\n3 4\n5 6","expected_output":"3"}]', 'n followed by intervals', 'Merged interval count', '1 <= n <= 100000', '["sorting","intervals"]', '["python","java","cpp","javascript"]', 15),
('Longest Unique Substring', 'Print the length of the longest substring without repeating characters.', 'medium', 's = input().strip()\n# write your code here', '[{"input":"abcabcbb","expected_output":"3"},{"input":"bbbbb","expected_output":"1"}]', '[{"input":"abcabcbb","expected_output":"3"}]', '[{"input":"pwwkew","expected_output":"3"}]', 'String s', 'Integer length', '1 <= length <= 100000', '["sliding-window","string"]', '["python","java","cpp","javascript"]', 15),
('Rotate Array', 'Rotate an array to the right by k positions and print the result.', 'medium', 'n, k = map(int, input().split())\narr = list(map(int, input().split()))\n# write your code here', '[{"input":"5 2\n1 2 3 4 5","expected_output":"4 5 1 2 3"},{"input":"3 4\n1 2 3","expected_output":"3 1 2"}]', '[{"input":"5 2\n1 2 3 4 5","expected_output":"4 5 1 2 3"}]', '[{"input":"1 100\n9","expected_output":"9"}]', 'n k and array', 'Rotated array', '1 <= n <= 100000', '["array"]', '["python","java","cpp","javascript"]', 15),
('Matrix Diagonal Sum', 'Given an n x n matrix, print the sum of primary and secondary diagonals, counting center once.', 'medium', 'n = int(input())\nmat = [list(map(int, input().split())) for _ in range(n)]\n# write your code here', '[{"input":"3\n1 2 3\n4 5 6\n7 8 9","expected_output":"25"},{"input":"2\n1 2\n3 4","expected_output":"10"}]', '[{"input":"3\n1 2 3\n4 5 6\n7 8 9","expected_output":"25"}]', '[{"input":"1\n7","expected_output":"7"}]', 'n and matrix rows', 'Diagonal sum', '1 <= n <= 500', '["matrix"]', '["python","java","cpp","javascript"]', 15),
('First Non-Repeating Character', 'Print the first character that appears exactly once, or -1 if none exists.', 'medium', 's = input().strip()\n# write your code here', '[{"input":"swiss","expected_output":"w"},{"input":"aabb","expected_output":"-1"}]', '[{"input":"swiss","expected_output":"w"}]', '[{"input":"recruiter","expected_output":"c"}]', 'String s', 'Character or -1', '1 <= length <= 100000', '["hashing","string"]', '["python","java","cpp","javascript"]', 15),
('Minimum Platforms', 'Given arrival and departure times, print the minimum number of platforms required.', 'medium', 'n = int(input())\narr = list(map(int, input().split()))\ndep = list(map(int, input().split()))\n# write your code here', '[{"input":"6\n900 940 950 1100 1500 1800\n910 1200 1120 1130 1900 2000","expected_output":"3"}]', '[{"input":"6\n900 940 950 1100 1500 1800\n910 1200 1120 1130 1900 2000","expected_output":"3"}]', '[{"input":"3\n100 200 300\n150 250 350","expected_output":"1"}]', 'n, arrivals, departures', 'Minimum platforms', '1 <= n <= 100000', '["sorting","greedy"]', '["python","java","cpp","javascript"]', 15),
('Climbing Stairs', 'Print the number of distinct ways to climb n stairs taking 1 or 2 steps at a time.', 'medium', 'n = int(input())\n# write your code here', '[{"input":"4","expected_output":"5"},{"input":"1","expected_output":"1"}]', '[{"input":"4","expected_output":"5"}]', '[{"input":"10","expected_output":"89"}]', 'Integer n', 'Number of ways', '1 <= n <= 45', '["dynamic-programming"]', '["python","java","cpp","javascript"]', 15),
('Coin Change Ways', 'Given coin denominations and an amount, print the number of ways to make the amount.', 'medium', 'n, amount = map(int, input().split())\ncoins = list(map(int, input().split()))\n# write your code here', '[{"input":"3 4\n1 2 3","expected_output":"4"},{"input":"2 5\n2 5","expected_output":"1"}]', '[{"input":"3 4\n1 2 3","expected_output":"4"}]', '[{"input":"4 10\n2 5 3 6","expected_output":"5"}]', 'n amount and coins', 'Number of combinations', '1 <= amount <= 5000', '["dynamic-programming"]', '["python","java","cpp","javascript"]', 15),
('Kth Largest Element', 'Print the kth largest element in the array.', 'medium', 'n, k = map(int, input().split())\narr = list(map(int, input().split()))\n# write your code here', '[{"input":"6 2\n3 2 1 5 6 4","expected_output":"5"},{"input":"5 1\n7 4 6 3 9","expected_output":"9"}]', '[{"input":"6 2\n3 2 1 5 6 4","expected_output":"5"}]', '[{"input":"4 4\n10 20 30 40","expected_output":"10"}]', 'n k and array', 'kth largest value', '1 <= k <= n <= 100000', '["heap","sorting"]', '["python","java","cpp","javascript"]', 15),
('Graph BFS Distance', 'Given an unweighted undirected graph and source, print shortest distances from source or -1.', 'hard', 'n, m = map(int, input().split())\nedges = [tuple(map(int, input().split())) for _ in range(m)]\ns = int(input())\n# write your code here', '[{"input":"4 3\n0 1\n1 2\n2 3\n0","expected_output":"0 1 2 3"}]', '[{"input":"4 3\n0 1\n1 2\n2 3\n0","expected_output":"0 1 2 3"}]', '[{"input":"5 2\n0 1\n3 4\n0","expected_output":"0 1 -1 -1 -1"}]', 'n m, edges, source', 'Distances space-separated', '1 <= n <= 100000', '["graph","bfs"]', '["python","java","cpp","javascript"]', 20),
('Detect Cycle Directed', 'Given a directed graph, print YES if it contains a cycle, otherwise NO.', 'hard', 'n, m = map(int, input().split())\nedges = [tuple(map(int, input().split())) for _ in range(m)]\n# write your code here', '[{"input":"3 3\n0 1\n1 2\n2 0","expected_output":"YES"},{"input":"3 2\n0 1\n1 2","expected_output":"NO"}]', '[{"input":"3 3\n0 1\n1 2\n2 0","expected_output":"YES"}]', '[{"input":"4 4\n0 1\n1 2\n2 3\n1 3","expected_output":"NO"}]', 'n m and directed edges', 'YES or NO', '1 <= n <= 100000', '["graph","dfs"]', '["python","java","cpp","javascript"]', 20),
('Longest Increasing Subsequence', 'Print the length of the longest strictly increasing subsequence.', 'hard', 'n = int(input())\narr = list(map(int, input().split()))\n# write your code here', '[{"input":"6\n10 9 2 5 3 7","expected_output":"3"},{"input":"5\n1 2 3 4 5","expected_output":"5"}]', '[{"input":"6\n10 9 2 5 3 7","expected_output":"3"}]', '[{"input":"8\n0 8 4 12 2 10 6 14","expected_output":"4"}]', 'n and array', 'LIS length', '1 <= n <= 100000', '["dynamic-programming","binary-search"]', '["python","java","cpp","javascript"]', 20),
('LRU Cache Simulation', 'Simulate an LRU cache. For each GET key, print the value or -1. PUT key value updates the cache.', 'hard', 'capacity, q = map(int, input().split())\n# next q lines: GET key or PUT key value\n# write your code here', '[{"input":"2 5\nPUT 1 10\nPUT 2 20\nGET 1\nPUT 3 30\nGET 2","expected_output":"10\n-1"}]', '[{"input":"2 5\nPUT 1 10\nPUT 2 20\nGET 1\nPUT 3 30\nGET 2","expected_output":"10\n-1"}]', '[{"input":"1 4\nPUT 5 50\nGET 5\nPUT 6 60\nGET 5","expected_output":"50\n-1"}]', 'capacity q and operations', 'GET outputs per line', '1 <= q <= 100000', '["hashing","linked-list","design"]', '["python","java","cpp","javascript"]', 20),
('Median of Two Sorted Arrays', 'Given two sorted arrays, print their median. Use .5 for halves if needed.', 'hard', 'n, m = map(int, input().split())\na = list(map(int, input().split()))\nb = list(map(int, input().split()))\n# write your code here', '[{"input":"2 1\n1 3\n2","expected_output":"2"},{"input":"2 2\n1 2\n3 4","expected_output":"2.5"}]', '[{"input":"2 1\n1 3\n2","expected_output":"2"}]', '[{"input":"0 3\n\n2 3 4","expected_output":"3"}]', 'n m and sorted arrays', 'Median', '0 <= n,m <= 100000', '["array","binary-search"]', '["python","java","cpp","javascript"]', 20)
ON CONFLICT (title) DO NOTHING;

-- Seed default super admin account (password: admin123)
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Super Admin',
  'admin@intellihire.com',
  '$2b$10$HbZw6q4fwUv/QEupu7KiFupJc1Com7X4WRAqJ6rjjA.YDQoQ4Snne', -- admin123 (bcrypt)
  'admin'
) ON CONFLICT (email) DO NOTHING;

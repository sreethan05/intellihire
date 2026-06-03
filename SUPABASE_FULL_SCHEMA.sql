-- Kimi Agent Exam-Based Hiring System
-- Supabase Schema

-- Users table (admin, tpo, recruiter, candidate)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'tpo', 'recruiter', 'candidate')),
  created_by uuid references users(id),
  created_at timestamptz default now()
);

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'users'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%';

  if constraint_name is not null then
    execute format('alter table users drop constraint %I', constraint_name);
  end if;
end $$;

alter table users add constraint users_role_check check (role in ('admin', 'tpo', 'recruiter', 'candidate'));

create table if not exists colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  location text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

alter table users add column if not exists roll_number text unique;
alter table users add column if not exists college_id uuid references colleges(id);
alter table users add column if not exists must_change_password boolean default false;
alter table users add column if not exists profile_complete boolean default true;
alter table users add column if not exists interview_credits integer default 3;

create table if not exists candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null unique,
  college_id uuid references colleges(id) on delete cascade not null,
  roll_number text not null unique,
  branch text not null,
  cgpa numeric(4,2) not null,
  graduation_year integer not null,
  phone text,
  skills jsonb default '[]',
  domain_preference text,
  marksheet_url text,
  resume_url text,
  documents_verified boolean default false,
  profile_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Exams table
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  duration integer not null, -- in minutes
  total_marks integer not null,
  pass_marks integer default 0,
  available_from timestamptz,
  available_until timestamptz,
  created_by uuid references users(id) not null,
  created_at timestamptz default now()
);

alter table exams add column if not exists available_from timestamptz;
alter table exams add column if not exists available_until timestamptz;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company_name text not null,
  company_description text,
  college_id uuid references colleges(id) not null,
  min_cgpa numeric(4,2) default 0,
  allowed_branches jsonb default '[]',
  required_skills jsonb default '[]',
  salary_min numeric,
  salary_max numeric,
  drive_date timestamptz,
  exam_id uuid references exams(id),
  status text default 'active' check (status in ('draft', 'active', 'closed')),
  interview_duration integer default 15,
  created_by uuid references users(id) not null,
  created_at timestamptz default now()
);

create table if not exists candidate_status (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade not null,
  candidate_id uuid references users(id) on delete cascade not null,
  status text default 'registered' check (status in ('registered', 'exam_taken', 'passed', 'shortlisted', 'on_hold', 'rejected', 'offered')),
  recruiter_notes text,
  updated_at timestamptz default now(),
  unique(job_id, candidate_id)
);

-- MCQ Questions table
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A', 'B', 'C', 'D')),
  marks integer default 1,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Exam ↔ MCQ Questions link
create table if not exists exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade not null,
  question_id uuid references questions(id) on delete cascade not null,
  marks integer default 1,
  created_at timestamptz default now()
);

-- Coding Questions table
create table if not exists coding_questions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  starter_code text default '',
  test_cases jsonb default '[]',
  marks integer default 10,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

alter table coding_questions add column if not exists input_format text;
alter table coding_questions add column if not exists output_format text;
alter table coding_questions add column if not exists constraints_text text;
alter table coding_questions add column if not exists sample_cases jsonb default '[]';
alter table coding_questions add column if not exists hidden_cases jsonb default '[]';
alter table coding_questions add column if not exists topic_tags jsonb default '[]';
alter table coding_questions add column if not exists accepted_languages jsonb default '["python","java","cpp","javascript"]';
alter table coding_questions add column if not exists time_limit_ms integer default 2000;
alter table coding_questions add column if not exists memory_limit_kb integer default 128000;
create unique index if not exists coding_questions_title_unique on coding_questions(title);

-- Exam ↔ Coding Questions link
create table if not exists exam_coding_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade not null,
  coding_question_id uuid references coding_questions(id) on delete cascade not null,
  marks integer default 10,
  created_at timestamptz default now()
);

-- Exam Assignments (recruiter assigns exam to candidate)
create table if not exists exam_assignments (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade not null,
  candidate_id uuid references users(id) on delete cascade not null,
  assigned_by uuid references users(id) not null,
  job_id uuid references jobs(id) on delete set null,
  assigned_at timestamptz default now(),
  unique(exam_id, candidate_id)
);

alter table exam_assignments add column if not exists job_id uuid references jobs(id) on delete set null;

-- Attempts (candidate takes an exam)
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) not null,
  candidate_id uuid references users(id) not null,
  recruiter_id uuid references users(id) not null,
  status text default 'in_progress' check (status in ('in_progress', 'completed')),
  score integer default 0,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  unique(exam_id, candidate_id)
);

-- MCQ Answers
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts(id) on delete cascade not null,
  question_id uuid references questions(id) not null,
  selected_option text not null,
  is_correct boolean default false,
  marks_obtained integer default 0,
  created_at timestamptz default now(),
  unique(attempt_id, question_id)
);

-- Coding Submissions
create table if not exists coding_submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts(id) on delete cascade not null,
  coding_question_id uuid references coding_questions(id) not null,
  code text not null,
  language text not null,
  score integer default 0,
  status text default 'pending',
  created_at timestamptz default now(),
  unique(attempt_id, coding_question_id)
);

create table if not exists proctoring_snapshots (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts(id) on delete cascade not null,
  exam_id uuid references exams(id) on delete cascade not null,
  candidate_id uuid references users(id) on delete cascade not null,
  event_type text not null check (event_type in ('camera_check', 'snapshot', 'violation', 'submission')),
  violation_count integer default 0,
  message text,
  snapshot_data text,
  captured_at timestamptz default now()
);

create index if not exists proctoring_snapshots_attempt_idx on proctoring_snapshots(attempt_id, captured_at desc);
create index if not exists proctoring_snapshots_exam_idx on proctoring_snapshots(exam_id, candidate_id);

create table if not exists plagiarism_flags (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts(id) on delete cascade not null,
  coding_submission_id uuid references coding_submissions(id) on delete cascade,
  similarity_score numeric(5,2) default 0,
  matched_with_attempt_id uuid references attempts(id) on delete set null,
  status text default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  notes text,
  created_at timestamptz default now()
);

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references users(id) on delete cascade not null,
  exam_id uuid references exams(id) on delete cascade,
  certificate_url text,
  issued_at timestamptz default now(),
  unique(candidate_id, exam_id)
);

create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references users(id) on delete cascade not null,
  name text not null,
  description text,
  awarded_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists tpo_uploads (
  id uuid primary key default gen_random_uuid(),
  tpo_id uuid references users(id) on delete cascade not null,
  college_id uuid references colleges(id) on delete cascade not null,
  file_name text,
  rows_total integer default 0,
  rows_created integer default 0,
  rows_failed integer default 0,
  status text default 'completed' check (status in ('processing', 'completed', 'failed')),
  created_at timestamptz default now()
);

create table if not exists ai_interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references users(id) on delete cascade not null,
  job_id uuid references jobs(id) on delete set null,
  exam_id uuid references exams(id) on delete set null,
  status text default 'in_progress' check (status in ('pending', 'in_progress', 'completed')),
  score integer default 0,
  relevance_score integer default 0,
  communication_score integer default 0,
  summary text,
  feedback text,
  started_at timestamptz default now(),
  submitted_at timestamptz
);

create table if not exists ai_interview_answers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid references ai_interviews(id) on delete cascade not null,
  question text not null,
  answer text not null,
  score integer default 0,
  feedback text,
  created_at timestamptz default now()
);

create table if not exists ai_feedback_reports (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references users(id) on delete cascade not null,
  attempt_id uuid references attempts(id) on delete cascade,
  report_type text default 'improvement',
  content text not null,
  strengths jsonb default '[]',
  improvements jsonb default '[]',
  created_at timestamptz default now()
);

create table if not exists recruiter_voice_interviews (
  id uuid primary key default gen_random_uuid(),
  public_id text unique not null,
  recruiter_id uuid references users(id) on delete cascade not null,
  job_position text not null,
  job_description text not null,
  duration_minutes integer default 15,
  interview_types jsonb default '[]',
  question_list jsonb default '[]',
  status text default 'active' check (status in ('active', 'closed')),
  created_at timestamptz default now()
);

create index if not exists recruiter_voice_interviews_recruiter_idx on recruiter_voice_interviews(recruiter_id, created_at desc);

create table if not exists recruiter_voice_feedback (
  id uuid primary key default gen_random_uuid(),
  voice_interview_id uuid references recruiter_voice_interviews(id) on delete cascade not null,
  public_id text references recruiter_voice_interviews(public_id) on delete cascade not null,
  candidate_name text not null,
  candidate_email text not null,
  transcript jsonb default '[]',
  feedback jsonb default '{}',
  recommended boolean default false,
  overall_rating numeric(4,2) default 0,
  created_at timestamptz default now()
);

create index if not exists recruiter_voice_feedback_public_idx on recruiter_voice_feedback(public_id, created_at desc);

insert into coding_questions (
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
) values
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
on conflict (title) do nothing;

-- Seed: default admin account (password: admin123)
insert into users (name, email, password_hash, role)
values (
  'Super Admin',
  'admin@recruitexam.com',
  '$2b$10$HbZw6q4fwUv/QEupu7KiFupJc1Com7X4WRAqJ6rjjA.YDQoQ4Snne', -- admin123 (bcrypt)
  'admin'
) on conflict (email) do nothing;

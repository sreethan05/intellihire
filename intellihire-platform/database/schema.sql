create extension if not exists pgcrypto;

do $$ begin create type app_role as enum ('admin','tpo','recruiter','candidate'); exception when duplicate_object then null; end $$;
do $$ begin create type drive_status as enum ('draft','active','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type question_type as enum ('aptitude','technical'); exception when duplicate_object then null; end $$;
do $$ begin create type difficulty_level as enum ('easy','medium','hard'); exception when duplicate_object then null; end $$;
do $$ begin create type attempt_status as enum ('in_progress','completed','auto_submitted'); exception when duplicate_object then null; end $$;
do $$ begin create type submission_status as enum ('pending','compiling','running','accepted','wrong_answer','tle','runtime_error','compilation_error'); exception when duplicate_object then null; end $$;
do $$ begin create type violation_type as enum ('face_missing','multiple_faces','tab_switch','window_blur','fullscreen_exit','copy_paste'); exception when duplicate_object then null; end $$;
do $$ begin create type pipeline_status as enum ('eligible','applied','exam_completed','interviewed','shortlisted','rejected','placed'); exception when duplicate_object then null; end $$;
do $$ begin create type upload_status as enum ('processing','completed','failed'); exception when duplicate_object then null; end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role app_role not null,
  must_change_password boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tpos (
  id uuid primary key references public.users(id) on delete cascade,
  college_id uuid not null references public.colleges(id) on delete cascade,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiters (
  id uuid primary key references public.users(id) on delete cascade,
  company_name text not null,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id uuid primary key references public.users(id) on delete cascade,
  roll_number text not null,
  full_name text not null,
  branch text not null,
  cgpa numeric(4,2) not null check (cgpa >= 0 and cgpa <= 10),
  graduation_year integer not null,
  college_id uuid not null references public.colleges(id) on delete cascade,
  phone text,
  skills text[] not null default '{}',
  domain_preference text,
  resume_url text,
  marksheet_url text,
  ai_resume_data jsonb,
  profile_complete boolean not null default false,
  document_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, roll_number)
);

create table if not exists public.drives (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  job_title text not null,
  company_name text not null,
  target_college_id uuid not null references public.colleges(id) on delete cascade,
  min_cgpa numeric(4,2) not null default 0,
  allowed_branches text[] not null default '{}',
  required_skills text[] not null default '{}',
  salary_min numeric,
  salary_max numeric,
  drive_date timestamptz,
  reattempt_policy text not null default 'no_reattempt',
  status drive_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references public.drives(id) on delete cascade,
  title text not null,
  duration_minutes integer not null,
  total_marks numeric not null,
  passing_marks numeric not null default 0,
  negative_marking boolean not null default false,
  marking_scheme jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  section integer not null default 0,
  type question_type not null,
  question_text text not null,
  options jsonb not null,
  correct_option integer not null check (correct_option between 0 and 3),
  marks numeric not null default 1,
  topic text,
  difficulty difficulty_level not null default 'medium',
  created_at timestamptz not null default now()
);

create table if not exists public.coding_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  title text not null,
  problem_statement text not null,
  input_format text,
  output_format text,
  constraints text,
  sample_cases jsonb not null default '[]'::jsonb,
  hidden_cases jsonb not null default '[]'::jsonb,
  difficulty difficulty_level not null default 'medium',
  topic_tags text[] not null default '{}',
  time_limit_ms integer not null default 2000,
  memory_limit_kb integer not null default 128000,
  accepted_languages text[] not null default '{python3,java,cpp,javascript,c}',
  partial_scoring boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  drive_id uuid not null references public.drives(id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  status attempt_status not null default 'in_progress',
  total_score numeric not null default 0,
  percentile numeric,
  current_section integer not null default 0,
  section_start_times jsonb not null default '{}'::jsonb,
  violation_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(candidate_id, exam_id)
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option integer,
  is_correct boolean,
  marks_obtained numeric not null default 0,
  time_taken_seconds integer,
  unique(attempt_id, question_id)
);

create table if not exists public.coding_submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  coding_question_id uuid not null references public.coding_questions(id) on delete cascade,
  language text not null,
  source_code text not null,
  judge0_token text,
  status submission_status not null default 'pending',
  score numeric not null default 0,
  test_results jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now()
);

create table if not exists public.proctoring_snapshots (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  violation_type violation_type not null,
  snapshot_url text,
  timestamp timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  drive_id uuid not null references public.drives(id) on delete cascade,
  certificate_url text,
  score numeric,
  percentile numeric,
  issued_at timestamptz not null default now(),
  unique(candidate_id, drive_id)
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  badge_type text not null,
  earned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.candidate_status (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  drive_id uuid not null references public.drives(id) on delete cascade,
  status pipeline_status not null default 'eligible',
  updated_at timestamptz not null default now(),
  unique(candidate_id, drive_id)
);

create table if not exists public.tpo_uploads (
  id uuid primary key default gen_random_uuid(),
  tpo_id uuid not null references public.tpos(id) on delete cascade,
  college_id uuid not null references public.colleges(id) on delete cascade,
  file_url text,
  status upload_status not null default 'processing',
  total_records integer not null default 0,
  processed_records integer not null default 0,
  error_log jsonb not null default '[]'::jsonb,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_templates (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  drive_id uuid references public.drives(id) on delete set null,
  job_title text not null,
  job_description text not null,
  duration_minutes integer not null default 15,
  question_types text[] not null default '{technical}',
  questions jsonb not null default '[]'::jsonb,
  share_slug text unique not null default encode(gen_random_bytes(9), 'hex'),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.interview_templates(id) on delete cascade,
  drive_id uuid references public.drives(id) on delete set null,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  candidate_name text,
  candidate_email text,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  feedback jsonb,
  status text not null default 'invited',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interviews add column if not exists template_id uuid references public.interview_templates(id) on delete cascade;
alter table public.interviews add column if not exists candidate_name text;
alter table public.interviews add column if not exists candidate_email text;
alter table public.interviews add column if not exists started_at timestamptz;
alter table public.interviews add column if not exists completed_at timestamptz;
alter table public.interviews alter column drive_id drop not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['users','colleges','tpos','recruiters','candidates','drives','exams','coding_questions','attempts','candidate_status','tpo_uploads','interview_templates','interviews'] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_candidates_college on public.candidates(college_id);
create index if not exists idx_candidates_branch_year on public.candidates(branch, graduation_year);
create index if not exists idx_drives_recruiter on public.drives(recruiter_id);
create index if not exists idx_drives_college_status on public.drives(target_college_id, status);
create index if not exists idx_exams_drive on public.exams(drive_id);
create index if not exists idx_questions_exam_section on public.questions(exam_id, section);
create index if not exists idx_attempts_candidate_exam on public.attempts(candidate_id, exam_id);
create index if not exists idx_attempts_drive_score on public.attempts(drive_id, total_score desc);
create index if not exists idx_answers_attempt on public.answers(attempt_id);
create index if not exists idx_submissions_attempt on public.coding_submissions(attempt_id);
create index if not exists idx_proctoring_attempt on public.proctoring_snapshots(attempt_id);
create index if not exists idx_notifications_user_read on public.notifications(user_id, read, created_at desc);
create index if not exists idx_candidate_status_drive_status on public.candidate_status(drive_id, status);
create index if not exists idx_tpo_uploads_tpo on public.tpo_uploads(tpo_id, uploaded_at desc);
create index if not exists idx_interview_templates_recruiter on public.interview_templates(recruiter_id, created_at desc);
create index if not exists idx_interview_templates_drive on public.interview_templates(drive_id);
create index if not exists idx_interviews_template_status on public.interviews(template_id, status);
create index if not exists idx_interviews_candidate on public.interviews(candidate_id, created_at desc);

alter table public.users enable row level security;
alter table public.colleges enable row level security;
alter table public.tpos enable row level security;
alter table public.recruiters enable row level security;
alter table public.candidates enable row level security;
alter table public.drives enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.coding_questions enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;
alter table public.coding_submissions enable row level security;
alter table public.proctoring_snapshots enable row level security;
alter table public.certificates enable row level security;
alter table public.badges enable row level security;
alter table public.notifications enable row level security;
alter table public.candidate_status enable row level security;
alter table public.tpo_uploads enable row level security;
alter table public.interview_templates enable row level security;
alter table public.interviews enable row level security;

create or replace function public.current_role()
returns app_role language sql stable security definer as $$
  select role from public.users where id = auth.uid()
$$;

create policy "users_self_or_admin" on public.users for select using (id = auth.uid() or public.current_role() = 'admin');
create policy "admins_manage_users" on public.users for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "colleges_visible_to_authenticated" on public.colleges for select to authenticated using (true);
create policy "admins_manage_colleges" on public.colleges for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "tpos_self_admin" on public.tpos for select using (id = auth.uid() or public.current_role() = 'admin');
create policy "recruiters_self_admin" on public.recruiters for select using (id = auth.uid() or public.current_role() = 'admin');
create policy "candidates_visible_by_scope" on public.candidates for select using (
  id = auth.uid()
  or public.current_role() = 'admin'
  or exists (select 1 from public.tpos where tpos.id = auth.uid() and tpos.college_id = candidates.college_id)
  or exists (select 1 from public.candidate_status cs join public.drives d on d.id = cs.drive_id where cs.candidate_id = candidates.id and d.recruiter_id = auth.uid())
);
create policy "candidates_update_self" on public.candidates for update using (id = auth.uid()) with check (id = auth.uid());

create policy "drives_visible_by_scope" on public.drives for select using (
  public.current_role() = 'admin'
  or recruiter_id = auth.uid()
  or exists (select 1 from public.tpos where tpos.id = auth.uid() and tpos.college_id = drives.target_college_id)
  or exists (select 1 from public.candidate_status cs where cs.drive_id = drives.id and cs.candidate_id = auth.uid())
);
create policy "recruiters_manage_own_drives" on public.drives for all using (recruiter_id = auth.uid()) with check (recruiter_id = auth.uid());

create policy "exam_visible_by_drive_scope" on public.exams for select using (exists (select 1 from public.drives d where d.id = exams.drive_id));
create policy "questions_visible_by_exam_scope" on public.questions for select using (exists (select 1 from public.exams e where e.id = questions.exam_id));
create policy "coding_visible_by_exam_scope" on public.coding_questions for select using (exists (select 1 from public.exams e where e.id = coding_questions.exam_id));

create policy "attempts_self_or_recruiter_admin" on public.attempts for select using (
  candidate_id = auth.uid()
  or public.current_role() = 'admin'
  or exists (select 1 from public.drives d where d.id = attempts.drive_id and d.recruiter_id = auth.uid())
);
create policy "candidates_manage_own_attempts" on public.attempts for insert with check (candidate_id = auth.uid());
create policy "candidates_update_own_attempts" on public.attempts for update using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

create policy "answers_by_attempt_scope" on public.answers for select using (exists (select 1 from public.attempts a where a.id = answers.attempt_id and (a.candidate_id = auth.uid() or public.current_role() in ('admin','recruiter'))));
create policy "candidates_write_own_answers" on public.answers for all using (exists (select 1 from public.attempts a where a.id = answers.attempt_id and a.candidate_id = auth.uid())) with check (exists (select 1 from public.attempts a where a.id = answers.attempt_id and a.candidate_id = auth.uid()));

create policy "notifications_self" on public.notifications for select using (user_id = auth.uid());
create policy "notifications_update_self" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "candidate_status_scope" on public.candidate_status for select using (
  candidate_id = auth.uid()
  or public.current_role() = 'admin'
  or exists (select 1 from public.drives d where d.id = candidate_status.drive_id and d.recruiter_id = auth.uid())
  or exists (select 1 from public.tpos join public.candidates c on c.college_id = tpos.college_id where tpos.id = auth.uid() and c.id = candidate_status.candidate_id)
);

create policy "service_read_write_remaining" on public.coding_submissions for select using (true);
create policy "service_proctoring_visible" on public.proctoring_snapshots for select using (candidate_id = auth.uid() or public.current_role() in ('admin','recruiter'));
create policy "certificates_self_scope" on public.certificates for select using (candidate_id = auth.uid() or public.current_role() in ('admin','tpo','recruiter'));
create policy "badges_self_scope" on public.badges for select using (candidate_id = auth.uid() or public.current_role() in ('admin','tpo','recruiter'));
create policy "uploads_tpo_scope" on public.tpo_uploads for select using (tpo_id = auth.uid() or public.current_role() = 'admin');
create policy "interview_templates_scope" on public.interview_templates for select using (
  recruiter_id = auth.uid()
  or public.current_role() = 'admin'
  or exists (select 1 from public.candidate_status cs where cs.drive_id = interview_templates.drive_id and cs.candidate_id = auth.uid())
);
create policy "recruiters_manage_interview_templates" on public.interview_templates for all using (recruiter_id = auth.uid()) with check (recruiter_id = auth.uid());
create policy "interviews_scope" on public.interviews for select using (
  candidate_id = auth.uid()
  or public.current_role() = 'admin'
  or exists (select 1 from public.interview_templates t where t.id = interviews.template_id and t.recruiter_id = auth.uid())
  or exists (select 1 from public.drives d where d.id = interviews.drive_id and d.recruiter_id = auth.uid())
);

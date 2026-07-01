-- IntelliHire Question Bank Schema Additions
-- Adds metadata columns to questions table for the Exam Pipeline Engine

-- Add metadata columns to questions table for intelligent selection
alter table questions add column if not exists topic text default 'general';
alter table questions add column if not exists difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard', 'very_hard'));
alter table questions add column if not exists subtopic text default 'general';
alter table questions add column if not exists concept_tags jsonb default '[]';
alter table questions add column if not exists bloom_level text default 'understand' check (bloom_level in ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'));
alter table questions add column if not exists estimated_time_sec integer default 60;
alter table questions add column if not exists last_used_at timestamptz;
alter table questions add column if not exists use_count integer default 0;
alter table questions add column if not exists avg_candidate_score numeric(4,2);
alter table questions add column if not exists prerequisite_concepts jsonb default '[]';

-- Add indexes for fast pipeline queries
create index if not exists questions_topic_difficulty_idx on questions(topic, difficulty);
create index if not exists questions_subtopic_idx on questions(subtopic);
create index if not exists questions_bloom_idx on questions(bloom_level);

-- Update coding_questions to support very_hard difficulty
alter table coding_questions drop constraint if exists coding_questions_difficulty_check;
alter table coding_questions add constraint coding_questions_difficulty_check check (difficulty in ('easy', 'medium', 'hard', 'very_hard'));

-- Add very_hard coding questions if not present
-- (Handled by seed file)

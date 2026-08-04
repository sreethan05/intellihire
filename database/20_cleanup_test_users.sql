-- 20_cleanup_test_users.sql
-- Clean up all generated test users and preserve exactly 4 standard accounts:
-- 1. Admin     : admin@intellihire.com     (password: admin123)
-- 2. TPO       : tpo@intellihire.com       (password: admin123)
-- 3. Recruiter : recruiter@intellihire.com (password: admin123)
-- 4. Candidate : candidate@intellihire.com (password: admin123)
-- NOTE: No BEGIN/COMMIT — the migration runner wraps this in its own transaction.

-- 1. Truncate dependent session, log, attempt, and activity tables
TRUNCATE TABLE refresh_tokens CASCADE;
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE notifications CASCADE;
TRUNCATE TABLE action_items CASCADE;
TRUNCATE TABLE activity_feed CASCADE;
TRUNCATE TABLE proctoring_snapshots CASCADE;
TRUNCATE TABLE coding_submissions CASCADE;
TRUNCATE TABLE answers CASCADE;
TRUNCATE TABLE attempts CASCADE;
TRUNCATE TABLE exam_assignments CASCADE;
TRUNCATE TABLE exam_waitlist CASCADE;
TRUNCATE TABLE certificates CASCADE;
TRUNCATE TABLE badges CASCADE;
TRUNCATE TABLE ai_interviews CASCADE;
TRUNCATE TABLE ai_interview_answers CASCADE;
TRUNCATE TABLE ai_feedback_reports CASCADE;
TRUNCATE TABLE candidate_status CASCADE;
TRUNCATE TABLE candidate_pipeline CASCADE;
TRUNCATE TABLE plagiarism_flags CASCADE;
TRUNCATE TABLE recruiter_voice_feedback CASCADE;
TRUNCATE TABLE recruiter_voice_interviews CASCADE;
TRUNCATE TABLE tpo_uploads CASCADE;
TRUNCATE TABLE candidate_profiles CASCADE;

-- 2. Insert/Upsert the 4 standard user accounts
INSERT INTO users (id, name, email, password_hash, role, roll_number, profile_complete, must_change_password)
VALUES 
  (
    '6eacac4f-ffc4-4859-a657-196ba2cd939b',
    'Super Admin',
    'admin@intellihire.com',
    '$2b$10$HbZw6q4fwUv/QEupu7KiFupJc1Com7X4WRAqJ6rjjA.YDQoQ4Snne',
    'admin',
    NULL,
    true,
    false
  ),
  (
    'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d',
    'College TPO',
    'tpo@intellihire.com',
    '$2b$10$HbZw6q4fwUv/QEupu7KiFupJc1Com7X4WRAqJ6rjjA.YDQoQ4Snne',
    'tpo',
    NULL,
    true,
    false
  ),
  (
    'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
    'Lead Recruiter',
    'recruiter@intellihire.com',
    '$2b$10$HbZw6q4fwUv/QEupu7KiFupJc1Com7X4WRAqJ6rjjA.YDQoQ4Snne',
    'recruiter',
    NULL,
    true,
    false
  ),
  (
    'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
    'Alex Candidate',
    'candidate@intellihire.com',
    '$2b$10$HbZw6q4fwUv/QEupu7KiFupJc1Com7X4WRAqJ6rjjA.YDQoQ4Snne',
    'candidate',
    'CS2026001',
    true,
    false
  )
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role;

-- 3. Reassign existing created_by references
UPDATE exams SET created_by = 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f');
UPDATE jobs SET created_by = 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f');
UPDATE questions SET created_by = '6eacac4f-ffc4-4859-a657-196ba2cd939b' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f');
UPDATE coding_questions SET created_by = '6eacac4f-ffc4-4859-a657-196ba2cd939b' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f');
UPDATE colleges SET created_by = '6eacac4f-ffc4-4859-a657-196ba2cd939b' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f');

-- 4. Delete all other test users
DELETE FROM users WHERE id NOT IN (
  '6eacac4f-ffc4-4859-a657-196ba2cd939b',
  'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d',
  'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
  'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f'
);

-- 5. Create candidate profile for Alex Candidate
INSERT INTO candidate_profiles (user_id, college_id, skills, bio, cgpa, branch, graduation_year, roll_number)
VALUES (
  'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
  (SELECT id FROM colleges LIMIT 1),
  '["Python", "JavaScript", "React", "SQL", "Data Structures"]'::jsonb,
  'Aspiring Software Engineer passionate about full-stack development and algorithms.',
  8.90,
  'Computer Science',
  2026,
  'CS2026001'
) ON CONFLICT (user_id) DO NOTHING;

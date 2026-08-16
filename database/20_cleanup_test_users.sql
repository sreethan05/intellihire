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

-- 2. Ensure default college exists
INSERT INTO colleges (id, name, code, location, created_by)
VALUES 
  (
    'c011e6e0-0000-4000-a000-000000000001',
    'National Institute of Technology',
    'NIT-01',
    'Tech Campus',
    '6eacac4f-ffc4-4859-a657-196ba2cd939b'
  )
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- 3. Insert/Upsert the standard and test user accounts
INSERT INTO users (id, name, email, password_hash, role, roll_number, college_id, profile_complete, must_change_password)
VALUES 
  (
    '6eacac4f-ffc4-4859-a657-196ba2cd939b',
    'Super Admin',
    'admin@intellihire.com',
    '$2b$10$0fObminTV6hQGizL7Gj94umvznPv8EoJosGl08giBAd4R0u8bMwYK',
    'admin',
    NULL,
    NULL,
    true,
    false
  ),
  (
    'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d',
    'College TPO',
    'tpo@intellihire.com',
    '$2b$10$0fObminTV6hQGizL7Gj94umvznPv8EoJosGl08giBAd4R0u8bMwYK',
    'tpo',
    NULL,
    'c011e6e0-0000-4000-a000-000000000001',
    true,
    false
  ),
  (
    'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
    'Lead Recruiter',
    'recruiter@intellihire.com',
    '$2b$10$0fObminTV6hQGizL7Gj94umvznPv8EoJosGl08giBAd4R0u8bMwYK',
    'recruiter',
    NULL,
    NULL,
    true,
    false
  ),
  (
    'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
    'Alex Candidate',
    'candidate@intellihire.com',
    '$2b$10$0fObminTV6hQGizL7Gj94umvznPv8EoJosGl08giBAd4R0u8bMwYK',
    'candidate',
    'CS2026001',
    'c011e6e0-0000-4000-a000-000000000001',
    true,
    false
  ),
  (
    'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
    'Test Recruiter',
    'recruiter@example.com',
    '$2b$10$q4WKBET8nI9nzr103VmHae70s/cWyz7kSLNq47XQKEnvZ/YHYQktO',
    'recruiter',
    NULL,
    NULL,
    true,
    false
  ),
  (
    'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b',
    'Test TPO',
    'tpo@example.com',
    '$2b$10$qTsdAIByQxwj46hFUrPJfuFV4E/Ml79C2uQzJL/vzDuW3EtwRoXZS',
    'tpo',
    NULL,
    'c011e6e0-0000-4000-a000-000000000001',
    true,
    false
  ),
  (
    'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c',
    'Test Candidate',
    'candidate@example.com',
    '$2b$10$iq2rVZnlvCvWpLNcxIQKhe4C8LBmR3Uwc.fTFDbXCmSOuURLShkqG',
    'candidate',
    'CAND001',
    'c011e6e0-0000-4000-a000-000000000001',
    true,
    false
  )
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  college_id = EXCLUDED.college_id,
  profile_complete = EXCLUDED.profile_complete,
  must_change_password = EXCLUDED.must_change_password;

-- 4. Reassign existing created_by references
UPDATE exams SET created_by = 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c');
UPDATE jobs SET created_by = 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', college_id = 'c011e6e0-0000-4000-a000-000000000001' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c');
UPDATE questions SET created_by = '6eacac4f-ffc4-4859-a657-196ba2cd939b' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c');
UPDATE coding_questions SET created_by = '6eacac4f-ffc4-4859-a657-196ba2cd939b' WHERE created_by IS NOT NULL AND created_by NOT IN ('6eacac4f-ffc4-4859-a657-196ba2cd939b', 'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d', 'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e', 'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c');

-- 5. Delete all other test users
DELETE FROM users WHERE id NOT IN (
  '6eacac4f-ffc4-4859-a657-196ba2cd939b',
  'a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d',
  'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
  'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
  'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b',
  'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c'
);

-- 6. Create candidate profiles
INSERT INTO candidate_profiles (user_id, college_id, skills, bio, cgpa, branch, graduation_year, roll_number, documents_verified, profile_complete)
VALUES 
  (
    'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
    'c011e6e0-0000-4000-a000-000000000001',
    '["Python", "JavaScript", "React", "SQL", "Data Structures"]'::jsonb,
    'Aspiring Software Engineer passionate about full-stack development and algorithms.',
    8.90,
    'Computer Science',
    2026,
    'CS2026001',
    true,
    true
  ),
  (
    'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c',
    'c011e6e0-0000-4000-a000-000000000001',
    '["Python", "JavaScript", "React", "SQL", "Data Structures"]'::jsonb,
    'E2E Test Candidate profile.',
    9.50,
    'Computer Science',
    2026,
    'CAND001',
    true,
    true
  )
ON CONFLICT (user_id) DO UPDATE SET
  college_id = EXCLUDED.college_id,
  cgpa = EXCLUDED.cgpa,
  documents_verified = true,
  profile_complete = true;

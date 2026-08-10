-- 21. Bulk Import Batches & Conflicts
-- Tracks each bulk student import run (file hash, status, stats)
-- and stages conflicts for admin review.

CREATE TABLE IF NOT EXISTS bulk_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id UUID REFERENCES colleges(id) ON DELETE SET NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    original_filename TEXT NOT NULL,
    file_hash_sha256 TEXT NOT NULL UNIQUE,
    file_size_bytes BIGINT NOT NULL,
    upload_status TEXT NOT NULL DEFAULT 'PROCESSING'
        CHECK (upload_status IN ('PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'ROLLED_BACK')),
    current_stage TEXT DEFAULT 'uploading',
    error_message TEXT,
    total_rows_raw INTEGER DEFAULT 0,
    total_records_parsed INTEGER DEFAULT 0,
    total_created INTEGER DEFAULT 0,
    total_updated INTEGER DEFAULT 0,
    total_conflicts INTEGER DEFAULT 0,
    processing_started_at TIMESTAMPTZ DEFAULT NOW(),
    processing_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_import_batches_college_id ON bulk_import_batches(college_id);
CREATE INDEX IF NOT EXISTS idx_bulk_import_batches_uploaded_by ON bulk_import_batches(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_bulk_import_batches_status ON bulk_import_batches(upload_status);
CREATE INDEX IF NOT EXISTS idx_bulk_import_batches_hash ON bulk_import_batches(file_hash_sha256);

-- Conflict staging — one row per student record that couldn't be auto-imported
CREATE TABLE IF NOT EXISTS bulk_import_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES bulk_import_batches(id) ON DELETE CASCADE NOT NULL,
    college_id UUID REFERENCES colleges(id) ON DELETE SET NULL,
    row_number INTEGER NOT NULL,
    roll_number TEXT,
    email TEXT,
    name TEXT,
    raw_data JSONB NOT NULL,
    conflict_type TEXT NOT NULL DEFAULT 'DATA_MISMATCH'
        CHECK (conflict_type IN ('DATA_MISMATCH', 'EXISTING_NON_CANDIDATE', 'DIFFERENT_COLLEGE', 'CREATION_FAILED', 'PROFILE_UPDATE_FAILED', 'DUPLICATE_IN_FILE')),
    conflict_detail TEXT NOT NULL,
    resolution_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (resolution_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'SKIPPED')),
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_profile_id UUID REFERENCES candidate_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_import_conflicts_batch_id ON bulk_import_conflicts(batch_id);
CREATE INDEX IF NOT EXISTS idx_bulk_import_conflicts_status ON bulk_import_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_bulk_import_conflicts_college_id ON bulk_import_conflicts(college_id);

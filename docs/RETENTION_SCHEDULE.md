# Data Retention Schedule

Operational retention rules for the IntelliHire platform. "Automated" means
the PostgreSQL function `cleanup_old_logs()` (`database/14_data_retention.sql`)
invoked by the retention worker (`server_py/app/data_retention.py`) every
`DATA_RETENTION_INTERVAL_HOURS` (default **24 h**) — but **only in production**
(`main.py` starts the worker solely when `NODE_ENV == "production"`).

Storage locations are verified against the code:

- **Filesystem** (`FILE_STORAGE_DIR`, default `uploads/` → `server_py/uploads/`
  in dev, the `app_uploads` named volume in `docker-compose.prod.yml`):
  subdirectories `resumes/` and `offers/` are created in
  `server_py/app/utils.py`. There is **no** static mount; access only via the
  authorized endpoint `GET /api/assets/files/{path}` or a 5-minute signed URL
  from `POST /api/assets/sign`.
- **PostgreSQL** (`database/*.sql` migrations): everything else, including
  proctoring snapshots (DB rows, not files).
- **MinIO/S3**: `server_py/app/storage.py` configures a boto3 client (bucket
  `intellihire-uploads`, `S3_ENDPOINT`) but **no application code currently
  calls it** — S3 is provisioned (compose service `minio`, volume
  `minio_data`) but today's uploads land on the filesystem. Rows below reflect
  reality, not intent.

Retention periods marked **[proposed]** have no mechanism in the code yet and
must be ratified by [COMPANY-legal-entity] before enforcement.

| # | Data class | Where it actually lives (verified) | Proposed retention | Deletion mechanism |
| --- | --- | --- | --- | --- |
| 1 | **Resumes** (candidate files) | Filesystem: `storage_root/resumes/<file>`; pointer in `candidate_profiles.resume_url`; parsed output in `candidate_profiles.resume_ats_analysis` | While profile is active; delete on request (GDPR/DPDP) | **Existing:** `DELETE /api/candidate/resume` removes the file and nulls `resume_url` + `resume_ats_analysis`. Admin purge of departed candidates: **TODO** |
| 2 | **Marksheets** (files) | **Not stored.** `POST /api/tpo/scan-marksheets` / `extract_marksheet_result` (`server_py/app/ai.py`) decode the upload in memory, run OCR + Groq correction, and discard the file. Extracted fields (roll number, name, branch, CGPA, year) land in `candidate_profiles`. The `marksheet_url` column exists (`database/01_users_colleges.sql`) but no code writes a stored file | File: nothing to retain. Extracted fields: life of recruitment cycle **[proposed: 3 years]**, then purge with profile | In-memory only — automatic. Extracted fields: **TODO** (no purge job) |
| 3 | **Proctoring snapshots** (webcam-derived images, violation events) | **PostgreSQL rows**, table `proctoring_snapshots` (`database/06_proctoring.sql`): `event_type` (`camera_check`/`snapshot`/`violation`/`submission`), base64 image in `snapshot_data` text column, `violation_count`, `violation_severity`, `typing_speed_wpm`, `captured_at` | **365 days** (agreed — already enforced) | **Existing:** automatic — `DELETE FROM proctoring_snapshots WHERE captured_at < NOW() - INTERVAL '365 days'` in `cleanup_old_logs()`; cascades if the parent attempt is deleted (`ON DELETE CASCADE`) |
| 4 | **Interview audio** | **Not persisted.** The platform records no audio server-side (no audio code in `server_py/app`); voice-interview answers reach the backend as **text** and are stored in `ai_interview_answers` (question, answer, AI score, feedback). Browser-side transcription/typewriter flow only | n/a for audio; answer text: see row 5 | n/a for audio |
| 5 | **Interview answers & AI reports** (text) | PostgreSQL: `ai_interview_answers`, `ai_feedback_reports`, `recruiter_voice_interviews`, `recruiter_voice_feedback` (`database/07_interviews_feedback.sql`) | **[proposed: 2 years]** after interview/report date | **TODO** — not covered by `cleanup_old_logs()`; add a purge statement |
| 6 | **Code submissions** | PostgreSQL: `coding_submissions.code` (source text), `score`, `status`, plus `plagiarism_flags` | **[proposed: 1 year]** after attempt submission; keep flags 1 year for integrity appeals | **TODO** — no purge job; `attempts`/`coding_submissions` have no TTL |
| 7 | **Audit logs** | PostgreSQL: `audit_logs` (`database/11_audit_logs.sql`) — action, resource, method, path, `ip_address`, `user_agent`, written by `AuditLoggerMiddleware` | **365 days** (agreed — already enforced) | **Existing:** automatic — `DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '365 days'` in `cleanup_old_logs()` |
| 8 | **Certificates & badges** | PostgreSQL: `certificates` (unique per candidate+exam, `certificate_url`), `badges` (`database/05_attempts_submissions.sql`) | Life of account (a certificate is a credential the candidate is entitled to) | Deleted with the candidate (`ON DELETE CASCADE` on `users`); account-deletion flow: **TODO** (row 10) |
| 9 | **Rejected / inactive candidates** (per-drive status) | PostgreSQL: `candidate_status` rows (status incl. `shortlisted`, offer letters at `offer_letter_url` under `storage_root/offers/`), `attempts`, `exam_assignments` | **[proposed: 1 year]** after the drive closes, then anonymise or delete | **TODO** — no drive-closure purge exists; offer-letter files have no TTL |
| 10 | **Deleted accounts** | PostgreSQL: `users.deleted_at` soft-delete column (`database/12_soft_deletes.sql`) | **[proposed: 30 days]** in soft-deleted state (undo window), then hard-delete children | **TODO** — no purge job exists; hard deletion today only via cascades when the row is removed manually. Manual process: export → delete row → rely on `ON DELETE CASCADE` (see `server_py/app/db.py` relation map) |
| 11 | **Refresh tokens / sessions** | PostgreSQL: `refresh_tokens` (`database/13_refresh_tokens.sql`) — hashed token, `expires_at` (30 days at login), `revoked_at`, `created_by_ip`, `user_agent` | **30 days** per token (enforced at validation via `expires_at`) | Revocation exists (auth flow / incident response); deletion of expired rows: **TODO** — add `DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL 'X days'` to `cleanup_old_logs()` |
| 12 | **Notifications & activity feed** | PostgreSQL: `notifications`, `activity_feed` (`database/08_platform_system.sql`) | **365 days** (agreed — already enforced) | **Existing:** automatic — deleted at 365 days in `cleanup_old_logs()` |
| 13 | **TPO import metadata** | PostgreSQL: `tpo_uploads` (`database/08_platform_system.sql`) — file name, row counts, status (no file contents) | **[proposed: 365 days]**, aligned with audit logs | **TODO** |
| 14 | **Grading queue (disk fallback)** | Filesystem: `grading_queue.json` in `storage_root` (`server_py/app/queue_manager.py`) — only exists when Redis is unavailable | Transient — drained as items grade | **Existing:** truncated by `save_local_queue()` as items are processed; no personal data beyond attempt IDs |
| 15 | **Database backups** | `dumps/<db>_<timestamp>.dump` (custom format) + `dumps/<db>_uploads_<stamp>.tar.gz` produced by `scripts/backup_db.sh`; nightly, unrotated | **[proposed: 90 days]** rolling, minimum 1 restorable copy | **TODO** — the script creates timestamped dumps but has no retention/rotation step; document-and-delete manually until then |

## Known gaps (aggregated)

1. Only four data classes have automated deletion today: audit logs,
   proctoring snapshots, notifications, activity feed (all 365 days,
   `cleanup_old_logs()`).
2. The retention worker runs only when `NODE_ENV == "production"` — staging
   environments accumulate data indefinitely.
3. Account hard-deletion, expired-refresh-token cleanup, interview-text purge,
   code-submission purge and backup rotation are all **TODOs** above; until
   implemented, erasure requests are fulfilled manually
   (docs/PRIVACY_POLICY.md §6).
4. The retention job logs `Data retention cleanup failed` on error — there is
   a Sentry alert rule for it (observability/ALERTING.md §4) so silent failure
   is caught, but there is no Prometheus metric for job success/age.

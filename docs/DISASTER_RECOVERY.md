# Disaster Recovery

Platform: PostgreSQL (`postgres_data` volume), Redis (`redis_data`), MinIO
object storage (`minio_data`), application uploads (`app_uploads` volume
mounted at `FILE_STORAGE_DIR`), plus the isolated Judge0 data
(`judge0_db_data`, `judge0_redis_data`) — all defined in
`docker-compose.prod.yml`.

**Owner:** [COMPANY] infrastructure on-call. **Last drill:** 2026-10-25
(see §4). **Review cadence:** quarterly.

---

## 1. Objectives (proposed)

| Target | Value | Rationale |
| --- | --- | --- |
| **RPO** | **24 h** — nightly `pg_dump` + uploads archive | Backups run daily via `scripts/backup_db.sh`; a worst-case loss loses up to one day of attempts/submissions. Not yet backed by WAL archiving — raising RPO below 24 h requires `wal-g`/PITR **[TODO]** |
| **RTO** | **1 h** | Restore + migrate + smoke-test must complete within one hour; the measured drill restore was 16 s end-to-end, leaving ample headroom for a full-host rebuild |

These are proposed operating targets; commit them to
`[COMPANY-SLA-reference]` only after the first two consecutive quarterly
drills pass.

---

## 2. Backup procedures (as they exist in this repo)

### 2.1 `scripts/backup_db.sh` — database + uploads

```
Usage: backup_db.sh [database] [output_dir]
Env:   PGHOST (default 127.0.0.1), PGPORT (5432), PGUSER (postgres), PGPASSWORD
```

What it does (verified):

1. Locates `pg_dump` on `PATH`, falling back to
   `/c/Program Files/PostgreSQL/{18,17,16,15}/bin` (Windows dev hosts).
2. Writes a **custom-format, compressed dump** (`pg_dump -Fc`) to
   `dumps/<database>_<YYYYMMDD>_<HHMMSS>.dump` (default db `intellihire`,
   default output dir `dumps/`). Custom format supports selective/parallel
   `pg_restore`.
3. If a uploads directory exists (`UPLOADS_DIR` env, default
   `server_py/uploads`), archives it to
   `dumps/<database>_uploads_<STAMP>.tar.gz`. The in-file comment documents
   the intended S3/MinIO replacement:
   `mc mirror --overwrite <alias>/<bucket> backups/<bucket>/` + verification
   with `mc stat` on a sample object.

Schedule: **nightly**, e.g. cron `0 2 * * *` on the host:
`cd /srv/intellihire && ./scripts/backup_db.sh intellihire /backups`
(store `/backups` off-host — NFS/S3 mount — so a host loss cannot take the
backups with it **[TODO: off-host copy is manual today]**).

### 2.2 `scripts/restore_db.sh` — restore

```
Usage: restore_db.sh <dump_file> [target_db]   (default target: intellihire_drill)
Env:   PGHOST, PGPORT, PGUSER, PGPASSWORD; FORCE=1 to override the guard
```

Verified behaviour: **drops and recreates** the target database
(`DROP DATABASE IF EXISTS` / `CREATE DATABASE`), then
`pg_restore --exit-on-error --no-owner`. It **refuses** to run against the
live `intellihire` database unless `FORCE=1` is set explicitly — a deliberate
guard against destroying production during a drill.

### 2.3 `scripts/drill_backup_restore.sh` — the drill

```
Usage: drill_backup_restore.sh [source_db]   (default: intellihire)
```

Verified behaviour: runs `backup_db.sh`, restores the newest dump into the
scratch database `intellihire_drill`, then compares row counts source vs
restored for **11 key tables** — `users`, `colleges`, `candidate_profiles`,
`exams`, `attempts`, `jobs`, `candidate_status`, `ai_interviews`,
`certificates`, `proctoring_snapshots`, `audit_logs` — printing a PASS/FAIL
verdict per table, timing the whole run as the drill RTO, dropping
`intellihire_drill`, and exiting non-zero on any mismatch
(`=== DRILL FAILED ===`).

---

## 3. Restore procedure (production incident)

Runbook link: docs/INCIDENT_RESPONSE.md#db-failure.

1. Stop writes: scale the app to zero
   (`docker compose -f docker-compose.prod.yml stop app`) so users do not
   mutate a database you are about to replace.
2. Pick the newest intact dump: `ls -t dumps/intellihire_*.dump | head -1`.
3. Restore into a **scratch** database first (default behaviour):
   `./scripts/restore_db.sh dumps/intellihire_<stamp>.dump intellihire_restore_check`.
4. Validate: row-count spot check (same table list as the drill), then run the
   app's migration runner against it — `run_migrations` is idempotent
   (tracked in `schema_migrations`) and applies whatever the dump lacks, so a
   dump taken before the newest migration is brought up to date at startup.
5. Cut over: rename/recreate the live database from the validated copy
   (`FORCE=1 ./scripts/restore_db.sh ... intellihire` is the blunt version),
   then `docker compose -f docker-compose.prod.yml up -d app`.
6. Smoke-test the critical flows (login, certificate verify page, public
   portfolio — checklist in observability/ALERTING.md §5) and confirm
   `GET /api/health` returns `200` with `status: healthy`.
7. Publish the data-loss window (time between last dump and failure) to
   stakeholders.

**Uploads/filesystem restore:** untar the matching uploads archive into the
`app_uploads` volume mount (`docker compose cp` or restore directly to the
volume path) so `resumes/` and `offers/` match the restored
`candidate_profiles.resume_url` / `candidate_status.offer_letter_url` rows.

---

## 4. Drill evidence

| Date | Drill | Result | Detail |
| --- | --- | --- | --- |
| 2026-10-25 | `scripts/drill_backup_restore.sh` | **PASSED** | Full backup → restore into `intellihire_drill` → row-count parity on 11 tables (`users`, `colleges`, `candidate_profiles`, `exams`, `attempts`, `jobs`, `candidate_status`, `ai_interviews`, `certificates`, `proctoring_snapshots`, `audit_logs`). Drill RTO: **16 s** (script-measured, includes backup, drop/create, `pg_restore`, verification, scratch-DB teardown). |

Evidence retention: paste the raw drill output into
`[COMPANY-drill-log-location]` (this table must link to it once stored).

---

## 5. Object-storage backup (MinIO)

MinIO runs as compose service `minio` (container `intellihire-minio`, image
`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` by default) on the internal
`backend` network with the `minio_data` named volume at `/data`; no ports are
published (admin console via SSH tunnel: `ssh -L 9001:minio:9001 <host>`).
The app bucket is `intellihire-uploads` (`S3_BUCKET_NAME`).

Volume backup (host-level, simplest):

```bash
docker run --rm -v intellihire_minio_data:/data:ro -v /backups/minio:/backup alpine \
  tar -czf /backup/minio_data_$(date +%Y%m%d).tar.gz /data
```

Object-level backup with `mc` (matches the guidance embedded in
`scripts/backup_db.sh`; `mc` ships inside the MinIO server image):

```bash
docker exec intellihire-minio mc alias set dr "$S3_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
docker exec intellihire-minio mc mirror --overwrite dr/intellihire-uploads /backups/minio-bucket/
docker exec intellihire-minio mc stat dr/backups/intellihire-uploads/<sample-object>   # verify
```

Mirror the mirror off-host (the `/backups` mount) on the same schedule as the
DB dumps. Restore = `mc mirror` in the reverse direction, then
`mc stat` verification of a sample set.

Judge0 note: its `judge0_db_data` / `judge0_redis_data` volumes hold only the
sandbox's own bookkeeping — not candidate data; rebuilding the Judge0 stack
from `docker-compose.prod.yml` is sufficient and no backup is required.

---

## 6. Quarterly drill schedule

| Quarter | Drill | Pass criterion |
| --- | --- | --- |
| Q1 [COMPANY-year] | `drill_backup_restore.sh` on staging data | All 11 tables PASS, RTO < 1 h |
| Q2 | Full-host simulation: restore onto a clean VM/container host from dumps only | App boots, migrations apply, `/api/health` 200, uploads visible |
| Q3 | `drill_backup_restore.sh` + MinIO `mc mirror` restore test | DB tables PASS + sample objects verify via `mc stat` |
| Q4 | Chaos rehearsal: kill `postgres` mid-exam (staging), run the DB-failure playbook end-to-end | Recovery via playbook, postmortem written |

Rules: every drill is run by someone who is **not** the person who wrote the
last backup change; output is archived with date, executor and verdict; a
failed drill is a SEV2 ticket. Next scheduled drill after 2026-10-25:
**[COMPANY-next-drill-date]**.

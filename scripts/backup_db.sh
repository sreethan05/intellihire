#!/usr/bin/env bash
# PostgreSQL backup: timestamped custom-format dump, suitable for pg_restore.
# Usage: backup_db.sh [database] [output_dir]
# Env: PGHOST (default 127.0.0.1), PGPORT (5432), PGUSER (postgres), PGPASSWORD.
# Custom format (-Fc) is compressed and supports selective/parallel restore.
set -euo pipefail

DB="${1:-intellihire}"
OUT_DIR="${2:-dumps}"
STAMP="$(date +%Y%m%d_%H%M%S)"

# Locate pg_dump: PATH first, then the standard Windows install dirs.
if command -v pg_dump >/dev/null 2>&1; then
  PG_DUMP=pg_dump
else
  for d in "/c/Program Files/PostgreSQL/18/bin" "/c/Program Files/PostgreSQL/17/bin" "/c/Program Files/PostgreSQL/16/bin" "/c/Program Files/PostgreSQL/15/bin"; do
    if [ -x "$d/pg_dump.exe" ]; then PG_DUMP="$d/pg_dump.exe"; break; fi
  done
fi
[ -n "${PG_DUMP:-}" ] || { echo "pg_dump not found" >&2; exit 1; }

mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/${DB}_${STAMP}.dump"

echo "[backup_db] dumping $DB -> $OUT_FILE"
"$PG_DUMP" -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" \
  -Fc -d "$DB" -f "$OUT_FILE"
echo "[backup_db] OK: $(ls -lh "$OUT_FILE" | awk '{print $5, $9}')"

# Object storage (local uploads dir stand-in; when S3/MinIO is enabled, replace
# this with: mc mirror --overwrite <alias>/<bucket> backups/<bucket>/ and verify
# with `mc stat` on a sample object).
UPLOADS_SRC="${UPLOADS_DIR:-server_py/uploads}"
if [ -d "$UPLOADS_SRC" ]; then
  TAR_FILE="$OUT_DIR/${DB}_uploads_${STAMP}.tar.gz"
  tar -czf "$TAR_FILE" "$UPLOADS_SRC"
  echo "[backup_db] OK: uploads archived -> $TAR_FILE"
fi

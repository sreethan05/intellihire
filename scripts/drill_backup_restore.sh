#!/usr/bin/env bash
# Backup + restore drill: proves the backup is restorable, not just present.
# 1. Backup the source DB (default intellihire).
# 2. Restore it into intellihire_drill (a scratch database).
# 3. Compare row counts of key tables; PASS/FAIL verdict with RTO timing.
# Usage: drill_backup_restore.sh [source_db]
set -euo pipefail

SRC_DB="${1:-intellihire}"
DRILL_DB="intellihire_drill"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRILL_START=$(date +%s)
echo "=== IntelliHire backup/restore drill: $SRC_DB -> $DRILL_DB ==="

./scripts/backup_db.sh "$SRC_DB" dumps
DUMP_FILE=$(ls -t dumps/"${SRC_DB}"_*.dump | head -1)
echo "[drill] latest backup: $DUMP_FILE"

./scripts/restore_db.sh "$DUMP_FILE" "$DRILL_DB"

if command -v psql >/dev/null 2>&1; then
  PSQL=psql
else
  for d in "/c/Program Files/PostgreSQL/18/bin" "/c/Program Files/PostgreSQL/17/bin" "/c/Program Files/PostgreSQL/16/bin" "/c/Program Files/PostgreSQL/15/bin"; do
    if [ -x "$d/psql.exe" ]; then PSQL="$d/psql.exe"; break; fi
  done
fi
PGARGS=(-h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}")

TABLES="users colleges candidate_profiles exams attempts jobs candidate_status ai_interviews certificates proctoring_snapshots audit_logs"
FAIL=0
printf "%-24s %12s %12s %s\n" "table" "source" "restored" "verdict"
for t in $TABLES; do
  SRC_COUNT=$("$PSQL" "${PGARGS[@]}" -d "$SRC_DB" -Atc "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "n/a")
  RST_COUNT=$("$PSQL" "${PGARGS[@]}" -d "$DRILL_DB" -Atc "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "MISSING")
  if [ "$SRC_COUNT" = "$RST_COUNT" ]; then VERDICT="PASS"; else VERDICT="FAIL"; FAIL=1; fi
  printf "%-24s %12s %12s %s\n" "$t" "$SRC_COUNT" "$RST_COUNT" "$VERDICT"
done

RTO=$(( $(date +%s) - DRILL_START ))
"$PSQL" "${PGARGS[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null
echo "=== drill RTO: ${RTO}s ==="
if [ "$FAIL" -eq 0 ]; then echo "=== DRILL PASSED ==="; else echo "=== DRILL FAILED ==="; exit 1; fi

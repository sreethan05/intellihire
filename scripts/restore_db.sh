#!/usr/bin/env bash
# Restore a pg_dump custom-format backup into a (recreated) database.
# Usage: restore_db.sh <dump_file> [target_db]
# DANGEROUS: drops and recreates the target database. Refuses to run against
# the production database name unless FORCE=1 is set explicitly.
set -euo pipefail

DUMP_FILE="${1:?usage: restore_db.sh <dump_file> [target_db]}"
TARGET_DB="${2:-intellihire_drill}"

if [ "$TARGET_DB" = "intellihire" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "refusing to drop the live '$TARGET_DB' database; set FORCE=1 to override" >&2
  exit 1
fi

if command -v psql >/dev/null 2>&1; then
  PSQL=psql; PG_RESTORE=pg_restore
else
  for d in "/c/Program Files/PostgreSQL/18/bin" "/c/Program Files/PostgreSQL/17/bin" "/c/Program Files/PostgreSQL/16/bin" "/c/Program Files/PostgreSQL/15/bin"; do
    if [ -x "$d/psql.exe" ]; then PSQL="$d/psql.exe"; PG_RESTORE="$d/pg_restore.exe"; break; fi
  done
fi
[ -n "${PSQL:-}" ] || { echo "psql not found" >&2; exit 1; }

PGARGS=(-h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}")

echo "[restore_db] dropping/recreating $TARGET_DB"
"$PSQL" "${PGARGS[@]}" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";"
"$PSQL" "${PGARGS[@]}" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET_DB\";"

echo "[restore_db] restoring $DUMP_FILE -> $TARGET_DB"
"$PG_RESTORE" "${PGARGS[@]}" -d "$TARGET_DB" --exit-on-error --no-owner "$DUMP_FILE" > /dev/null
echo "[restore_db] OK"

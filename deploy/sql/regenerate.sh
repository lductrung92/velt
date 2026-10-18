#!/usr/bin/env bash
#
# Regenerates ddl.sql and master_data.sql from src/backend/migrations.
#
# Run this after adding a migration. The two SQL files are a SNAPSHOT of what the
# migrations produce, not a second definition of the schema — editing them by
# hand is how they start disagreeing with the code, and the disagreement only
# surfaces on the one machine you built from the files instead of the app.
#
# It works by applying the migrations to a throwaway database and dumping the
# result, so the output cannot drift from the migrations by construction.
#
# Usage:
#   deploy/sql/regenerate.sh                      # uses the dev database server
#   PGHOST=... PGPORT=... deploy/sql/regenerate.sh
#
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
SCRATCH="${SCRATCH_DB:-velt_ddl_scratch}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

psql="$(command -v psql || true)"
pg_dump="$(command -v pg_dump || true)"
if [[ -z "$psql" || -z "$pg_dump" ]]; then
  echo "need psql and pg_dump on PATH (postgresql-client)" >&2
  exit 1
fi

echo "==> building $SCRATCH from migrations"
"$psql" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -q \
  -c "DROP DATABASE IF EXISTS $SCRATCH;" -c "CREATE DATABASE $SCRATCH;"
( cd "$repo/src/backend" && \
  DATABASE_URL="postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$SCRATCH?sslmode=disable" \
  go run ./cmd/api migrate )

echo "==> dumping schema -> deploy/sql/ddl.sql"
"$pg_dump" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SCRATCH" \
  --schema-only --no-owner --no-privileges --no-comments \
  -f "$here/ddl.sql"

# pg_dump 17+ writes `SET transaction_timeout = 0;`. The production server runs
# Postgres 16, which does not know that parameter and refuses the whole script
# over it. Zero is the default, so dropping the line changes nothing — but it
# has to be dropped on every regeneration, not by hand once, which is how it
# came back the first time.
echo "==> removing SET transaction_timeout (unknown to Postgres 16)"
if grep -q '^SET transaction_timeout' "$here/ddl.sql"; then
  sed -i '/^SET transaction_timeout/d' "$here/ddl.sql"
else
  echo "    (not emitted by this pg_dump)"
fi

echo "==> dumping reference data"
"$pg_dump" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SCRATCH" \
  --data-only --no-owner --no-privileges --column-inserts --rows-per-insert=1000 \
  -t roles -t permissions -t role_permissions \
  -f "$here/_data_raw.sql"

echo
echo "Reference data written to _data_raw.sql."
echo "master_data.sql is assembled from it by hand because it adds three things a"
echo "dump cannot: ON CONFLICT clauses, goose rows timestamped now() in version"
echo "order, and the commented bootstrap for the first administrator. Fold the new"
echo "INSERTs in, keep that structure, then delete _data_raw.sql."
echo
echo "Verify before committing — build a database from the files alone:"
echo "  createdb velt_verify"
echo "  psql -d velt_verify -v ON_ERROR_STOP=1 -f deploy/sql/ddl.sql -f deploy/sql/master_data.sql"
echo "  DATABASE_URL=...velt_verify go run ./cmd/api migrate   # must say 'no migrations to run'"

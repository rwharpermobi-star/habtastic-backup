#!/usr/bin/env bash
# Applies the referral migration to a throwaway local Postgres database and runs
# the scenario tests. Needs a local Postgres you can reach with psql/createdb.
set -euo pipefail
cd "$(dirname "$0")/../supabase"
DB=${REFERRAL_TEST_DB:-habtastic_referral_test}
PSQL=${PSQL:-psql}
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
run() { $PSQL -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$1" 2>&1 | grep -v 'does not exist, skipping' || true; }
$PSQL -q -X -v ON_ERROR_STOP=1 -d "$DB" -f tests/referral_rules_stub_schema.sql >/dev/null
$PSQL -q -X -v ON_ERROR_STOP=1 -d "$DB" -f migrations/20261121030000_referral_rules_1_3_10_20_and_missing_tables.sql >/dev/null 2>&1
# applying it twice must also work (idempotent)
$PSQL -q -X -v ON_ERROR_STOP=1 -d "$DB" -f migrations/20261121030000_referral_rules_1_3_10_20_and_missing_tables.sql >/dev/null 2>&1
$PSQL -q -X -v ON_ERROR_STOP=1 -d "$DB" -f tests/referral_rules_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
dropdb "$DB"

#!/usr/bin/env bash
# Prova le migrazioni e i permessi su un Postgres locale (porta 54329).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DB:-messina_test}"
P="psql -h ${PGH:-/tmp/pgtest} -p ${PGP:-54329} -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do echo "· $f"; $P -d $DB -f "$f"; done
echo "· seed"; $P -d $DB -f seed.sql
for t in tests/[1-9]*.sql; do echo "· $t"; $P -d $DB -f "$t"; done
echo "OK: migrazioni, seed e test passati"

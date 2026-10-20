#!/usr/bin/env bash
# Prova le migrazioni e i permessi su un Postgres locale (porta 54329).
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -h /tmp/pgtest -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists messina_test" -c "create database messina_test"
$P -d messina_test -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do echo "· $f"; $P -d messina_test -f "$f"; done
echo "· seed"; $P -d messina_test -f seed.sql
for t in tests/[1-9]*.sql; do echo "· $t"; $P -d messina_test -f "$t"; done
echo "OK: migrazioni, seed e test passati"

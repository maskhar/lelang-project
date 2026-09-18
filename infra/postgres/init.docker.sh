#!/bin/sh
set -eu
# Padanan infra/postgres/init.sh untuk stack Docker produksi: nama database bisa berbeda dari
# development (lelang_properti_dev), jadi dijadikan parameter psql (:"db_name") alih-alih literal.
# Nama role (lelang_app, lelang_migrator) dan schema tetap sama — dipakai apa adanya oleh
# scripts/grant-runtime.sql dan seluruh kode aplikasi, jangan diganti.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_PASSWORD" --set=migrator_password="$MIGRATOR_PASSWORD" --set=db_name="$POSTGRES_DB" <<'SQL'
SET log_statement = 'none';
CREATE ROLE lelang_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
CREATE ROLE lelang_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
ALTER DATABASE :"db_name" OWNER TO lelang_migrator;
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO lelang_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL

#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_PASSWORD" --set=migrator_password="$MIGRATOR_PASSWORD" <<'SQL'
SET log_statement = 'none';
CREATE ROLE lelang_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
CREATE ROLE lelang_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
ALTER DATABASE lelang_properti_dev OWNER TO lelang_migrator;
REVOKE ALL ON DATABASE lelang_properti_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE lelang_properti_dev TO lelang_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL

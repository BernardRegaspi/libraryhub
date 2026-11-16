-- Local development bootstrap for ULMS PostgreSQL (docker compose postgres service).
-- Production uses the same database name and a dedicated schema; provision roles separately.

CREATE SCHEMA IF NOT EXISTS libraryhub;
COMMENT ON SCHEMA libraryhub IS 'ULMS application tables (not Koha data)';

ALTER DATABASE libraryhub SET search_path TO libraryhub, public;
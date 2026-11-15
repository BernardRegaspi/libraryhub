# PostgreSQL (ULMS)

Standalone PostgreSQL holds ULMS-owned data only. Koha uses its own MariaDB installation.

## Local development

Root `docker-compose.yml` starts PostgreSQL 18 with:

- Database: `libraryhub`
- Application schema: `libraryhub` (see `init/01-libraryhub-schema.sql`)
- Default dev role: `libraryhub` / `libraryhub_dev` (see `.env.example`)

Production runs PostgreSQL in a dedicated VM with least-privilege runtime, migration, backup, and read-only reporting roles. Do not use the dev credentials outside local machines.

## References

- `plan/plan.md` §3.0 and §9.1
- `docs/deployment.md`
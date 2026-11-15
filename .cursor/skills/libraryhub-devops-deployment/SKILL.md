---
name: libraryhub-devops-deployment
description: >-
  Use for libraryhub Docker Compose, CI, nginx examples, Postgres 18 local dev,
  and deployment docs. Koha runs outside this compose stack.
---

# libraryhub devOps and deployment

## Local stack

- Root `docker-compose.yml`: PostgreSQL 18 + Redis 7 only (ULMS app processes run on the host).
- Schema init: `infrastructure/postgres/init/01-libraryhub-schema.sql`
- Root scripts: `npm run db:up`, `npm run db:migrate`, `npm run dev`, `npm run dev:api`

## CI

- `.github/workflows/ci.yml`: workspace web build + API ruff/pytest with Postgres service.
- Root `npm ci` requires root `package-lock.json` (npm workspaces).

## Production (target)

- Proxmox VMs: Koha (Debian), ULMS app (Ubuntu), PostgreSQL VM.
- Nginx TLS termination: see `infrastructure/nginx/nginx.conf.example`
- Application images: `infrastructure/docker/Dockerfile.*` (build from repo root).

## Rules

- Do not commit `.env`, Koha credentials, or dumps.
- Keep Koha deployment notes in `infrastructure/koha/` without secrets.
- PostgreSQL production roles: separate runtime, migration, backup (see `plan/plan.md` §3.0).
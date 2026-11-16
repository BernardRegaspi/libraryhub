---
name: libraryhub-architecture
description: >-
  Use when placing logic in libraryhub — FastAPI routers/services, SQLAlchemy models,
  Koha adapter, or Next.js routes/components. Enforces modular monolith, department-aware
  auth at the API layer, and Koha-via-HTTPX only.
---

# libraryhub architecture

## Layout

```
apps/
  api/          FastAPI (Python)
  web/          Next.js App Router (TypeScript)
infrastructure/ Docker, Postgres init, nginx examples
docs/           Operations and ownership docs
plan/           Product and technical baseline
```

## Backend (`apps/api`)

```
api/routes/     HTTP entry, thin handlers
services/       Business logic and authorization
schemas/        Pydantic request/response
models/         SQLAlchemy (ULMS-owned data only)
integrations/koha/   HTTPX client — no MariaDB access
database/       Engine/session helpers
core/           Settings, logging, security
```

- Versioned API prefix: `/api/v1` (see `plan/plan.md` §8).
- Alembic is the only ULMS schema migration authority; schema `libraryhub`.
- Retry Koha calls only when safe; never blindly retry circulation writes.

## Frontend (`apps/web`)

```
app/(auth)/           Sign-in flows (Phase 2+)
app/(dashboard)/      Staff shell
app/catalog/          Koha-backed catalog UI
app/student/          Student self-service (pilot)
components/           ui, layout, tables, forms, charts
lib/, services/, hooks/, types/
```

- Server state: TanStack Query (install when first real data feature ships).
- API calls via FastAPI only (`lib/api.ts` / services layer).

## Non-goals

- No direct Koha DB access from ULMS.
- No microservices until measured need.
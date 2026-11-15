# Developer setup

Phase 1 foundation for **libraryhub** (ULMS). Koha data stays in Koha; ULMS data stays in PostgreSQL.

## Prerequisites

- Node.js 20+ and npm
- Python 3.12+ (3.14 target per `plan/tech-stack.md` when available locally)
- Docker Engine for local PostgreSQL and Redis

## 1. Clone and environment

```bash
cp .env.example .env
```

Edit `.env` only on your machine. Never commit secrets or Koha credentials.

## 2. Install (npm workspaces)

From the **repository root**:

```bash
npm install
```

Python API (separate venv recommended):

```bash
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

## 3. Data services

```bash
npm run db:up
# or: docker compose up -d
```

This starts PostgreSQL 18 (`libraryhub` database/schema) and Redis 7.

## 4. Migrations

```bash
npm run db:migrate
```

## 5. Backend (FastAPI)

```bash
npm run dev:api
```

Checks:

- Liveness: http://localhost:8000/api/v1/health
- Readiness: http://localhost:8000/api/v1/health/ready
- OpenAPI: http://localhost:8000/docs

## 6. Frontend (Next.js)

```bash
npm run dev
```

App: http://localhost:3000

The browser must call FastAPI (`NEXT_PUBLIC_API_BASE_URL`), not PostgreSQL or Koha.

## 7. Quality commands

| Area | Command |
|------|---------|
| Web lint | `npm run lint` |
| Web types | `npm run typecheck` |
| API lint | `npm run lint:api` |
| API tests | `npm run test:api` |

CI runs the same checks (see `.github/workflows/ci.yml`).

## Layout

See `plan/file-structure.md` and `plan/plan.md` §3.5 (paths use `apps/web` and `apps/api`).
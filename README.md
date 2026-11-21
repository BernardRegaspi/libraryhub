# libraryhub

University Library Management System (ULMS): Next.js staff/student experience, FastAPI API, PostgreSQL for ULMS-owned data, and Koha as the library system of record via REST.

Licensed under the [MIT License](LICENSE).

## Monorepo structure

| Path | Purpose |
|------|---------|
| `apps/web` | Next.js 16 App Router UI |
| `apps/api` | FastAPI modular monolith |
| `infrastructure/` | Docker, PostgreSQL notes, Nginx, monitoring |
| `docs/` | Architecture, security, developer setup, Superpowers specs |
| `plan/` | Implementation plan and tech stack |

See `plan/file-structure.md` for the full tree.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm
- [Python](https://www.python.org/) 3.12+ (3.14 is fine locally)
- [Docker Engine](https://docs.docker.com/engine/install/) with Compose for local PostgreSQL and Redis

Koha stays outside this repo; configure Koha REST credentials in `.env` when you integrate.

## Quick start

Full detail: [`docs/developer-setup.md`](docs/developer-setup.md).

```bash
cp .env.example .env
npm install

cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -e ".[dev]"
# or: pip install -r requirements-dev.txt
cd ../..

docker compose up -d postgres redis
npm run db:migrate

# Terminal 1
npm run dev:api

# Terminal 2
npm run dev
```

- Web: http://localhost:3000
- API liveness: http://localhost:8000/api/v1/health
- API readiness (needs Postgres): http://localhost:8000/api/v1/health/ready
- OpenAPI: http://localhost:8000/docs

Ensure `.env` at the repo root matches the Docker defaults below (see `.env.example`).

## Local data (Docker)

[`docker-compose.yml`](docker-compose.yml) defines PostgreSQL 18, Redis 7, and an optional API container. For everyday dev you usually run the API on the host (`npm run dev:api`) and start **only the databases**:

```bash
# Start PostgreSQL + Redis (detached)
docker compose up -d postgres redis

# Check status
docker compose ps

# Follow logs
docker compose logs -f postgres redis

# Stop containers (keep data volume)
docker compose stop postgres redis

# Stop and remove containers (Postgres data kept in named volume)
npm run db:down
# equivalent: docker compose down
```

To run every service in the file (including the API image on port 8000), use:

```bash
npm run db:up
# equivalent: docker compose up -d
```

Do not run `npm run dev:api` at the same time as the compose `api` service—both use port 8000.

### PostgreSQL (ULMS)

| Setting | Local default |
|---------|----------------|
| Host / port | `localhost:5432` |
| Database | `libraryhub` |
| User / password | `libraryhub` / `libraryhub_dev` |
| Connection URL | `postgresql+psycopg://libraryhub:libraryhub_dev@localhost:5432/libraryhub` |

On first start, scripts under `infrastructure/postgres/init/` run once. Apply schema changes with:

```bash
npm run db:migrate
```

### Redis

| Setting | Local default |
|---------|----------------|
| Host / port | `localhost:6379` |
| URL | `redis://localhost:6379/0` |

Redis is used for caching and future session/queue work; the databases must be up before readiness checks pass.

## Boundaries

- Browser → FastAPI → PostgreSQL for ULMS data.
- Browser must not connect to PostgreSQL or Koha MariaDB.
- Koha integration is backend-only (`apps/api/app/integrations/koha/`).

## AI-assisted development

- Cursor rules: `.cursor/rules/` (Superpowers workflow, model routing — from BrgyCloud baseline).
- Project skills: `.cursor/skills/libraryhub-*`
- Agent entrypoint: `AGENTS.md`
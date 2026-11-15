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

## Quick start

Full steps: [`docs/developer-setup.md`](docs/developer-setup.md).

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate

# Terminal 1
npm run dev:api

# Terminal 2
npm run dev
```

- Web: http://localhost:3000
- API health: http://localhost:8000/api/v1/health

## Boundaries

- Browser → FastAPI → PostgreSQL for ULMS data.
- Browser must not connect to PostgreSQL or Koha MariaDB.
- Koha integration is backend-only (`apps/api/app/integrations/koha/`).

## AI-assisted development

- Cursor rules: `.cursor/rules/` (Superpowers workflow, model routing — from BrgyCloud baseline).
- Project skills: `.cursor/skills/libraryhub-*`
- Agent entrypoint: `AGENTS.md`
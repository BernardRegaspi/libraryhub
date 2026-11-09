# University Library Management System

Next.js frontend and FastAPI backend for the university library, with Koha remaining the system of record for library data it already owns.

## Layout

- `frontend/` — Next.js application
- `backend/` — FastAPI application
- `infrastructure/` — Docker, Nginx, monitoring, backups, and scripts
- `docs/` — architecture and operations notes
- `plan/` — implementation plan

## Frontend

```bash
cd frontend
npm run dev
```

The app is served at http://localhost:3000.

## Local data services

```bash
docker compose up -d
```

PostgreSQL listens on port 5432 and Redis on port 6379. Copy `.env.example` to `.env` before connecting the backend.
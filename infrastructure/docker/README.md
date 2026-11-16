# ULMS application containers

Use these Dockerfiles for reproducible backend/frontend images on the application VM. Local development typically runs `uvicorn` and `next dev` directly; use `docker-compose.yml` at the repo root for PostgreSQL and Redis only.

Build examples:

```bash
docker build -f infrastructure/docker/Dockerfile.backend -t libraryhub-api .
docker build -f infrastructure/docker/Dockerfile.frontend -t libraryhub-web .

Run from the repository root so `apps/` paths resolve.
```
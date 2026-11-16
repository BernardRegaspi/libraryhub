# ULMS application containers

Use these Dockerfiles for reproducible backend and frontend images. The root `docker-compose.yml` starts PostgreSQL, Redis, and the API. The API container applies Alembic migrations, then listens on port 8000. Run the Next.js app on the host so the browser can keep calling `http://127.0.0.1:8000`.

Build examples:

```bash
docker build -f infrastructure/docker/Dockerfile.backend -t libraryhub-api .
docker build -f infrastructure/docker/Dockerfile.frontend -t libraryhub-web .

Run from the repository root so `apps/` paths resolve.
```
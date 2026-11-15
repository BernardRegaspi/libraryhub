# Architecture

High-level design lives in [`plan/plan.md`](../plan/plan.md). At a glance:

- **Next.js** — staff/student UI; server state via TanStack Query (as features land).
- **FastAPI** — versioned `/api/v1/*` boundary, authorization, and integrations.
- **PostgreSQL** — ULMS-owned tables in database/schema `libraryhub`.
- **Koha** — authoritative bibliographic, item, patron, and circulation data; ULMS calls the Koha REST API only.

Local development uses root `docker-compose.yml` for PostgreSQL and Redis. Production runs PostgreSQL and Koha on separate VMs per the deployment plan.

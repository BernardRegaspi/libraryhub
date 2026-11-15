# libraryhub — Technology Stack

## Architecture decision

Use **standalone PostgreSQL** for ULMS-owned application data. Do not deploy an additional bundled backend platform. FastAPI is the only normal application data-access layer.

**Important database boundary:** PostgreSQL is for the ULMS. The new Koha installation must use the database and search infrastructure supported by the selected Koha release (planned: MariaDB plus the supported Koha search engine). Do not attempt to configure Koha to use PostgreSQL. Do not let the ULMS connect directly to Koha's MariaDB tables; integrate through Koha's REST API.

## Frontend

| Area | Technology | Purpose |
|---|---|---|
| Framework | Next.js 16 App Router | Application routing, layouts, rendering, server/client components |
| UI | React + TypeScript | Typed component development |
| Styling | Tailwind CSS | Responsive design system |
| Components | shadcn/ui + Radix primitives | Accessible forms, dialogs, menus, tabs, tables |
| Charts | Recharts | Dashboard and analytics visualizations |
| Data tables | TanStack Table | Sorting, filtering, pagination, column visibility |
| Server state | TanStack Query | API fetching, caching, invalidation, mutation handling |
| Forms | React Hook Form + Zod | Form state and client-side validation |
| Icons | Lucide React | Consistent interface icons |
| Date/time | date-fns + date-fns-tz | Date formatting and timezone handling |
| Notifications | Sonner | Action feedback and toast notifications |
| Theme | next-themes | Optional light/dark theme support |
| Client global state | Zustand | Only for shared client state that is not server state |
| Virtualization | @tanstack/react-virtual | Large lists/tables when profiling shows it is needed |
| Command palette | cmdk | Searchable navigation and quick actions |
| File picker | react-dropzone | Drag-and-drop upload UI where required |

Frontend rules:

- Use TanStack Query for server state; do not duplicate it in Zustand.
- Browser requests go to the FastAPI API. The browser must not connect directly to PostgreSQL or Koha MariaDB.
- Do not expose database credentials, Koha API credentials, private signing keys, or administrative secrets in `NEXT_PUBLIC_*` variables.
- Use server-side sessions/cookies and CSRF protections appropriate to the authentication design.
- Use accessible components, keyboard navigation, clear loading/empty/error states, and responsive layouts.

## Backend

| Area | Technology | Purpose |
|---|---|---|
| Language | Python 3.14.x | Backend runtime; pin latest compatible patch release |
| API framework | FastAPI | REST API and optional WebSocket endpoints |
| Validation/settings | Pydantic 2.x + pydantic-settings | Request/response schemas and configuration |
| ORM | SQLAlchemy 2.x | PostgreSQL data access |
| PostgreSQL driver | Psycopg 3 | PostgreSQL connection driver |
| Migrations | Alembic | Version-controlled schema changes |
| Koha API client | HTTPX | Calls to the new Koha REST API |
| Auth/password hashing | University SSO/OIDC if available; otherwise FastAPI-managed sessions and Argon2id password hashing | Centralized identity and secure sign-in |
| Cache/queue | Redis | Optional cache, rate limiting, task broker, ephemeral coordination |
| Background jobs | Celery | Optional reports, imports, scheduled work, bulk notifications |
| Realtime | FastAPI WebSockets; SSE for one-way streams where simpler | Live notifications and dashboard changes |
| Tests | Pytest + HTTPX test client | Unit, service, API, and integration tests |
| Lint/format | Ruff | Python code quality |

Backend rules:

- Start with a **modular monolith**, not microservices.
- Use SQLAlchemy 2.x + Psycopg 3 for PostgreSQL; use Alembic as the only ULMS schema-migration owner.
- Separate runtime, migration, read-only reporting (if needed), and backup/maintenance database roles. Never use the PostgreSQL superuser for normal requests.
- Put ULMS-owned tables in a dedicated schema such as `libraryhub` within a database named `libraryhub`.
- Apply department-aware RBAC in FastAPI services and routes. Use PostgreSQL row-level security only if per-request identity/department context can be applied and tested reliably; RLS is not a replacement for application authorization.
- Implement strict timeouts, pagination, structured logging, request IDs, and safe retry rules for Koha API requests. Never blindly retry non-idempotent circulation operations.

## Databases and library platform

| System | Technology | Ownership |
|---|---|---|
| ULMS application data | PostgreSQL 18.x (latest patched stable 18.x minor at deployment) | ULMS users/roles, departments, preferences, app settings, audit events, durable notifications, ULMS-specific workflows |
| Library management system | Koha 26.05.x stable release selected at deployment | Bibliographic records, item copies, patron records, circulation, holds, fines, acquisitions/serials where configured |
| Koha relational database | MariaDB version required by the selected Koha release | Koha internal data only |
| Koha search/index service | Elasticsearch or Zebra, as supported by selected Koha release | Koha catalog indexing and search |

Never replicate the entire Koha catalog, patron database, or circulation history into PostgreSQL as a second source of truth. Use short-lived or explicitly managed caches only when required and label cached values with freshness/source metadata.

## Infrastructure and operations

| Area | Technology | Purpose |
|---|---|---|
| Hypervisor | Proxmox VE | Run isolated Koha, ULMS, PostgreSQL, and monitoring VMs |
| Host OS | Proxmox-supported host installation | Hypervisor host |
| Koha VM OS | Debian release supported by the selected Koha version/packages | Koha installation |
| ULMS VM OS | Ubuntu Server LTS | Next.js, FastAPI, Nginx, and application containers |
| Containers | Docker Engine + Docker Compose | Reproducible ULMS app and worker deployment; do not containerize Koha against unsupported recipes |
| Reverse proxy | Nginx | HTTPS termination and routing to ULMS/Koha services |
| Monitoring | Prometheus + Grafana | Metrics, dashboards, alerting |
| Tracing | OpenTelemetry | Request and background-job tracing where needed |
| Load testing | k6 | Capacity tests for login, catalog, dashboard, and API workflows |
| File storage | University NAS or MinIO-compatible private object storage | Documents/attachments when approved |
| Backups | pgBackRest or an approved PostgreSQL backup approach; Koha/MariaDB-specific backup process | Encrypted off-host backups and restore testing |

Redis, Celery, WebSockets, object storage, and OpenTelemetry are not all mandatory on day one. Add each only when the feature requires it or testing shows a need. PostgreSQL and Koha's own MariaDB/search stack are required for the planned architecture.

## Testing and quality

- Backend: Pytest, HTTPX test client, disposable PostgreSQL test database, mocked Koha adapter, approved Koha staging contract tests.
- Frontend: Vitest, React Testing Library, ESLint, TypeScript checks.
- End-to-end: Playwright.
- Performance: k6; test realistic journeys, not just raw HTTP hits.
- Operations: backup/restore rehearsal, database migration rehearsal, security review, dependency and secret scanning.

## Version policy (checked 15 November 2026)

Use these as planning baselines, then re-check and pin the newest compatible patched releases when implementation begins:

- Next.js: stable 16.x; Next.js 16.4.6 was the latest stable release located in the release listings on 15 November 2026. Do not use canary for production.
- Python: 3.14.x is the conservative target runtime; Python 3.15.2 is also stable, but select it only after every dependency and deployment image is verified compatible.
- FastAPI: 0.162.x was current in the official release notes during November 2026; pin a patched stable version compatible with selected Python/Pydantic packages.
- PostgreSQL: 18.x; PostgreSQL 18.7 was the latest minor release located on 15 November 2026. Use the latest patched 18.x minor at deployment.
- Koha: 26.05.05 was the latest stable maintenance release located on 15 November 2026. Re-check the official Koha release page before installing.

## Key official references

- Next.js App Router: https://nextjs.org/docs/app
- Next.js releases: https://github.com/vercel/next.js/releases
- Python stable releases: https://www.python.org/downloads/source/
- FastAPI release notes: https://fastapi.tiangolo.com/release-notes/
- PostgreSQL versioning: https://www.postgresql.org/support/versioning/
- Koha releases: https://koha-community.org/download-koha/

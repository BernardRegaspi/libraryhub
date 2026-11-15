# libraryhub (University Library Management System / ULMS)

> **Implementation plan for AI-assisted development**  
> **Status:** Proposed baseline — obtain university approval for the new Koha deployment, data ownership, privacy, and procurement before production implementation.  
> **Estimated delivery:** 18–24 weeks for a controlled MVP-to-pilot rollout, followed by iterative enhancements. This is a planning estimate, not a delivery guarantee.  
> **Primary architecture:** One new Dell PowerEdge host running separate virtual machines for a fresh Koha installation (Koha + MariaDB + its supported search engine), the ULMS (Next.js + FastAPI), and standalone PostgreSQL for ULMS-owned data. No optional platform services are required.

---

## 1. Project overview

### 1.1 Purpose

Build libraryhub, a secure, responsive, multi-department University Library Management System (ULMS), that provides one modern administrative and user-facing experience across the university's five library departments and uses a newly deployed Koha installation as the authoritative library system for bibliographic, item, patron, and circulation records.

The ULMS must improve the experience of librarians, library administrators, and eventually students. It must centralize department-level dashboards, staff workflows, user access, notifications, analytics, reporting, and university-specific features without creating a second, conflicting source of truth for Koha data.

### 1.2 Library departments in scope

The initial deployment covers these five departments:

1. College Library
2. Junior High School Library
3. Senior High School Library
4. Grade School Library
5. Graduate School Library

Treat each as a configurable organizational unit. Do not assume that its name is identical to a Koha branch name or branch code. Create a mapping table that an authorized administrator can configure after the new Koha instance's branch codes and organizational structure are approved.

### 1.3 Existing environment and known constraints

- The university has an existing Koha installation on a Dell PowerEdge R230. The project team does **not** have permission to administer it, inspect its configuration, query its database, access its backups, or retrieve its data.
- The project will therefore deploy a **new, independent Koha instance** on the newly procured Dell PowerEdge server. The new ULMS and its Koha integration must not depend on the inaccessible R230 installation.
- The new Koha instance must be a clean, supported Koha deployment—not a custom reimplementation of Koha. It will use Koha's supported database/search components and its REST API.
- The five library departments in scope are College Library, Junior High School Library, Senior High School Library, Grade School Library, and Graduate School Library.
- Approximately 10 librarian/staff accounts have been described for the current workflow. Confirm the real staff roster and permissions before creating production accounts in the new installation.
- Student self-service access is a planned capability. Do not enable the whole student population until the university approves identity matching, patron registration, privacy, consent, and account lifecycle rules.
- The new Koha version, API endpoints, search engine, branch mapping, collection size, catalog records, patron records, and circulation policies must be established during discovery and implementation.
- Do not attempt to access the old R230 by SSH, web admin, database, backup, network scan, or other means without written authorization. Do not attempt to bypass the access restriction.
- **Data migration is not assumed.** Without an authorized export/backup from the old Koha administrator, the new Koha instance must start with approved new data. If the university later authorizes an export, perform a documented migration rehearsal using a sanitized copy and Koha-supported migration procedures.
- The new Koha instance must use its own MariaDB database. ULMS-only application data will use a separate PostgreSQL database. Do not combine Koha's MariaDB tables with the ULMS PostgreSQL schema.
- All production credentials, student/patron personal information, and backups must be handled under university-approved access, security, and retention policies.

### 1.4 Main goals

- Give staff a single dashboard with access limited by role and department.
- Support the five departments with configurable policies and reporting.
- Integrate the ULMS with the new, independently deployed Koha instance through Koha's supported REST API.
- Make the new Koha instance the authoritative source for bibliographic, item, patron, and circulation records managed by the library system.
- Store ULMS-only information in a standalone PostgreSQL database managed by the university.
- Provide a secure path to introduce student self-service accounts.
- Improve reporting, notifications, auditability, and operational visibility.
- Make the system maintainable, testable, accessible, and suitable for university deployment.

### 1.5 Success criteria

The project is successful when:

- Authorized staff can sign in and see only the departments and actions allowed by their permissions.
- Staff can search the Koha catalog and view current item availability without the ULMS becoming a second catalog database.
- Any supported circulation or patron action is executed through Koha's documented API and the outcome is confirmed before the UI reports success.
- The five departments can be configured and reported on independently, with approved cross-department views for central administrators.
- ULMS-only data is stored in standalone PostgreSQL with versioned migrations, validation, audit history, and tested backup/restore procedures.
- A student pilot can authenticate and access approved self-service features without duplicating patron records.
- Critical workflows pass automated tests and user acceptance testing (UAT).
- Monitoring, logging, backup, restore, security, and operational documentation are in place before production launch.

---

## 2. Scope and implementation principles

### 2.1 Scope labels

Use these labels throughout implementation:

- **MVP:** Required for the first usable staff pilot.
- **Core follow-up:** Important, but may be released after the MVP once the Koha API capability is verified.
- **Conditional:** Build only if the university approves the workflow and the new Koha setup does not already provide it adequately.
- **Optional / later:** Not required for the first release; do not allow it to delay the MVP.

### 2.2 Architecture principles

1. **The new Koha instance is authoritative for Koha-owned records.** Bibliographic records, item copies, patron records, checkouts, check-ins, holds, fines, acquisitions, and serials must remain in Koha when those functions are already managed there.
2. **Use the Koha REST API.** Do not connect the ULMS application directly to Koha's production MariaDB/MySQL database. Do not write to Koha tables, even for convenience or performance.
3. **Standalone PostgreSQL is the primary database for ULMS-owned data.** It stores ULMS user profiles or identity links, roles, permissions, department configuration, notifications, audit logs, preferences, application settings, inventory-session data, and approved custom workflows. Keep ULMS application data in this PostgreSQL database; do not introduce a second database platform for the same data.
4. **Do not duplicate data without a documented reason.** Any cached Koha data must have an owner, refresh policy, expiry policy, and clear indication that it is a cache rather than the source of truth.
5. **Confirm API capabilities before building workflows.** The exact Koha API endpoints and permissions depend on the new Koha installation version and configuration. Never invent endpoints or assume that an endpoint is enabled.
6. **Prefer modular monolith first.** Use one FastAPI backend organized by domain. Do not introduce microservices unless a measured scaling or operational requirement justifies them.
7. **Security by design.** Enforce authorization on the backend, not only by hiding frontend controls.
8. **Build vertical slices.** Complete a workflow from UI to API to data/integration and tests before starting many disconnected screens.
9. **Use feature flags for incomplete or conditional integrations.** A missing Koha capability must be shown as unavailable, not simulated as a successful production action.
10. **No production changes during development.** Use a Koha test/staging environment, fixtures, and mock responses until explicit approval for production integration testing is given.

### 2.3 Explicit non-goals for the first release

- Accessing, replacing, or modifying the old R230-hosted Koha system.
- Copying the Koha source code into this repository.
- Directly changing Koha's database schema or production data.
- Building a separate bibliographic catalog that competes with Koha.
- Recreating every Koha feature before identifying which features are already configured and used.
- Enabling all student accounts without approved identity matching and access policies.
- Implementing online payments, biometric attendance, RFID/self-check hardware, SMS gateways, or external student-information-system integration before their requirements, costs, credentials, and approvals are known.
- Guaranteeing high availability from a single server. High availability requires separate infrastructure and operational design.

---

## 3. Technical architecture

### 3.0 Database platform decision — standalone PostgreSQL (**required**)

The ULMS will use **standalone PostgreSQL** as its application database. PostgreSQL will be installed and operated directly by the university in a dedicated Proxmox VM. Koha will continue to use its own supported MariaDB database; PostgreSQL is not a replacement for Koha's database.

- Deploy a supported PostgreSQL major release and keep it on the latest approved minor/security release. As of 15 November 2026, PostgreSQL 18.7 is the current supported stable minor release; re-check the official release page before deployment and use the latest patched PostgreSQL 18.x minor release. Re-check the PostgreSQL release page at procurement and deployment time.
- Run PostgreSQL in a dedicated Proxmox VM or separately managed container/host service. For production, a VM provides clear resource limits, independent OS lifecycle, and a simpler recovery boundary. This VM still shares the same physical server failure domain.
- Use a dedicated database named `libraryhub` and a dedicated application schema (for example, `app`) or use `public` consistently if that is the approved convention. Do not use the PostgreSQL superuser for runtime application traffic.
- FastAPI is the normal application data-access boundary. Use SQLAlchemy 2.x and Psycopg 3. The Next.js browser must never connect directly to PostgreSQL.
- Use Alembic as the single authoritative schema-migration tool for ULMS tables. Do not mix Alembic with untracked manual production schema changes.
- Create separate least-privilege PostgreSQL roles for runtime access, migrations, read-only reporting (if needed), and backup/maintenance operations. Keep credentials in server-side secrets, rotate them under an approved process, and never place them in frontend variables or source control.
- Enable TLS for database connections when traffic crosses VM boundaries. Allow connections only from the ULMS backend, approved administrative hosts, and backup/monitoring systems that need them. Do not publish PostgreSQL port 5432 to the public internet.
- Configure connection pooling deliberately. Begin with SQLAlchemy's bounded pool. Introduce PgBouncer only if measured connection counts or connection churn justify a separate pooler.
- Use PostgreSQL backups that are independent of the production host. Define encrypted base backups plus WAL archiving/PITR only if the team can operate and regularly test the required backup chain. At minimum, schedule verified `pg_dump`/`pg_basebackup` strategy appropriate to data volume and recovery objectives.
- Use database extensions only where required and supported by the chosen PostgreSQL release. Record extensions and versions in deployment documentation.
- Apply row-level security only if the team can reliably set per-request user/department context and ensure the runtime role does not bypass the policies. FastAPI service-layer authorization remains mandatory regardless of RLS.
- Add external university SSO, private object storage, FastAPI WebSockets, or Server-Sent Events only when requirements justify them. Use FastAPI for application APIs and keep optional infrastructure out of the MVP until needed.

Official reference: https://www.postgresql.org/support/versioning/ and https://www.postgresql.org/about/news/

### 3.1 High-level architecture

```text
Staff / Students / Library Administrators
                  |
                  v
        Next.js Web Application
                  |
             HTTPS / API
                  |
                  v
             FastAPI Backend
        __________|______________
       |            |             |
       v            v             v
Standalone       Redis       Koha API Adapter
PostgreSQL       cache/       (HTTPX client)
ULMS data        queue              |
       |                           v
       |                    New Koha Instance
       |                           |
       |                      Koha MariaDB
       |                           |
       |                    Koha search engine
       |                   (per supported release)
       |
       +-- SQLAlchemy 2.x + Alembic

Celery worker (when needed) <---- Redis broker
WebSockets/SSE (when needed) ----> FastAPI realtime endpoints
Monitoring: Prometheus + Grafana + OpenTelemetry + structured logs
Deployment: Proxmox VE + separate VMs; Docker Compose for ULMS services where appropriate
```

**Database separation is mandatory:** Koha uses the database engine and schema supplied by its supported installation (MariaDB in the planned deployment); ULMS uses PostgreSQL. Neither system writes directly into the other's database. ULMS communicates with Koha using the Koha REST API.

### 3.2 Frontend technology stack

Keep the following as the agreed baseline. Do not remove a library just because it is not used in the first screen; install dependencies when their first real use is implemented.

| Category | Technology | Intended use |
|---|---|---|
| Framework | Next.js 16 App Router (use the latest patched stable 16.x release; verify at project start) | Routing, layouts, server/client rendering, application shell |
| UI library | React | Component-based UI |
| Language | TypeScript | Type safety across components and API contracts |
| Styling | Tailwind CSS | Utility-first styling and responsive layouts |
| UI components | shadcn/ui | Accessible, reusable interface components |
| Charts | Recharts | Dashboard and analytics charts |
| Tables | TanStack Table | Sorting, filtering, pagination, column visibility, row selection |
| Server/API state | TanStack Query | Fetching, caching, invalidation, mutations, retry policy |
| Forms | React Hook Form | Form state and field management |
| Validation | Zod | Client-side validation and compatible shared schemas where appropriate |
| Icons | Lucide React | Consistent icons |
| Date utilities | date-fns | Parsing, formatting, and date calculations |
| Timezone utilities | date-fns-tz | Use when timezone conversion is required |
| Notifications | Sonner | Toast feedback for completed/failed actions |
| Themes | next-themes | Light/dark theme support if enabled by design |
| Client global state | Zustand | Use only for genuinely shared client state; do not duplicate server state managed by TanStack Query |
| Virtualization | @tanstack/react-virtual | Large lists/tables when profiling shows it is needed |
| Command palette | cmdk | Searchable navigation and quick actions |
| File upload | react-dropzone | Drag-and-drop upload where appropriate |

Frontend rules:

- Use TanStack Query for server state. Do not use Zustand as a second API cache.
- Use React Hook Form with Zod for validated forms.
- Use TanStack Table for data-heavy tables; add virtualization only when needed.
- Use `date-fns` for display and calculation. Store timestamps consistently in UTC where appropriate and render in the configured institutional/user timezone.
- Use accessible labels, keyboard support, focus states, and responsive layouts.
- Do not expose Koha credentials, API tokens, or privileged endpoints in browser code.
- Keep application data reads/writes behind the FastAPI backend; the browser must not call Koha or PostgreSQL directly for ULMS business data.
- Do not add client-side database SDKs. PostgreSQL connections are server-side through FastAPI.

### 3.3 Backend technology stack

| Category | Technology | Intended use |
|---|---|---|
| Language | Python 3.14.x (select the latest patched 3.14 release compatible with the chosen dependencies) | Backend language |
| API framework | FastAPI (pin a current stable release compatible with Python 3.14) | REST API and optional WebSocket endpoints |
| ORM | SQLAlchemy 2.x | PostgreSQL data access |
| PostgreSQL driver | Psycopg 3 | SQLAlchemy connection driver for PostgreSQL |
| Migrations | Alembic | Versioned application database migrations |
| Validation | Pydantic 2.x | API request/response schemas and settings |
| HTTP client | HTTPX | Koha REST API communication |
| Database | Standalone PostgreSQL 18.x (or latest supported stable major approved at deployment) | Primary persistent database for ULMS-owned data |
| Cache / broker | Redis | Cache, rate limits, temporary coordination, task broker, Pub/Sub where needed |
| Background tasks | Celery | Reports, scheduled tasks, bulk notifications, imports, and other long-running jobs |
| Testing | Pytest | Unit, integration, API, and service tests |
| Lint / formatting | Ruff | Python linting and formatting |

Backend rules:

- Use a modular monolith organized by domain.
- Use dependency injection for database sessions, authorization, and Koha API client access.
- Set explicit timeouts and safe retry rules for external Koha API calls.
- Retry only operations that are safe to retry. Do not blindly retry circulation writes because duplicate transactions could occur.
- Use idempotency protections for retriable write operations where the target API supports them; otherwise use reconciliation and request tracking.
- Validate all input with Pydantic and enforce authorization in service/API layers.
- Use SQLAlchemy transactions and Alembic migrations against standalone PostgreSQL for ULMS schema changes.
- Connect using dedicated least-privilege runtime and migration roles. Use direct private-network PostgreSQL connections initially; introduce PgBouncer only after measuring the connection workload.
- Keep all ULMS tables in the dedicated `libraryhub` database and approved application schema. Never use the PostgreSQL superuser for normal application traffic.
- Apply department-aware authorization in FastAPI. Add PostgreSQL Row Level Security (RLS) only as defense-in-depth where transaction-scoped user/department context can be set safely and tested. Do not claim RLS protection if the runtime role bypasses it.
- Alembic is the sole schema migration authority for the ULMS schema. Avoid untracked manual production DDL or competing migration histories.

### 3.4 Data and infrastructure stack

| Technology | Purpose | Priority |
|---|---|---|
| PostgreSQL 18.x | Primary ULMS application database | MVP / required |
| MariaDB (Koha-supported version) | Database for the new Koha installation only | Koha deployment / required |
| Koha search engine (Elasticsearch or Zebra, as supported/configured for the selected release) | Koha catalog search indexing | Koha deployment / required |
| Redis | Cache, rate limiting, temporary coordination, task broker | Add when justified; recommended before bulk jobs/realtime scale |
| Celery | Asynchronous and scheduled background jobs | Core follow-up |
| FastAPI WebSockets | Live notifications and operational dashboard updates | Core follow-up |
| Server-Sent Events (SSE) | Alternative for one-way live updates | Optional; choose only if simpler than WebSockets |
| Docker / Docker Compose | Reproducible ULMS services | MVP |
| Nginx | Reverse proxy and TLS termination | MVP deployment |
| Proxmox VE | Hypervisor and VM isolation | Recommended for one-host multi-system deployment |
| Debian (Koha-compatible supported release) | Koha operating system / package base | Koha deployment |
| Ubuntu Server LTS | Host or application VM OS, where selected | Deployment |
| Prometheus | Metrics collection | Production readiness |
| Grafana | Dashboards and alert visualization | Production readiness |
| OpenTelemetry | Traces and instrumentation across API/integrations/jobs | Production readiness |
| MinIO or approved NAS/object storage | Document and attachment storage | Conditional |
| k6 | Load and capacity testing | Production readiness |

PostgreSQL is the durable database of record for ULMS-owned records. Koha's MariaDB database remains the durable database of record for Koha-owned library records and transactions. Redis is not a database of record: durable notifications, audit logs, job results, and workflow state must be persisted in PostgreSQL. Redis Pub/Sub is not a durable event log.

### 3.5 Repository structure

```text
libraryhub/
│
├── apps/web/                    # Next.js (see also apps/api)
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   ├── catalog/
│   │   ├── student/
│   │   └── api/                 # Only if Next.js server routes/BFF are intentionally used
│   ├── components/
│   │   ├── ui/
│   │   ├── charts/
│   │   ├── tables/
│   │   ├── forms/
│   │   └── layout/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── types/
│   ├── public/
│   └── tests/
│
├── apps/api/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   └── dependencies/
│   │   ├── core/                # Settings, security, logging, exceptions
│   │   ├── models/              # SQLAlchemy models for ULMS-owned data
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── services/            # Domain business logic
│   │   ├── repositories/        # Optional persistence/query layer
│   │   ├── integrations/
│   │   │   └── koha/
│   │   │       ├── __init__.py
│   │   │       ├── client.py
│   │   │       ├── authentication.py
│   │   │       ├── capabilities.py
│   │   │       ├── bibliographic.py
│   │   │       ├── items.py
│   │   │       ├── patrons.py
│   │   │       ├── circulation.py
│   │   │       ├── holds.py
│   │   │       ├── libraries.py
│   │   │       ├── mapping.py
│   │   │       └── exceptions.py
│   │   ├── workers/             # Celery tasks when introduced
│   │   ├── realtime/            # WebSocket/SSE handlers when introduced
│   │   ├── database/
│   │   └── main.py
│   ├── alembic/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── api/
│   │   └── contract/
│   └── pyproject.toml
│
├── infrastructure/
│   ├── docker/                 # ULMS application stack
│   ├── postgres/               # PostgreSQL VM/container configuration and tuning notes
│   ├── koha/                   # Koha installation notes/configuration (no database dumps or secrets)
│   ├── nginx/                  # Reverse proxy and TLS configuration
│   ├── monitoring/
│   │   ├── prometheus/
│   │   └── grafana/
│   ├── backups/
│   └── scripts/
│
├── docs/
│   ├── architecture.md
│   ├── koha-integration.md
│   ├── data-ownership.md
│   ├── security.md
│   ├── deployment.md
│   ├── operations-runbook.md
│   └── decisions/
│
├── docker-compose.yml          # Local data services (Postgres/Redis); app images under infrastructure/docker
├── package.json                # npm workspaces (apps/*)
├── .env.example
├── .gitignore
├── plan/
└── README.md
```

Do not create empty files and large placeholder modules solely to match this tree. Add directories as features are implemented. Keep database passwords, Koha credentials, signing keys, database files, backup archives, and storage volumes out of Git.

---

## 4. System boundaries and data ownership

### 4.1 Source-of-truth matrix

| Data / workflow | System of record | ULMS responsibility |
|---|---|---|
| Bibliographic records (books, titles, authors, subjects) | New Koha installation | Search and display through API; editing only through confirmed supported API permissions |
| Item/copy records and barcodes | New Koha installation | Display, lookup, and supported item workflows through API |
| Patron/library borrower records | New Koha installation unless the university approves an authoritative SIS/identity source | Link authenticated user to Koha patron; do not create conflicting duplicate patron records |
| Checkouts, check-ins, renewals | New Koha installation | Provide staff UI that calls supported Koha API operations |
| Holds/reservations | New Koha installation, if enabled | Display/manage through supported API; otherwise mark unavailable or design an approved alternative |
| Fines/fees | New Koha installation if Koha owns the charge | Display and perform only explicitly supported/approved actions; payment integration is conditional |
| Acquisitions and serials | New Koha installation if configured | Integrate with Koha or build a separate approved workflow only after process review |
| ULMS staff accounts | University SSO if available; otherwise ULMS PostgreSQL | Authentication identity and account lifecycle |
| Roles and permissions | ULMS PostgreSQL or university identity platform | RBAC and department scope |
| Department configuration and Koha branch mapping | ULMS PostgreSQL | Maintain configurable mapping and policies |
| Notifications and delivery logs | ULMS PostgreSQL | Durable notices and status history |
| Audit logs | ULMS PostgreSQL, append-only by application policy | Record sensitive actions and access |
| Dashboard preferences and saved report settings | ULMS PostgreSQL | Persist user preferences and report definitions |
| Analytics | Derived from Koha REST API and ULMS data | Clearly label source, freshness, and any incomplete data |
| Uploaded documents/attachments | Approved file storage | Store metadata and secure file references in PostgreSQL |
| Historical data from old R230 Koha | Not available to the new project by default | Import only from a university-authorized export/backup, using a documented rehearsal and reconciliation |

### 4.2 Koha integration rules

### 4.2 Koha integration rules

- Create a Koha API capability matrix during discovery. Record the new Koha installation version, API specification/documentation location, enabled endpoints, supported HTTP methods, authentication mechanism, required permissions, pagination, rate limits, and response fields.
- Use the actual API documentation exposed by the installed instance and official documentation matching that version. Do not assume latest documentation exactly matches the installed system.
- Keep Koha URLs and credentials in backend environment secrets. Never commit secrets or return them to frontend clients.
- Implement a centralized HTTPX client with connection pooling, timeouts, safe retry handling, error normalization, request IDs, and structured logs that do not expose credentials or patron personal data.
- Map Koha responses into internal Pydantic schemas. Do not spread raw Koha response shapes throughout frontend components.
- Add a capability service/registry so screens can tell whether a function is supported and enabled. Unsupported actions must be disabled with an explanatory message.
- Start with read-only API calls. Enable write operations one at a time after API permission checks and tests.
- Use a Koha test/staging instance or approved test data for integration tests. Provide mock adapters for local development.
- If the new Koha installation version lacks a needed API operation, document the gap and present options to the university administrator. Do not solve it by writing directly to MariaDB.
- If webhooks are not available, use scheduled incremental polling where justified. Avoid frequent full-catalog synchronization.
- Store external IDs and minimal linkage metadata in ULMS PostgreSQL only when required. Avoid copying complete patron or bibliographic records.

### 4.3 Five-department configuration

Create a configurable department record with fields such as:

- Department ID and display name
- Active/inactive status
- Configured Koha library/branch code (nullable until confirmed)
- Department contact details and operating hours
- Local circulation-policy reference or display settings, where allowed
- Branding/logo configuration if approved
- Allowed services and feature flags
- Timezone (default to the university-approved timezone)

Do not hardcode branch IDs in application logic. A super administrator should configure and validate each department-to-Koha-branch mapping.

---

## 5. Users, roles, and permissions

### 5.1 Initial user groups

1. **Super Administrator** — system-wide access, configuration, integrations, audit, and all departments.
2. **Library Administrator** — central library management, department oversight, reports, and staff administration within granted scope.
3. **Department Head / Librarian-in-Charge** — management and reports for assigned department(s), staff oversight if permitted.
4. **Librarian / Library Staff** — circulation, catalog lookup, patron lookup, inventory, and daily operations allowed for assigned department(s).
5. **Student / Patron** — self-service access to their own account and permitted library features only. Activate after identity and patron-link approval.
6. **Auditor / Read-only Viewer** — approved read-only dashboards, reports, and audit views.

### 5.2 Permission design

Use role-based access control (RBAC) plus department scope. Permissions should be fine-grained, such as:

- `dashboard.view`
- `departments.view`, `departments.manage`
- `staff.view`, `staff.manage`
- `catalog.search`, `catalog.view`, `catalog.create`, `catalog.update`
- `patrons.search`, `patrons.view`, `patrons.create`, `patrons.update`
- `circulation.checkout`, `circulation.checkin`, `circulation.renew`
- `holds.view`, `holds.manage`
- `inventory.view`, `inventory.manage`
- `reports.view`, `reports.export`
- `notifications.send`, `notifications.manage`
- `settings.manage`
- `audit.view`

Every protected API endpoint must verify both permission and department scope. A user must not gain access to another department by changing a URL, request body, query parameter, or frontend state.

### 5.3 Authentication

- Preferred: integrate with an existing university identity provider through OpenID Connect (OIDC), if one is available and approved.
- Alternative: ULMS-managed accounts with secure password hashing (Argon2id), email/username verification where applicable, reset flows, and MFA policy as required by the university.
- Do not store plaintext passwords.
- Use secure, HttpOnly, SameSite cookies or another documented secure session strategy. Define CSRF protection where cookie-based authentication is used.
- Define session expiry, idle timeout, logout, password reset, account lockout/rate limiting, and staff account deactivation procedures.
- Students must be linked to the correct Koha patron using an approved unique identifier and a reviewed matching process. Do not silently match by name alone.

---

## 6. Functional modules and features

The modules below describe the target product. The MVP subset and dependencies are identified. Koha-dependent functions must be enabled only after the capability matrix confirms support.

### Module 1 — Authentication, accounts, and access control (**MVP**)

**Features**

- Staff login/logout.
- OIDC/SSO integration when available; otherwise secure local authentication.
- Password reset and account recovery for local accounts.
- Session management, idle timeout, and account deactivation.
- User profile and password/security settings.
- RBAC with department-scoped permissions.
- Staff account creation, invitation, activation, suspension, and role assignment.
- Optional MFA according to university policy.
- Audit events for login success/failure, logout, account changes, role changes, and permission denials.

**Acceptance criteria**

- A staff user can only access assigned departments and actions.
- A disabled account cannot sign in or use an existing session after revocation is applied.
- Permission checks are enforced by FastAPI, not only the frontend.
- Passwords, tokens, and secrets never appear in logs.

### Module 2 — Department and library branch management (**MVP**)

**Features**

- Configure the five departments.
- Map each department to a verified Koha branch/library code.
- Configure operating hours, contact information, active status, and feature flags.
- Assign staff to one or multiple departments.
- Configure department-level dashboard filters and report scope.
- Display a clear department context selector for users with multi-department access.
- Prevent duplicate branch mappings unless explicitly approved by the system design.

**Acceptance criteria**

- All five departments can be configured without code changes.
- A user switching department context sees only data/actions allowed for that department.
- An unverified or missing Koha branch mapping is visibly marked and blocks branch-dependent write actions.

### Module 3 — Central dashboard and operational overview (**MVP**)

**Features**

- System-wide view for super administrators.
- Department-specific dashboard for department staff.
- Catalog search shortcut.
- Summary cards for available metrics that can be reliably sourced: item count, active loans, overdue loans, holds, registered patrons, and circulation activity, depending on Koha API support.
- Today's circulation summary and recent activity.
- Department comparison for authorized central users.
- API/integration status indicator (connected, degraded, unavailable, last successful check).
- Date range and department filters.
- Clear metric source and last-updated time.
- Loading, empty, partial-data, and error states.

**Rules**

- Do not use fabricated or hardcoded demo metrics in production.
- Do not label cached or delayed information as live.
- Use server-side aggregation or background jobs for expensive analytics instead of making many requests from the browser.

### Module 4 — Catalog search and discovery / OPAC experience (**MVP**)

**Features**

- Search by title, author, subject, ISBN, barcode/item number, and keywords as supported by Koha.
- Search filters such as department/library, material type, availability, publication year, and subject where API data supports them.
- Pagination and sorting.
- Bibliographic detail page: title, author, edition, publication details, subjects, description, and cover image if available and licensed/served appropriately.
- Item/copy details: barcode should be restricted according to staff/student privacy policy; home library, current location, and availability as permitted.
- Availability display with status and last-checked time.
- Responsive results page and accessible search controls.
- Recent searches and saved searches as ULMS preferences, if approved.
- Link to the new Koha OPAC as a fallback during transition.

**Acceptance criteria**

- Search results originate from Koha or clearly identified approved index/cache.
- Search supports pagination and does not download the entire catalog.
- Availability is not presented as guaranteed after the displayed check time.
- Search failures show a useful error and preserve the user's query.

### Module 5 — Bibliographic cataloguing interface (**Conditional / Koha-dependent**)

**Features, only if approved and supported**

- Staff bibliographic record view and editing workflow.
- MARC-related fields and validation only to the extent the Koha API supports them.
- Item/copy creation and editing through Koha API where available.
- Duplicate-record warnings where supported by Koha search or an approved workflow.
- Record change history/audit information where accessible.

**Rules**

- Koha remains the record owner.
- Do not create a parallel bibliographic database in PostgreSQL.
- If the required write endpoints are absent or unsuitable, keep cataloguing in Koha's native staff interface and provide a deep link from ULMS.

### Module 6 — Patron and student account integration (**MVP for staff lookup; student portal later**)

**Staff features**

- Search patron by approved identifier, name, card number, or other Koha-supported fields.
- View permitted patron details and account status.
- View current loans, overdue items, and holds when exposed by Koha API and permitted by role.
- Create/update patron records only through confirmed Koha API support and approved staff permissions.
- Display incomplete or ambiguous identity matches for manual review; never silently merge patrons.

**Student features (pilot after approval)**

- Student registration/sign-in through OIDC/SSO or approved account provisioning.
- Link the student identity to a new Koha patron.
- View own profile and library status.
- View own current loans, due dates, and holds.
- Update only approved contact/preferences fields, subject to Koha API support.
- Request account-link correction through an administrator workflow.

**Acceptance criteria**

- Students can only see their own patron information.
- Matching uses an approved stable identifier, not name-only matching.
- No duplicate patron record is created when a student account is linked.
- Sensitive patron fields are minimized and masked according to policy.

### Module 7 — Circulation: checkout, check-in, renewals (**Core follow-up; Koha-dependent**)

**Features**

- Staff checkout using patron lookup and item barcode scanning/entry.
- Check-in/return using item barcode.
- Renewal of eligible loans.
- Display due date and policy information returned by Koha.
- Display blocks, warnings, overdue status, and actionable API errors.
- Confirmation dialogs for irreversible or high-impact operations.
- Transaction result screen with Koha reference/status.
- Receipt/print view if approved.
- Optional barcode scanner support through keyboard-wedge scanners.

**Rules**

- Koha is the authority for checkout/check-in/renewal.
- Do not show success until Koha confirms the action.
- Protect against double-submission and duplicate requests.
- Do not locally invent due dates or circulation rules; use Koha results.
- Ensure staff permissions and department/branch mapping are enforced.

### Module 8 — Holds, reservations, and queue management (**Core follow-up; Koha-dependent**)

**Features**

- View a patron's active and past holds as permitted.
- Place/cancel holds only if enabled and supported.
- Show hold queue/status and pickup library if exposed by Koha.
- Display pickup deadlines and notifications from authoritative Koha data.
- Student self-service hold requests after pilot approval.

**Rules**

- Koha remains authoritative for hold queues and statuses.
- Do not build a second queue in PostgreSQL unless formally approved as a separate workflow.

### Module 9 — Fines, fees, and payments (**Conditional**)

**Features**

- View fines/charges from Koha when available.
- Show fee details, status, and transaction references.
- Payment recording or online payment integration only after finance office approval and confirmed Koha reconciliation process.
- Printable receipt and reconciliation reports if approved.

**Rules**

- Do not store card data or payment credentials.
- Do not mark a Koha fine as paid until the authoritative payment/reconciliation workflow is confirmed.
- No payment gateway is selected by this plan. Payment provider, fees, settlement, refunds, and accounting rules require separate approval.

### Module 10 — Acquisitions and collection development (**Conditional / Koha-dependent**)

**Features to evaluate**

- Purchase requests and reading recommendations.
- Request review and approval workflow.
- Supplier/vendor records, quotations, purchase orders, and receiving.
- Budget allocation and expenditure reports.
- Link received materials to Koha bibliographic/item records.

**Decision gate**

First inspect whether the university uses Koha Acquisitions. If it does, integrate with Koha or keep those tasks in Koha. Build a ULMS acquisitions module only when the library's actual procurement process requires it and data ownership is formally documented.

### Module 11 — Serials and periodicals (**Conditional / Koha-dependent**)

**Features to evaluate**

- Journal/newspaper subscription records.
- Expected issue tracking and receipt.
- Missing issue/claim workflow.
- Renewal reminders and subscription reports.

**Decision gate**

Check the new Koha serials configuration and API coverage before implementing a separate module.

### Module 12 — Inventory and stocktaking (**Core follow-up; Koha-dependent**)

**Features**

- Plan an inventory/stocktake session by department/collection/location.
- Scan or enter barcodes using supported scanning devices.
- Compare scanned items with expected Koha item records.
- Identify not found, misplaced, unexpected, damaged, or withdrawn items.
- Display last-seen/scan timestamp and operator.
- Export exception lists for review.
- Submit approved inventory adjustments through Koha only if supported and authorized.
- Preserve an ULMS audit trail of scan sessions and staff actions.

**Rules**

- Scanning/session records may belong in PostgreSQL; actual item status and item record changes remain in Koha.
- Do not automatically mark items lost, withdrawn, or deleted based solely on a missing scan.

### Module 13 — Notifications and communication (**MVP: in-app; Core follow-up: channels**)

**Features**

- Durable in-app notifications stored in PostgreSQL.
- Notification inbox, unread/read state, categories, and preferences.
- Trigger notifications for approved events: due-date reminders, overdue notices, hold availability, account notices, service announcements, and system alerts.
- Department-wide or selected-audience announcements for authorized staff.
- Email/SMS/push channel integration only after provider, consent, costs, templates, and data handling are approved.
- Delivery status and failure logs.
- Scheduled and bulk notification jobs through Celery where required.
- Template management with preview and approval.

**Rules**

- Store notifications durably in PostgreSQL; Redis may deliver real-time events but is not the notification record store.
- Avoid exposing patron-sensitive details in notification previews, logs, or lock-screen messages.
- Respect opt-in/opt-out and university communication policy.

### Module 14 — Reports, analytics, and exports (**MVP: basic; Core follow-up: advanced**)

**Reports to plan**

- Daily/weekly/monthly circulation activity.
- Active loans, overdue loans, returns, and renewals.
- Collection/item counts by department, material type, subject, and location when data permits.
- Patron counts and activity, with privacy-aware aggregation.
- Holds and fulfillment statistics.
- Inventory/stocktake exceptions.
- Acquisitions and spending, only if those workflows are implemented and data is reliable.
- Department comparison for authorized central administrators.
- System integration health and API error trends.

**Features**

- Date range, department, category, and status filters.
- Charts and summary cards with Recharts.
- Server-side pagination for detailed report tables.
- CSV and Excel export; PDF export if the university requires it.
- Saved report filters/templates.
- Scheduled report generation and email distribution as a later capability.
- Every report must show its source, generation time, and data freshness.

**Rules**

- Do not fabricate missing values. Show unavailable/incomplete data explicitly.
- Restrict small-group or personally identifiable reports to approved roles.
- Use background jobs for large exports.

### Module 15 — Student self-service portal (**Core follow-up / pilot after approval**)

**Features**

- Student sign-in using the approved identity provider or account process.
- Personal library account overview.
- Search the catalog and check item availability.
- View own loans, due dates, eligible renewals, holds, and fines only when the Koha API supports them and the university permits them.
- Request renewals/holds only through verified Koha operations.
- View notifications and library announcements.
- Update approved profile preferences.
- Mobile-responsive design and accessible user experience.

**Rollout**

Start with a limited pilot group. Validate identity-to-patron matching, privacy controls, load, support procedures, and communications before enabling the entire student population.

### Module 16 — Library announcements, operating hours, and service information (**MVP/basic; expand later**)

**Features**

- Department-specific operating hours and closure notices.
- Holiday and special schedule notices.
- Library rules, borrowing policies, service descriptions, and contact information.
- Central announcements with department targeting.
- Optional public-facing information pages that do not require login.

### Module 17 — Document and attachment management (**Optional / conditional**)

**Features**

- Upload approved forms, policies, reports, and supporting files.
- Folder/category metadata, permissions, file versioning, retention rules, and download audit.
- Malware scanning and file type/size restrictions.
- OCR/search only if required and approved.
- Store files in approved NAS/object storage or another managed file store; store metadata and access controls in PostgreSQL.

Do not use the ULMS as a general-purpose document repository without retention, privacy, backup, and storage requirements.

### Module 18 — Library facilities, rooms, and equipment booking (**Optional / requires process approval**)

**Features to evaluate**

- Room/study-space inventory by department.
- Availability calendar and booking requests.
- Approval, cancellation, check-in, no-show, and usage reports.
- Equipment borrowing such as laptops or projectors, if not already handled in another university system.

Do not assume all five departments offer the same facilities or policies.

### Module 19 — Visitor/attendance statistics (**Optional / requires policy approval**)

**Features to evaluate**

- Manual or approved electronic visitor count.
- Department/day/time statistics.
- Anonymous counts by default.
- If identifiable attendance is required, obtain privacy/legal approval, retention rules, and access restrictions before implementation.

Do not introduce biometrics or unnecessary personal tracking.

### Module 20 — Administration, audit, and system configuration (**MVP**)

**Features**

- Manage roles, permissions, staff, and department mappings.
- Configure integration settings without exposing secrets.
- View Koha connectivity and capability status.
- Manage feature flags and approved system settings.
- View security and business audit events.
- Search logs by correlation/request ID where safe.
- Configure notification templates and department service information.
- Manage maintenance mode and read-only/degraded integration mode if needed.

### Module 21 — Data import/export and migration tools (**Conditional**)

**Features**

- Import only approved ULMS-owned datasets, such as department configuration or staff mappings.
- Validate templates, preview records, report row-level errors, and require confirmation before committing.
- Export ULMS-owned data in approved formats.
- Do not bulk-copy the full Koha catalog or patron database into PostgreSQL.
- Any migration from a previous custom system requires source mapping, data cleansing, approval, test migration, reconciliation, and rollback plan.

### Module 22 — Operational health and observability (**Production readiness**)

**Features**

- API health and readiness endpoints.
- Koha API availability, latency, timeout, and error-rate metrics.
- PostgreSQL connection and query performance metrics.
- Redis and Celery queue health if deployed.
- Background job status, retries, and failures.
- Structured application logs with correlation IDs.
- Prometheus metrics and Grafana dashboards.
- OpenTelemetry traces for API requests, Koha calls, and background jobs.
- Alerts for service down, sustained API failure, queue backlog, disk usage, backup failure, and resource exhaustion.

Do not expose metrics endpoints publicly without access restrictions.

---

## 7. Important workflows

### 7.1 Staff login and department selection

1. Staff member signs in through SSO or the approved local authentication flow.
2. FastAPI validates identity and loads roles/department assignments.
3. The frontend displays only permitted departments.
4. Staff selects an active department context if they have more than one.
5. Every subsequent API request is authorized against the user's role and department scope.
6. A department change is recorded where required for sensitive workflows.

### 7.2 Catalog search

1. User enters search criteria in the Next.js interface.
2. TanStack Query calls the FastAPI catalog endpoint.
3. FastAPI validates input and checks department access/filter rules.
4. The Koha adapter calls the verified Koha API endpoint.
5. The adapter maps the response into ULMS schemas.
6. The frontend renders results, pagination, availability, and last-checked time.
7. On Koha failure, the UI reports that availability could not be confirmed; it must not show stale data as current.

### 7.3 Checkout / check-in

1. Staff opens the circulation screen and selects the correct department.
2. Staff scans/enters patron and item barcode.
3. FastAPI checks permission and branch mapping.
4. FastAPI calls the supported Koha operation with a correlation/request ID.
5. Koha response is validated and mapped.
6. The ULMS records an audit event containing the operator, department, action, timestamp, and safe reference details.
7. The UI displays success only after Koha confirms the transaction; otherwise it displays the error and recovery guidance.

### 7.4 Student onboarding

1. University approves the identity provider and unique student identifier.
2. ULMS authenticates the student through the approved identity source.
3. A controlled matching process locates the corresponding Koha patron.
4. Exact/ambiguous/no-match cases are handled explicitly.
5. An authorized librarian resolves mismatches; no automatic duplicate patron is created.
6. Student self-service is enabled for a pilot group and tested for cross-account data leakage.

### 7.5 Notification workflow

1. A confirmed event occurs or a scheduled job identifies a condition.
2. The backend creates a durable notification record in PostgreSQL.
3. An optional Celery job sends approved external channel messages.
4. Delivery status and failures are recorded.
5. Optional WebSocket delivery updates the active user's UI; reconnecting clients can retrieve unread notifications from PostgreSQL.

---

## 8. API design and backend domains

Organize FastAPI routes by domain. Example route prefixes (final naming may be refined but must be documented consistently):

```text
/api/v1/auth
/api/v1/users
/api/v1/roles
/api/v1/permissions
/api/v1/departments
/api/v1/dashboard
/api/v1/catalog
/api/v1/patrons
/api/v1/circulation
/api/v1/holds
/api/v1/inventory
/api/v1/notifications
/api/v1/announcements
/api/v1/reports
/api/v1/admin
/api/v1/integrations/koha
/api/v1/health
```

Rules:

- Use versioned API routes (`/api/v1`).
- Define response schemas and consistent error envelopes.
- Use pagination for collections and search results.
- Validate sort/filter fields against allowlists; never interpolate raw user input into SQL.
- Document endpoints using FastAPI OpenAPI output.
- Use request/correlation IDs across frontend, backend, Koha calls, and background tasks.
- Return safe user-facing error messages; keep detailed diagnostics in restricted logs.
- Do not expose raw stack traces or internal Koha credentials.

---

## 9. PostgreSQL data model (ULMS-owned data only)

The exact schema must be designed after discovery. The following are candidate ULMS entities, not permission to duplicate Koha records.

### 9.1 Database and schema layout

- Use a standalone PostgreSQL database named `libraryhub` for ULMS-owned data.
- Use a dedicated schema such as `app` or `libraryhub` and set the search path explicitly. Keep application tables out of the default `public` schema if the university prefers strict schema separation.
- Keep Koha's MariaDB database completely separate. The ULMS must never issue SQL against Koha's database.
- Use separate least-privilege runtime, migration, read-only reporting (if required), and backup roles. Credentials are server-side secrets.
- The Next.js browser must not connect directly to PostgreSQL. The supported request path is Next.js -> FastAPI -> PostgreSQL.
- Keep PostgreSQL on a private network. Restrict `pg_hba.conf`, firewall rules, TLS, and network routes to approved backend/admin/backup clients.

### 9.2 Core tables

- `users` — ULMS identity profile or SSO subject mapping; do not duplicate unnecessary student profile information.
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `user_departments`
- `departments`
- `department_koha_mappings`
- `user_preferences`
- `sessions` or session revocation records, depending on chosen authentication design.

### 9.3 Integration tables

- `integration_configs` — non-secret configuration metadata; secrets belong in environment/secret management.
- `integration_status`
- `external_identity_links` — minimal Koha patron identifier linkage where approved.
- `sync_cursors` — polling cursors/checkpoints if synchronization is implemented.
- `integration_request_logs` — safe metadata, outcome, duration, correlation ID; do not store sensitive payloads by default.
- `migration_batches` and `migration_reconciliation` — only if an approved old-Koha export is supplied and a formal migration is authorized.

### 9.4 Operational tables

- `notifications`
- `notification_preferences`
- `notification_deliveries`
- `announcements`
- `announcement_targets`
- `audit_logs`
- `saved_reports`
- `report_jobs`
- `report_exports`
- `inventory_sessions`
- `inventory_scans`
- `uploaded_files` — metadata and storage references only, if file management is approved.
- `system_settings`

### 9.5 Data model rules

- Use UUID or another consistently selected primary-key strategy for ULMS entities. Enable only required PostgreSQL extensions and document them.
- Use foreign keys and appropriate indexes.
- Include `created_at`, `updated_at`, and actor metadata where appropriate.
- Use soft deletion only where there is a documented retention and restore need; do not soft-delete authoritative Koha records locally.
- Apply retention rules to logs and personal data.
- Add database constraints for uniqueness and valid states.
- Store time values consistently; use timezone-aware timestamps.
- Keep Alembic migrations small, reviewable, and reversible when practical. Alembic is the only schema migration authority for the ULMS schema.
- Never store card/payment credentials or plaintext passwords.
- Use PostgreSQL RLS only where tested role and request-context propagation makes it an effective additional control. API-level RBAC and department scoping are always required.

## 10. UX, accessibility, and design requirements

- Use a consistent university-approved design system and branding.
- Build a responsive layout for desktop, tablet, and mobile.
- Provide a sidebar/navigation structure based on role and permissions.
- Display the active department prominently.
- Use clear loading skeletons, empty states, error states, and permission-denied states.
- Confirm sensitive actions such as checkout/check-in, account changes, bulk operations, and configuration updates.
- Use toast notifications for brief feedback and persistent notification records for important events.
- Support keyboard navigation, visible focus, semantic HTML, labels, contrast, and screen-reader-friendly controls.
- Keep tables usable with server-side pagination, filters, column selection, and export where appropriate.
- Do not overload dashboards with decorative charts that have no operational purpose.
- Keep public catalog access distinct from authenticated staff administration.

---

## 11. Security, privacy, and compliance

The university must identify applicable privacy, records-retention, cybersecurity, and institutional policies before production. The following are baseline engineering controls, not a substitute for legal or institutional review.

### 11.1 Required controls

- HTTPS for all deployed environments.
- Secure secret management; `.env` files must not be committed.
- Separate development, testing/staging, and production configurations.
- Least-privilege service accounts for Koha API and database access; separate runtime and migration roles for PostgreSQL.
- Backend authorization on every protected endpoint.
- Department-level data isolation.
- Password hashing with Argon2id if local passwords are used.
- Rate limiting for authentication and sensitive endpoints.
- Input validation and output encoding.
- Secure cookie/session configuration and CSRF protection where applicable.
- CORS allowlist; no wildcard production origins with credentials.
- Protection against SQL injection, XSS, CSRF, IDOR, SSRF, and insecure file uploads.
- Audit logging for sensitive actions, role changes, exports, and access to restricted data.
- Data minimization and masking for student/patron information.
- Dependency scanning and pinned/reviewed dependencies.
- Backup encryption and restricted backup access.
- Documented incident response and credential rotation.

### 11.2 Audit requirements

Record at minimum:

- Authentication success/failure and account changes.
- Role and permission changes.
- Department/branch mapping changes.
- Sensitive patron lookup and export events where required by policy.
- Circulation operations initiated through ULMS (safe Koha transaction references only).
- Inventory adjustments and approvals.
- Notification/bulk-message actions.
- Configuration and integration changes.

Audit logs should be append-only to ordinary application users. Access to audit logs must itself be restricted and logged.

### 11.3 Privacy requirements

- Collect only data necessary for a defined library purpose.
- Do not expose one student's loans, fines, contact information, or patron number to another student.
- Define retention and deletion rules with the university.
- Avoid placing sensitive personal data in URLs, browser logs, analytics events, or notifications.
- Review CSV/Excel/PDF exports for personal data leakage.
- Define who may view patron borrowing history and for what reason.

---

## 12. Performance and reliability requirements

### 12.1 Performance approach

- Measure baseline latency before setting final numeric SLOs.
- Profile frontend loading, backend endpoints, Koha API latency, database queries, and network behavior separately.
- Use pagination, indexed queries, connection pooling, and bounded payloads.
- Cache only safe/read-heavy data with explicit TTL and invalidation rules.
- Do not cache circulation writes or present stale availability as guaranteed.
- Avoid N+1 API calls to Koha; use batching only when supported.
- Use background jobs for large reports, imports, and bulk notifications.
- Apply request timeouts and circuit-breaker/degraded-mode behavior for Koha outages.
- Ensure one slow Koha API request does not block unrelated ULMS functions.

### 12.2 Initial service targets (to validate in load testing)

These are proposed targets, not claims about current system performance:

- Typical ULMS-owned API read: p95 under 500 ms under agreed test load.
- Catalog search: p95 under 3 seconds, excluding documented Koha outage/degradation; tune after baseline measurement.
- Dashboard initial usable render: under 3 seconds on the approved campus network and target devices, subject to measurement.
- No unbounded queries or unpaginated catalog/patron responses.
- All background jobs expose state and failure information.
- Recovery procedures are tested, not merely documented.

### 12.3 Availability and failure behavior

- Show Koha connectivity status and last successful API check.
- If Koha is unavailable, permit only ULMS functions that do not depend on Koha.
- Do not queue circulation operations for later execution unless a formally designed safe workflow exists; doing so can create double transactions or stale decisions.
- Display partial dashboard results with clear source/freshness labels.
- Reconnect live UI channels and reload durable notification state from PostgreSQL.

---

## 13. Testing and quality assurance

### 13.1 Test stack

- Backend: Pytest, HTTPX test client, SQLAlchemy test database using a disposable PostgreSQL test instance or isolated test schema, mocked Koha adapter, and contract tests against approved Koha staging. The test database must never be the production PostgreSQL instance.
- Frontend: Vitest and React Testing Library.
- End-to-end: Playwright.
- Python lint/format: Ruff.
- Frontend lint: ESLint and TypeScript checks.
- Security: dependency audit, secret scanning, static analysis, and manual authorization tests.

### 13.2 Required test categories

1. Unit tests for business rules, schemas, permission checks, mapping, date handling, and error translation.
2. API tests for every protected endpoint, including unauthorized and cross-department requests.
3. Koha adapter tests using recorded/synthetic fixtures and a staging contract test suite.
4. Database migration tests from an empty database and from the previous migration.
5. Frontend component tests for forms, tables, navigation, error states, and loading states.
6. Playwright tests for critical journeys: login, department selection, catalog search, patron lookup, and approved circulation workflow.
7. Regression tests for student-to-patron linkage and prevention of cross-account access.
8. Load tests for catalog search, dashboard, login, and approved circulation operations using non-production data.
9. Backup/restore rehearsal and disaster recovery test.
10. Accessibility checks and keyboard-only navigation review.

### 13.3 Critical end-to-end scenarios

- Staff from Department A cannot access Department B data without permission.
- Student A cannot view Student B's profile, loan history, or notifications.
- Catalog search results and item availability are sourced from Koha and show a freshness indicator.
- Koha timeout displays a failure/degraded state, not fake success.
- Duplicate checkout submission is prevented or safely reconciled.
- An unverified branch mapping blocks branch-dependent operations.
- A notification persists after WebSocket disconnect/reconnect.
- A large report runs as a background job and can be downloaded only by an authorized user.
- A backup can restore the PostgreSQL ULMS schema/data and approved file metadata in a documented isolated test environment.
- The FastAPI runtime connects with a restricted database role; migration credentials are separate and privileged access is not used for ordinary requests.
- No public internet route exposes PostgreSQL, MariaDB, Koha administrative interfaces, or privileged management endpoints.
- Alembic can upgrade a clean PostgreSQL test database and safely report migration status; no duplicate migration authority exists.

---

## 14. Deployment and infrastructure plan

### 14.1 Environment separation

- **Local development:** Docker Compose for Next.js, FastAPI, PostgreSQL, and Redis (when required); Koha may run in a separate test VM or be represented by a mock API. Use synthetic data only.
- **Integration/staging:** Separate PostgreSQL database/VM and a dedicated Koha test instance with synthetic or approved test data. Do not run experimental migrations against production.
- **Production:** University-approved Proxmox host, VLAN/firewall rules, DNS, TLS, UPS, backup target, monitoring, service accounts, change windows, and recovery ownership.

### 14.2 Initial container services and VM layout

Run the major systems in separate VMs on Proxmox VE so that their operating systems, dependencies, resource limits, patching, and recovery can be managed independently. Separate VMs do not create hardware high availability: a physical server failure still stops every VM.

**VM 1 — Koha:** Supported Debian release and Koha packages, Koha staff interface and OPAC, Koha's own MariaDB, and the supported catalog search service (Elasticsearch or Zebra as selected for the new Koha installation release). Use Koha's supported deployment instructions; do not invent a custom stack or put Koha's database in PostgreSQL.

**VM 2 — ULMS application:** Next.js frontend, FastAPI backend, Nginx/reverse proxy, and Celery worker/scheduler when background jobs are introduced. Keep the app modular-monolithic at first.

**VM 3 — PostgreSQL:** Standalone PostgreSQL database for ULMS-owned records, Alembic migrations, connection pooling only if justified, and independent backup/WAL handling. Do not expose database ports publicly.

**VM 4 — supporting services (optional initially):** Redis, Prometheus, Grafana, and OpenTelemetry Collector. These may be combined with the application VM at small scale only if resource monitoring shows adequate headroom; separate them as operations mature.

Suggested starting resource allocations (final values must be tuned with actual benchmarks). On a 128 GB host, begin near the lower end of each range and preserve at least 16 GB for Proxmox and burst headroom; 256 GB is strongly preferred for comfortable separation and future growth:

| VM | vCPU starting allocation | RAM starting allocation | Notes |
|---|---:|---:|---|
| Koha + MariaDB + search | 8 | 32–48 GB | Adjust for catalog size, indexing/search engine, circulation, and concurrent OPAC/staff requests |
| ULMS frontend + FastAPI | 6–8 | 16–24 GB | Add worker resources if report/notification jobs are heavy |
| PostgreSQL | 6–8 | 32–48 GB | Tune shared buffers, work memory, checkpoints, connections, and storage after load tests |
| Redis + monitoring | 4 | 8–16 GB | Increase retention/storage only after sizing metrics and logs |
| Proxmox / reserve | Host reserve | 16–32 GB | Keep memory and CPU headroom; do not allocate all host resources |

The above vCPU values are virtual allocations and may sum above physical core count. Avoid aggressive overcommit for the Koha search/database and PostgreSQL VMs. Use monitoring and k6 load tests to revise allocations.

ULMS application Docker Compose services may include:

- `frontend` — Next.js application.
- `backend` — FastAPI application.
- `nginx` — reverse proxy for ULMS API and frontend routes, or use the host-level reverse proxy.
- `redis` — only when caching, rate limiting, or task brokering is required.
- `worker` and `beat` — Celery services when asynchronous processing is introduced.

Do not bundle the Koha application or Koha MariaDB into the ULMS Compose stack. Manage Koha through its supported Debian package/system service deployment. Do not add a second PostgreSQL instance in the application Compose stack if production PostgreSQL is operated in its dedicated VM. A disposable PostgreSQL container is acceptable for local development and automated tests only.

### 14.3 Dell PowerEdge server procurement specification

**Preferred model: Dell PowerEdge R760xs (2U, dual-socket capable).** It is the preferred fit for this all-in-one physical-host plan because it offers greater drive-bay and I/O expansion than the R660xs. Dell lists support for up to two 5th-generation Xeon Scalable CPUs (up to 28 cores per socket), 16 DDR5 RDIMM slots with up to 1.5 TB memory, and multiple drive-bay configurations including up to 16 × 2.5-inch drives. Exact supported options depend on the chosen chassis, CPU, risers, and backplane.

**Target configuration to request from a Dell-authorized reseller:**

| Component | Target requirement | Notes |
|---|---|---|
| Chassis | PowerEdge R760xs 2U, 16 × 2.5-inch front-bay chassis preferred | Better SSD capacity/expansion for the mixed Koha and ULMS workload |
| CPU | One Intel Xeon Silver 4510 (12 cores / 24 threads) minimum; quote 16-core option separately if budget allows | Start with one CPU; don't pay for a second CPU unless workload/load tests justify it. A second CPU also requires compatible memory population and a matching configuration |
| RAM | **128 GB DDR5 ECC RDIMM minimum at purchase; 256 GB preferred** | Request Dell-supported balanced DIMM population. Confirm actual supported speed and slots with the selected processor and memory population rules |
| Boot | BOSS-N1 with 2 × M.2 NVMe in RAID 1, if supported in the selected configuration | Separate OS/boot from database data drives |
| Data drives | 4 × 960 GB enterprise SSD minimum, RAID 10; 4 × 1.92 TB enterprise SSD preferred | Use enterprise mixed-use/read-intensive class appropriate to vendor sizing; confirm endurance and compatibility |
| RAID | PERC H755 or compatible Dell RAID controller supporting the chosen drive type and RAID 10 | Verify backplane, drive interface, battery/cache protection and licensing/feature compatibility |
| Network | Dual 1GbE onboard plus 10/25GbE NIC if supported by the university switch | A 10/25GbE card provides no benefit without compatible switching, transceivers, cabling, and firewall configuration |
| Power | Dual redundant hot-plug PSUs (1+1), sized for the installed configuration | Verify the correct power rating and local 220–240V support |
| Management | iDRAC Enterprise, TPM 2.0, Secure Boot | Restrict management interfaces to the IT management network |
| Warranty | 3-year ProSupport / next-business-day onsite or better | Confirm support is valid in the Philippines and includes the final configured components |
| Accessories | Rails, cable-management arm, bezel, and required power cords | Verify rack depth, rack compatibility, and power distribution |

**Budget-aware alternative: PowerEdge R660xs.** It is a 1U, dual-socket capable platform with 16 DDR5 RDIMM slots and up to 1.5 TB memory, but its chassis/storage options are smaller (Dell lists up to 10 × 2.5-inch front drives in supported configurations). Choose it if the 1U footprint or lower initial price matters more than storage expansion. For this project, the R760xs is the better long-term chassis.

**Important Philippine price context (checked 15 November 2026):**

- Benson Computers lists an R760xs configuration at approximately **₱421,200**. The listed configuration is only a starting configuration: one Xeon Silver 4510 (12C/24T), 16 GB RDIMM, one 1.2 TB 10K SAS HDD, PERC H755, dual redundant 800W PSUs, iDRAC Enterprise, a 10/25GbE adapter, and 3-year ProSupport. This is **not** the recommended production build because it has only 16 GB RAM and a single mechanical data drive.
- XBSAsia lists an R660xs with one Xeon Silver 4510 at approximately **₱425,000**, likewise with 16 GB RAM and one 1.2 TB SAS HDD.
- The R760xs 16-core Xeon Silver 4514Y / 12 × 3.5-inch configuration is listed by NET-BRIDGE with a displayed discounted price of approximately **₱478,504** (regular listed price approximately ₱562,946). The listing still includes only 16 GB RAM and a single 2 TB drive, so it is not the required production configuration and leaves limited room for the required RAM/SSD upgrades.
- Prices and availability are vendor listings, not a binding quote. A complete R760xs with 128 GB RAM, mirrored boot, four enterprise SSDs, rails, support, UPS, and backup target may exceed ₱550,000. Obtain itemized quotations before procurement.

**Procurement priorities if the ₱550,000 cap is firm:**

1. R760xs chassis with Xeon Silver 4510 (12C/24T), PERC H755, redundant PSUs, iDRAC Enterprise, and 3-year onsite support.
2. Upgrade RAM to at least 128 GB ECC RDIMM with a documented path to 256 GB.
3. Prioritize four enterprise SSDs in RAID 10 for production data. If the quote cannot fit both BOSS-N1 boot mirroring and four data SSDs, ask the reseller for alternatives and do not substitute consumer desktop SSDs without an explicit endurance/support assessment.
4. Include a separate backup NAS or backup server and UPS in the total infrastructure budget. Backups stored only on the same server do not protect against server failure, theft, fire, or major storage failure.
5. Consider 10/25GbE only if the university's network switch and cabling support it. Otherwise, keep the NIC upgrade as a later item.

Do not interpret any retail base listing as a full system cost. Request separate 128 GB and 256 GB configurations, drive endurance specifications, actual RAID layout, full part numbers, support coverage, taxes, shipping, rails, and installation costs.

### 14.4 Backups and recovery

- Back up the new Koha database, Koha configuration, and approved Koha file storage using Koha-compatible procedures. Keep the Koha application/database backup process distinct from ULMS PostgreSQL backups.
- Schedule PostgreSQL backups for ULMS and verify completion. Define encrypted base backups and WAL archiving/PITR if the university has the capacity to operate and test that design.
- Store backups separately from the production host; encrypt and restrict access.
- Define RPO/RTO with the university.
- Back up approved uploaded files and configuration, not secrets in plaintext.
- Test restore procedures regularly in a separate environment.
- Document recovery of Proxmox VMs, Koha/MariaDB, ULMS containers, PostgreSQL data, approved file storage, and secrets/configuration.
- The old R230 Koha system remains outside this project's backup responsibility. The new server cannot back it up without formal authorization, access, and ownership assignment.

## 15. Delivery roadmap and timeline

The timeline assumes timely access to an authorized Koha test environment, a designated university decision-maker, representative librarians for UAT, and approved infrastructure. Work may shift when API limitations or procurement/access delays are discovered.

### Phase 0 — Discovery, requirements, and technical verification (Weeks 1–2)

**Activities**

- Interview representatives from all five departments.
- Map current workflows: catalog search, patron registration, circulation, holds, fines, inventory, reports, acquisitions, serials, and student access.
- Record that the project team has no access to the old R230 Koha system. Do not inspect or export data without formal written authorization.
- Approve a fresh Koha installation as the new library system of record. Confirm Koha's supported operating system, package release, MariaDB version, search engine, REST API configuration, and maintenance owner.
- Select the latest supported stable Koha release at installation time. As of 15 November 2026, Koha 26.05.05 is the latest stable maintenance release found; re-check the official Koha release page before installation.
- Design the new Koha instance: library/branch structure for the five departments, item types, patron categories, circulation rules, fines/fees policy, cataloging standards, staff roles, and OPAC configuration.
- Decide whether an authorized export from the old Koha can be obtained. If not, approve clean start and data-entry/import procedures for newly supplied records.
- Confirm identity provider/SSO availability and student identifier matching policy.
- Gather approved branding, user roles, privacy rules, report requirements, retention rules, and deployment constraints. Approve direct PostgreSQL topology, database role plan, resource allocation, and backup/restore requirements.
- Establish baseline load-test assumptions for 300–500 logged-in accounts/sessions and estimate peak active users separately. Do not treat logged-in users as simultaneous transactions.

**Deliverables**

- Requirements and workflow inventory.
- New Koha deployment design and configuration worksheet.
- Koha REST API capability matrix for the new instance.
- Old-Koha data migration decision: authorized export/migration path or clean-start approval.
- Data ownership and branch mapping draft.
- Role/permission matrix.
- Architecture decision records (ADRs) for authentication, PostgreSQL operations, virtualization, backups, and deployment.
- Itemized server bill of materials and vendor quotations.
- Prioritized MVP backlog and acceptance criteria.

**Exit gate:** No production patron imports, old-system data migrations, Koha-dependent ULMS writes, or public launch until source-of-truth, data authorization, and Koha capability decisions are documented.

### Phase 1 — Repository foundation and development environment (Weeks 3–4)

**Activities**

- Create repository structure and developer documentation.
- Initialize Next.js, TypeScript, Tailwind, shadcn/ui, and approved frontend dependencies.
- Initialize FastAPI, SQLAlchemy, Psycopg 3, Pydantic, Alembic, and Pytest.
- Configure local PostgreSQL development database, runtime/migration roles, Alembic baseline, and Docker Compose.
- Add environment configuration and `.env.example`.
- Add linting, formatting, type checking, test commands, and CI pipeline.
- Implement health/readiness endpoints and structured logging.
- Establish frontend layout, navigation shell, API client, error handling, and design tokens.
- Create the Koha integration adapter and mock client contract; keep all calls pointed to fixtures until the new Koha staging instance is ready.

**Deliverables**

- Running local environment with Next.js, FastAPI, and PostgreSQL.
- Database initialized with the `libraryhub` database/schema and Alembic baseline.
- Documented local Koha mock/staging integration approach.
- CI checks for lint, type check, tests, and build.
- Initial architecture and developer setup docs.
- Empty but functioning application shell.

**Exit gate:** A new developer/AI agent can run the project using documented steps and all baseline CI checks pass.

### Phase 2 — Authentication, RBAC, and five departments (Weeks 5–6)

**Activities**

- Implement approved authentication flow (OIDC preferred if available; otherwise local auth). The database is PostgreSQL; university-approved authentication provider is not required unless separately approved.
- Implement users, roles, permissions, department assignments, and protected routes.
- Seed the five department records as configurable initial data.
- Add department-to-Koha-branch mapping management.
- Add staff management screens and audit events.
- Test cross-department authorization and session revocation.

**Deliverables**

- Secure staff sign-in and logout.
- Role/permission management.
- Five-department configuration.
- Department-aware application shell.
- Security tests for authorization.

**Exit gate:** Department isolation and role authorization tests pass.

### Phase 3 — Koha integration foundation (Weeks 7–8)

**Activities**

- Implement centralized HTTPX Koha client.
- Implement configuration, authentication, timeouts, safe retries, request IDs, and error mapping.
- Implement capability registry based on verified endpoints.
- Implement mock Koha adapter and fixtures.
- Add staging contract tests for approved endpoints.
- Add Koha status and integration health UI.
- Document data mapping and API limitations.

**Deliverables**

- Reusable Koha adapter.
- Capability matrix represented in configuration/docs.
- Mock and staging test coverage.
- Integration health view.

**Exit gate:** Read-only test calls work against the approved Koha test environment; all unsupported operations are identified.

### Phase 4 — Catalog discovery and staff patron lookup (Weeks 9–10)

**Activities**

- Implement catalog search, detail, filters, pagination, and availability display.
- Implement staff patron search and permitted patron detail view.
- Add loading/empty/error/degraded states and freshness labels.
- Add catalog and patron API tests and authorization checks.
- Add links to native Koha staff interface/OPAC as fallbacks where appropriate.

**Deliverables**

- Working catalog discovery UI.
- Staff patron lookup.
- Koha response mapping and test fixtures.

**Exit gate:** Librarians can complete catalog search and patron lookup in staging; no production write operations occur.

### Phase 5 — Circulation and holds (Weeks 11–13; dependent on verified API support)

**Activities**

- Implement checkout, check-in, and renewal workflows supported by Koha.
- Implement holds workflows only where Koha API support and policy are confirmed.
- Add barcode scanning/entry, confirmation, duplicate-submit protection, safe error recovery, and audit records.
- Test blocked patrons, invalid barcodes, unavailable items, branch mismatches, timeouts, and repeated submissions.
- Perform supervised librarian workflow review.

**Deliverables**

- Approved circulation screens and workflows.
- Holds screens if supported.
- Integration contract tests and audit coverage.

**Exit gate:** The Koha administrator and library representatives approve staging behavior. If API support is insufficient, keep the relevant workflow in Koha's native interface and document the gap.

### Phase 6 — Dashboard, announcements, notifications, and basic reports (Weeks 14–15)

**Activities**

- Build department and central dashboard metrics from verified sources.
- Add in-app notification persistence and inbox.
- Add announcements and department targeting.
- Add initial reports and CSV export.
- Add Redis/Celery only for jobs that need asynchronous processing.
- Add WebSockets for live notifications only when durable notification retrieval is already implemented.

**Deliverables**

- Useful operational dashboards.
- Durable in-app notifications.
- Announcements.
- Basic department reports and export.

**Exit gate:** Dashboard values reconcile with Koha or are clearly marked unavailable; notification state survives reconnect.

### Phase 7 — Inventory and student pilot (Weeks 16–17)

**Activities**

- Implement inventory/stocktake sessions and barcode scanning workflow.
- Add item comparison and exception reports.
- Confirm university identity and student-to-patron matching policy.
- Implement student authentication and self-service read views for a pilot group.
- Test privacy isolation and account-link correction workflow.

**Deliverables**

- Inventory pilot.
- Student account/patron linking pilot, if approved.
- Student catalog and personal account views for enabled features.

**Exit gate:** No cross-student data leakage; all item updates remain Koha-authoritative.

### Phase 8 — Hardening, UAT, load tests, and production readiness (Weeks 18–20)

**Activities**

- Complete end-to-end regression suite.
- Perform role/department access review.
- Review PostgreSQL security, private database connectivity, least-privilege roles, schema isolation, and row-level security only where used and tested.
- Conduct security and dependency scans.
- Conduct performance and load tests.
- Tune database indexes, API payloads, caching, and Koha call patterns based on measurements.
- Configure Prometheus, Grafana, and OpenTelemetry as approved.
- Configure TLS, firewall, PostgreSQL database backups, restore tests, alerts, and operations runbook.
- Conduct UAT with representatives from all five departments.
- Fix high-priority UAT defects and prepare rollback plan.

**Deliverables**

- UAT sign-off.
- Security and performance test reports.
- Monitoring dashboards and alerts.
- Backup/restore evidence.
- Deployment and rollback runbooks.
- Release candidate.

**Exit gate:** No unresolved critical/high security issue; critical workflows pass; backup restore succeeds; responsible university owners approve release.

### Phase 9 — Controlled launch and stabilization (Weeks 21–24)

**Activities**

- Deploy to production during an approved change window.
- Start with staff and one or two pilot departments if appropriate.
- Monitor Koha integration, performance, errors, and user feedback.
- Expand to all five departments after pilot sign-off.
- Enable student self-service in cohorts only after separate approval.
- Review incidents, adoption, and backlog.

**Deliverables**

- Controlled production rollout.
- Operational handover and training.
- Stabilization report and prioritized post-launch backlog.

**Exit gate:** University owners accept the production service and support/maintenance ownership is assigned.

### Post-launch roadmap (after Week 24)

Prioritize based on actual use and approved requirements:

- Advanced analytics and scheduled reports.
- Email/SMS/push provider integrations.
- Acquisitions and serials enhancements if not adequately handled by Koha.
- Document management and OCR.
- Room/equipment booking.
- Visitor statistics.
- Additional identity, student information system, finance, or learning-platform integrations.
- High availability, second host, and disaster recovery improvements if required.

---

## 16. MVP definition and release boundaries

### 16.1 MVP must include

- Staff authentication.
- RBAC and department-scoped authorization.
- Configuration for all five library departments.
- Verified department-to-Koha branch mapping.
- Staff dashboard with reliable, source-labelled data.
- Koha API adapter and health status.
- Catalog search and bibliographic/item display.
- Staff patron lookup with permitted fields.
- Basic in-app notifications and announcements.
- Basic reports and CSV export.
- Audit logs for security and sensitive actions.
- Automated tests, monitoring baseline, backups, restore test, deployment and rollback documentation.

### 16.2 MVP may include only after verification

- Checkout, check-in, renewals.
- Holds.
- Patron create/update.
- Fine/fee actions.
- Cataloguing writes.

These are not assumed available merely because Koha exists. Implement only after endpoint, permission, policy, and staging tests pass.

### 16.3 Not required for MVP

- Full student population rollout.
- Online payment gateway.
- Full acquisitions/serials replacement.
- OCR/document repository.
- Room booking and equipment management.
- Biometric or RFID integrations.
- Microservices or Kubernetes.
- High availability across multiple physical servers.

---

## 17. Release management and acceptance gates

Use the following environment promotion flow:

`local development -> automated CI -> integration/staging -> UAT -> approved production release`

For every release:

- Link changes to a requirement or issue.
- Include database migration notes and rollback approach.
- Include unit/API/E2E test results.
- Review permissions and data exposure changes.
- Verify configuration and secret changes.
- Verify backup before production migration.
- Use a documented deployment/change window.
- Monitor after deployment and have a rollback owner.

Never let an AI coding agent deploy to production, run destructive migrations, change Koha, or rotate production credentials without explicit authorized human approval.

---

## 18. Risks, dependencies, and decisions to resolve

| Risk / unknown | Impact | Required action |
|---|---|---|
| No permission to access old R230 Koha | Old catalog, patron, and transaction data cannot be inspected or exported by the project team | Treat new Koha as a fresh deployment. Request an authorized export through the university's designated Koha administrator if migration is required |
| Old Koha data export may not be approved or available | Existing records may not be migrated; manual re-entry or approved import may be required | Obtain written decision: authorized migration package or clean start. Do not bypass access controls |
| New Koha version/API capabilities unknown until installation | Could block or change circulation, holds, patron, and cataloguing features | Install a supported stable release and build a capability matrix against that exact instance |
| Koha installation/configuration expertise not assigned | Incorrect MARC settings, branch policies, search index, or database backup may affect operations | Assign a Koha administrator/implementation partner and approve a configuration worksheet |
| Five departments may not map directly to five Koha branches | Incorrect item availability and circulation scope | Confirm library/branch model and configure mapping explicitly |
| Student identity source unknown | Duplicate/wrong patron linkage or privacy breach | Confirm SSO/SIS source and stable unique identifier before student rollout |
| Single physical server hosts all systems | Hardware failure affects Koha, ULMS, and PostgreSQL at once | Maintain independent backups, offsite copy, UPS, tested recovery, and a recovery-time plan; add a second physical host for HA later if required |
| R760xs complete configuration may exceed ₱550,000 | Budget may not cover memory, SSDs, UPS, and backup storage | Obtain itemized quotations and prioritize RAM, enterprise SSD RAID10, redundant power, support, UPS, and backup target |
| 300–500 logged-in sessions do not define peak concurrent workload | Server sizing may be inaccurate | Measure active-user and request rates separately; run k6 tests at realistic concurrency levels |
| PostgreSQL operations are not yet assigned | Database outage, missed updates, or data loss | Name an owner for patching, monitoring, credentials, maintenance, backups, restore, and incident response |
| Current storage IOPS/endurance unknown | Database latency or premature SSD wear | Select enterprise SSDs and monitor latency, write endurance, SMART/controller health, and capacity |
| Current library workflows vary by department | Incomplete requirements and poor adoption | Conduct interviews and approve workflow matrix |
| Notifications require paid providers or consent | Unplanned cost/privacy risk | Confirm vendor, pricing, message policy, and consent before integration |
| Reports may require data not exposed by Koha API | Incorrect or incomplete analytics | Document data gaps and use approved reports/imports; do not query Koha MariaDB directly from ULMS |
| Scope growth | Delays MVP | Enforce scope labels, change control, and release boundaries |
| AI-generated code may contain security or logic defects | Data exposure or incorrect circulation actions | Human review, automated tests, staging tests, and approval gates |

### Decisions required from the university

- Who is the system owner and who approves the new Koha deployment?
- Is the university approving a fresh Koha instance as the replacement/primary library system for the five departments?
- Can the old Koha administrator provide an authorized database backup/export, MARC export, patron export, and circulation history export? If not, is a clean start approved?
- Which Koha release and supported operating system will be used?
- What cataloging standard, item types, patron categories, branch codes, circulation rules, fines, and holds policies should be configured?
- Which university identity provider, if any, should be used?
- Which roles and staff members should access each department?
- What student identifier may be used for safe patron matching?
- Which Koha functions must be accessible through ULMS versus Koha's native staff interface?
- Which reports are required by department heads and central management?
- What privacy, retention, and audit policies apply?
- What are the production DNS, TLS, backup, RPO, and RTO requirements?
- Who owns PostgreSQL security updates, database maintenance, backups, restores, monitoring, and incident response?
- Will PostgreSQL run in a dedicated VM on the Proxmox host, or on a separate physical server?
- Are email, SMS, push, payments, acquisitions, serials, document management, rooms, or visitor modules in scope?

## 19. AI coding agent implementation instructions

> The following section is intended to be given directly to an AI coding agent working in this repository.

### 19.1 Role and objective

You are the senior full-stack engineer responsible for implementing libraryhub, a University Library Management System (ULMS), according to this `plan.md`. Build a secure, maintainable, tested ULMS that integrates with the new, independently deployed Koha instance through its REST API. Koha uses its own MariaDB database; ULMS uses standalone PostgreSQL. Treat this plan as the product and architecture baseline. Do not silently change the agreed technology stack, system boundaries, data ownership, or security requirements.

### 19.2 Mandatory rules

1. Read this entire `plan.md` and the repository README before modifying code.
2. Inspect the current repository and report what already exists. Do not overwrite working code or configuration without understanding it.
3. Start by creating/updating `docs/architecture.md`, `docs/data-ownership.md`, `docs/koha-integration.md`, and a prioritized implementation checklist.
4. Work in small, reviewable vertical slices. Do not generate the entire platform in one unreviewed change.
5. Use the technology stack specified here. If a package/version is incompatible or unsupported, explain the issue and propose a documented replacement before changing it.
6. Verify current stable package versions at implementation time. Pin dependencies using the ecosystem's lockfile/standard dependency management.
7. Never invent Koha endpoints, API fields, authentication methods, branch codes, or permissions. Use verified documentation from the new Koha installation version or approved staging responses.
8. Never connect directly to Koha's MariaDB/MySQL database or write to Koha tables.
9. Never place API keys, passwords, tokens, personal data, or production connection strings in source code, logs, screenshots, commits, or frontend bundles.
10. Use synthetic/mock data by default. Do not copy real student/patron data into local development.
11. Do not run destructive commands, production migrations, production API writes, or production deployments without explicit human approval.
12. Enforce RBAC and department scoping in FastAPI services/routes, not only in React components.
13. Add tests for every business rule, permission rule, integration mapping, and critical UI workflow.
14. Do not claim a feature is complete unless its acceptance criteria and tests pass. State any blocked condition explicitly.
15. Update this plan's checkboxes or a linked progress tracker as work is completed; do not remove requirements simply because they are difficult.
16. Prefer a modular monolith. Do not introduce microservices, Kubernetes, or extra infrastructure without a documented need and approval.
17. Keep Koha-dependent write workflows disabled until the capability matrix confirms support and staging tests pass.
18. Use Alembic as the sole schema migration authority for ULMS PostgreSQL tables; do not rely on untracked manual production DDL.
19. Use separate least-privilege database runtime, migration, and backup roles; never use the PostgreSQL superuser for normal FastAPI traffic.
20. Keep PostgreSQL and Koha MariaDB ports private; do not expose database ports, secrets, or management interfaces to the public internet.
21. Keep all ULMS database access server-side through FastAPI. The browser must call the ULMS API, not PostgreSQL directly.
22. Keep Koha and ULMS database ownership separate. Use Koha's supported REST API and never write directly to Koha tables.
23. Keep code typed, readable, documented, and consistent with lint/format rules.
24. At the end of each implementation phase, report changed files, behavior implemented, commands/tests run, results, remaining gaps, and the next smallest safe step.

### 19.2.1 Mandatory PostgreSQL and Koha separation rules

1. The ULMS database is standalone PostgreSQL, installed and operated directly by the university. Do not add an additional database platform or bundled backend service layer.
2. The new Koha deployment uses its own supported MariaDB database and Koha search infrastructure. Do not attempt to connect Koha to PostgreSQL or make ULMS connect directly to Koha's database.
3. Use SQLAlchemy 2.x for runtime access and Alembic for ULMS schema migrations.
4. Use separate least-privilege runtime, migration, and backup roles. Never use the PostgreSQL superuser for ordinary application queries.
5. Keep PostgreSQL and MariaDB database ports private. Permit only approved service-to-service and administrative connections.
6. FastAPI is the normal ULMS data-access layer. The browser must not connect directly to PostgreSQL.
7. Koha integration must use its REST API through the HTTPX adapter. Verify endpoints and permissions against the new Koha installation version.
8. Test migrations, role permissions, backup/restore, and connection-pool behavior against non-production databases before deployment.
9. The university owns database patching, service health, maintenance, backups, restore, network security, secrets, and incident response.
10. Do not access the old R230 Koha system or import its data unless the university grants written authorization and provides an approved export.

### 19.3 Required workflow for every task

1. **Understand:** Read the relevant plan section, existing code, and related tests.
2. **Inspect:** Identify current architecture, dependencies, conventions, and affected modules.
3. **Plan:** List the smallest set of changes and tests. Identify data/API/security impacts.
4. **Implement:** Make the minimum complete vertical slice; avoid unrelated refactors.
5. **Test:** Run targeted tests, then relevant full checks (lint, type checks, migrations, build, unit/API/E2E as applicable).
6. **Review:** Check authorization, department isolation, error handling, logging, privacy, accessibility, and regressions.
7. **Document:** Update API docs, architecture docs, environment example, and plan progress as required.
8. **Report:** Summarize what works, evidence from tests, blockers, and any human decision needed.

### 19.4 Required implementation order

Follow this order unless a documented dependency requires a change:

1. Phase 0 discovery artifacts and Koha capability matrix.
2. Repository foundation, local Docker Compose, CI, and documentation.
3. Self-hosted PostgreSQL foundation, dedicated database roles, and Alembic migration conventions.
4. Authentication, RBAC, department model, and audit foundation.
5. Koha HTTPX client, mock adapter, capability registry, and staging contract tests.
6. Catalog search and item availability.
7. Staff patron lookup and safe identity mapping.
8. Dashboard, announcements, durable notifications, and basic reports.
9. Circulation/holds only after capability and policy approval.
10. Inventory and approved student pilot.
11. Observability, security hardening, performance, UAT, deployment, and training.
12. Optional modules only through approved scope changes.

### 19.5 Required documentation artifacts

Maintain these documents as the implementation evolves:

- `README.md` — setup, run, test, and contribution instructions.
- `docs/architecture.md` — components and request/data flows.
- `docs/data-ownership.md` — source-of-truth matrix and any approved changes.
- `docs/koha-integration.md` — Koha version, API capability matrix, authentication, endpoint mapping, limitations, and test approach. Never include secrets.
- `docs/security.md` — authentication, authorization, threat controls, privacy, and audit.
- `docs/deployment.md` — Proxmox VM setup, Koha/ULMS/PostgreSQL separation, migrations, network boundaries, TLS, upgrades, backups, and rollback.
- `infrastructure/postgres/README.md` — PostgreSQL installation, roles, tuning, updates, backup/restore, access restrictions, and troubleshooting. Never include actual secrets.
- `infrastructure/koha/README.md` — Koha release, supported OS/database/search engine, branch policies, API setup, backup/restore, and maintenance notes. Never include actual secrets.
- `docs/operations-runbook.md` — monitoring, backups, restore, incident handling, and troubleshooting.
- `docs/decisions/` — short ADRs for significant architectural decisions.
- `CHANGELOG.md` — user-visible changes by release.

### 19.6 Definition of done for a module

A module is complete only when:

- Its business requirements and permissions are documented.
- UI, API, service, and data layers are implemented where required.
- It handles loading, empty, validation, unauthorized, unavailable, and error states.
- Alembic database migrations against PostgreSQL are present and tested, if schema changes are needed.
- Unit and API tests cover success and failure paths.
- End-to-end tests cover critical user journeys where applicable.
- Audit and privacy requirements are satisfied.
- Documentation and environment examples are updated.
- Lint, type checks, tests, and production builds pass.
- Any external dependency or Koha capability has been verified.
- Human review and approval are obtained for high-impact workflows.

### 19.7 Initial AI-agent task

Do not begin by implementing every module. First perform a repository and requirements assessment and produce:

1. A summary of existing repository state.
2. A list of confirmed requirements and unresolved decisions.
3. A Koha discovery checklist and capability matrix template.
4. A proposed PostgreSQL database ownership/schema outline, including the `libraryhub` schema, database roles, RLS approach, and Alembic migration policy.
5. A prioritized MVP backlog split into small implementation tasks.
6. A list of risks and required human approvals.
7. A proposed Phase 1 implementation plan with testable acceptance criteria.

After the human reviews that assessment, implement the repository foundation and proceed phase by phase.

---

## 20. Project checklist

Use this checklist to track progress. Mark an item complete only when its deliverables and acceptance criteria are verified.

### Discovery

- [ ] Interview representatives from all five departments.
- [ ] Document current workflows and pain points.
- [ ] Confirm Koha version and API documentation.
- [ ] Obtain approved Koha staging/test access.
- [ ] Complete Koha API capability matrix.
- [ ] Confirm five department-to-branch mapping.
- [ ] Confirm identity provider and student identifier policy.
- [ ] Approve roles, permissions, privacy, and retention requirements.
- [ ] Approve MVP scope and UAT representatives.

### Foundation

- [ ] Create repository and documented structure.
- [ ] Initialize frontend stack.
- [ ] Initialize FastAPI backend stack.
- [ ] Configure a local standalone PostgreSQL development database.
- [ ] Provision the production PostgreSQL VM with private networking, storage, and monitored backups.
- [ ] Configure private ULMS-to-PostgreSQL connectivity and verify runtime/migration database roles.
- [ ] Create separate least-privilege runtime and migration database roles.
- [ ] Create the ULMS `libraryhub` schema and configure Alembic as the sole migration authority.
- [ ] Document optional services that are enabled, disabled, or deferred (university SSO, object storage, Redis, WebSockets, background workers).
- [ ] Configure local ULMS Docker Compose separately from the PostgreSQL service.
- [ ] Add lint, type-check, tests, and CI.
- [ ] Add structured logging, health, and readiness endpoints.
- [ ] Create architecture and data ownership documentation.

### Security and departments

- [ ] Implement authentication.
- [ ] Implement RBAC and department scoping.
- [ ] Implement staff account management.
- [ ] Configure all five departments.
- [ ] Implement Koha branch mapping management.
- [ ] Implement audit logging.
- [ ] Pass cross-department authorization tests.

### Koha and core workflows

- [ ] Implement HTTPX Koha client.
- [ ] Implement Koha capability registry.
- [ ] Implement mock adapter and fixtures.
- [ ] Pass approved staging contract tests.
- [ ] Implement catalog search and detail.
- [ ] Implement item availability display.
- [ ] Implement staff patron lookup.
- [ ] Implement dashboard with source/freshness labels.
- [ ] Implement circulation only where verified.
- [ ] Implement holds only where verified.

### Operations and follow-up modules

- [ ] Implement in-app notifications.
- [ ] Implement announcements.
- [ ] Implement basic reports and CSV export.
- [ ] Implement inventory/stocktake pilot.
- [ ] Approve and implement student identity/patron pilot.
- [ ] Add Redis/Celery where justified.
- [ ] Add WebSocket delivery if required.
- [ ] Add Prometheus/Grafana/OpenTelemetry.

### Release readiness

- [ ] Complete unit, API, integration, and E2E tests.
- [ ] Complete security review and dependency scan.
- [ ] Complete load/performance tests.
- [ ] Complete UAT in all five departments.
- [ ] Configure TLS, server-side secrets, private network rules, and restricted database administration access.
- [ ] Configure automated PostgreSQL backups and prove restore to a separate environment.
- [ ] Complete monitoring and alerting.
- [ ] Complete deployment and rollback runbooks.
- [ ] Obtain production approval.
- [ ] Complete staff training and handover.
- [ ] Complete controlled rollout and stabilization review.

---

## 21. Final implementation guidance

Deploy a fresh, independently managed Koha instance as the library system of record, then build the ULMS as the modern staff/student experience and integration layer around it. The first priority is to approve the Koha configuration, verify its REST API capabilities, map the five departments, and establish identity/access policies. Any data migration from the inaccessible old R230 must come from a university-authorized export; otherwise the new installation begins with approved clean data.

The most important architectural rule is: **Koha owns Koha library transactions and records; self-hosted PostgreSQL owns ULMS-specific application data; FastAPI is the secure application/data-access boundary between the Next.js frontend, PostgreSQL, and the new Koha REST API.**

Do not sacrifice data integrity, patron privacy, or production safety to make an AI-generated feature appear complete. When an API capability or policy is unknown, document the gap, keep the affected feature disabled, and request an authorized decision rather than guessing.

# Staff shell and FastAPI sessions

Date: 2026-11-16
Status: approved in conversation, pending spec review

## Purpose

Build the first slice of the ULMS staff application: a themed shadcn/ui shell that follows `plan/prototype1.html`, and a FastAPI session that is the only authentication authority. Each prototype view becomes a real route with its prototype page header. Module bodies, domain APIs, and later-phase tables wait for their own specs.

The public marketing homepage at `/` stays as it is.

## Decisions

- The browser calls `/api/v1` on the Next.js origin. Next.js rewrites that prefix to FastAPI. Nginx will do the same when both share one host. The upstream address is the server-only setting `API_PROXY_TARGET`, default `http://127.0.0.1:8000`. It is not a `NEXT_PUBLIC_` variable.
- FastAPI sets the session cookie. There is no Auth.js session and no token in `localStorage` or `sessionStorage`.
- Persistence follows `plan/database design.md` for table names and relationships. The database name stays `libraryhub`, and the schema stays `libraryhub`, matching the running configuration and `plan/plan.md`. The design document's `university_library` name is not used.
- Role names follow `plan/plan.md` §5.1. Faculty and Library Assistant from the database design are not seeded.
- Department codes follow `plan/database design.md` §10. `koha_branchcode` stays null until a real Koha branch is confirmed.
- `audit_logs` is created in this slice because `plan/plan.md` requires login, logout, and department-change records. Its columns are the design document's columns plus a nullable `details` JSONB field.
- Icons come from Hugeicons, which is already set in `apps/web/components.json`.
- Login is the shadcn `login-02` block, restyled to the prototype's sign-in screen.

## Data model

Alembic revision `20251115_0001` already creates the `libraryhub` schema. The next revision creates the tables below. Primary keys are UUIDs. Timestamps are `TIMESTAMPTZ`. Foreign keys and indexes cover the lookups this slice performs: session token hash, user email, user username, role permission by role, and assignment by user.

Reference rows (departments, roles, permissions, role grants) are inserted by that migration. The staff user is created by a seed command, because the password comes from the environment.

### Tables

| Table | Columns used here |
|---|---|
| `library_departments` | `id`, `code`, `name`, `koha_branchcode`, `is_active` |
| `app_users` | `id`, `username`, `display_name`, `email`, `status`, `created_at`, `updated_at` |
| `auth_identities` | `id`, `user_id`, `provider`, `provider_subject`, `koha_borrowernumber`, `linked_at` |
| `user_credentials` | `id`, `user_id`, `password_hash`, `password_changed_at` |
| `user_sessions` | `id`, `user_id`, `token_hash`, `csrf_token_hash`, `active_department_id`, `expires_at`, `idle_expires_at`, `last_seen_at`, `revoked_at` |
| `roles` | `id`, `name`, `description`, `is_system_role` |
| `permissions` | `id`, `code`, `module`, `description` |
| `role_permissions` | `role_id`, `permission_id` |
| `user_role_assignments` | `id`, `user_id`, `role_id`, `department_id`, `assigned_by` |
| `audit_logs` | `id`, `user_id`, `action`, `module`, `entity_type`, `entity_id`, `ip_address`, `details`, `created_at` |

`user_credentials.password_hash` is an Argon2id hash from `pwdlib[argon2]`, using that library's default Argon2id parameters. `user_sessions.token_hash` and `csrf_token_hash` are SHA-256 hex digests of 32-byte URL-safe secrets. The raw secrets exist only in cookies.

`app_users.username` and `app_users.email` are unique. Login compares the submitted identifier case-insensitively to `username` first, then to `email`. `user_credentials.user_id` is unique. `user_sessions.token_hash` is unique.

`app_users.status` is `active` or `suspended`. A suspended user cannot sign in. An existing session for a user whose status is no longer `active` is revoked on the next authenticated request, which then returns 401.

A null `user_role_assignments.department_id` is a global assignment. A null `user_sessions.active_department_id` means All departments. Only a global Super Administrator, Library Administrator, or Auditor may hold that value.

`audit_logs.user_id` is null when the failure has no matching user. `details` holds a JSON object and never contains a password, session token, CSRF token, or hash. `ip_address` is the request address when one is available.

### Reference data

Departments, all with `is_active = true` and `koha_branchcode` null:

| Code | Name |
|---|---|
| `COLLEGE` | College Library |
| `JHS` | Junior High School Library |
| `SHS` | Senior High School Library |
| `GRADE` | Grade School Library |
| `GRADUATE` | Graduate School Library |

Roles, all with `is_system_role = true`:

| Role | View permissions |
|---|---|
| Super Administrator | Every staff view below |
| Library Administrator | Every staff view below |
| Department Head | Dashboard through Departments |
| Librarian | Dashboard through Notifications |
| Auditor | Dashboard, Reports, Audit Log |
| Student | Student portal |

Staff view permissions, in sidebar order:

| Group | Permission | Label | Path |
|---|---|---|---|
| Overview | `dashboard.view` | Dashboard | `/dashboard` |
| Library | `catalog.view` | Catalog | `/catalog` |
| Library | `patrons.view` | Patrons | `/patrons` |
| Library | `circulation.view` | Circulation | `/circulation` |
| Library | `holds.view` | Holds | `/holds` |
| Library | `inventory.view` | Inventory | `/inventory` |
| Communication | `notifications.view` | Notifications | `/notifications` |
| Communication | `announcements.view` | Announcements | `/announcements` |
| Insights | `reports.view` | Reports | `/reports` |
| Administration | `departments.view` | Departments | `/departments` |
| Administration | `staff.view` | Staff & Roles | `/staff` |
| Administration | `audit.view` | Audit Log | `/audit` |
| Administration | `integrations.view` | Koha Integration | `/integrations` |
| Pilot | `student.view` | Student Portal | `/student` |

"Dashboard through Departments" means `dashboard.view`, `catalog.view`, `patrons.view`, `circulation.view`, `holds.view`, `inventory.view`, `notifications.view`, `announcements.view`, `reports.view`, and `departments.view`. "Dashboard through Notifications" stops after `notifications.view`.

Finer permissions from `plan/plan.md` §5.2, such as `circulation.checkout`, are not seeded until the module that enforces them exists.

### Seed

Command: `python -m app.scripts.seed` from `apps/api`.

It requires `LIBRARYHUB_BOOTSTRAP_PASSWORD`. If the variable is missing, the command exits with an error and writes nothing. The password is not stored in the repo.

The command creates one user when no `app_users` row exists for `m.reyes`:

| Field | Value |
|---|---|
| `username` | `m.reyes` |
| `email` | `m.reyes@usant.edu.ph` |
| `display_name` | Maria Reyes |
| `status` | `active` |
| Identity | `provider = local`, `provider_subject` is the user id, `koha_borrowernumber` null |
| Assignment | Super Administrator, `department_id` null, `assigned_by` null |

Running the command again leaves that user in place and does not reset the password.

## Sessions

Login creates a session row and sets two cookies. Both use `Path=/`, no `Domain`, and `SameSite=Lax`. `Secure` is set when `APP_ENV` is anything other than `development`. Cookie `Max-Age` is 12 hours.

| Cookie | HttpOnly | Value |
|---|---|---|
| `libraryhub_session` | yes | Raw session token |
| `libraryhub_csrf` | no | Raw CSRF token |

`expires_at` is 12 hours after login and does not move. `idle_expires_at` starts at 30 minutes and slides forward by 30 minutes from the request time. A slide happens only when `last_seen_at` is older than one minute. A session is usable when `revoked_at` is null, `expires_at` is in the future, and `idle_expires_at` is in the future.

On login, a global Super Administrator, Library Administrator, or Auditor starts with `active_department_id` null. Any other user starts on their assigned department with the alphabetically first department name when they have several.

State-changing requests, except login, send `X-CSRF-Token`. FastAPI accepts the request only when the header matches the `libraryhub_csrf` cookie and the session's `csrf_token_hash`.

## API

Routes sit under `/api/v1`. Schemas are Pydantic models. Responses never include a password hash, session token, or CSRF token. Authenticated handlers depend on one session loader, which performs the idle slide and the suspended-user revocation.

Errors use FastAPI `detail` as `{ "code", "message" }`. Validation keeps the framework's 422 shape. The existing request-id middleware stays, and auth logs include that id. Log lines omit passwords, tokens, and hashes.

| Method | Path | CSRF | Behavior |
|---|---|---|---|
| `POST` | `/auth/login` | none | Body `{ "username", "password" }`. `username` matches `username` or `email`, compared case-insensitively. Success returns the current-user payload and sets both cookies. |
| `GET` | `/auth/me` | none | Returns the current-user payload. When the session is valid and the CSRF cookie is missing or does not match `csrf_token_hash`, the response sets a new `libraryhub_csrf` cookie and stores the new hash. |
| `PATCH` | `/auth/session` | required | Body `{ "active_department_id": uuid or null }`. Null is All departments. |
| `POST` | `/auth/logout` | required | Sets `revoked_at` and clears both cookies. |

Current-user payload:

- `user`: `id`, `username`, `display_name`, `email`, `initials`, `status`
- `assignments`: each has `role` (`id`, `name`) and `department_id`
- `permissions`: the union of view codes from those assignments
- `departments`: `{ id, code, name }` for every active department on a global assignment, or the assigned departments otherwise, ordered by name
- `active_department_id`
- `can_select_all_departments`: true for a global Super Administrator, Library Administrator, or Auditor
- `koha_configured`: true only when `KOHA_BASE_URL` is set

Initials are the uppercase first character of the first word and of the last word. A single-word name uses its first two characters, uppercased.

Login failure for an unknown user, a wrong password, or a suspended account is HTTP 401 with code `invalid_credentials` and message `Those credentials are not valid.` The audit action is `auth.login.failure`, module `auth`, and `details.reason` is `unknown_user`, `invalid_password`, or `suspended`. `details.identifier` is the submitted identifier, trimmed and lowercased.

Before checking the password, login counts `auth.login.failure` rows for that identifier in the past 15 minutes. At five or more, the response is HTTP 429 with code `rate_limited` and message `Sign-in is temporarily paused. Try again later.` That response does not write another failure row.

Other codes:

| Code | HTTP | When |
|---|---|---|
| `unauthenticated` | 401 | Missing, unknown, expired, idle, or revoked session, or a session revoked because the user is suspended |
| `csrf_failed` | 403 | Header, cookie, and session hash disagree |
| `department_forbidden` | 403 | The department is not in the user's list, or a caller who may not select All departments sent null |
| `forbidden` | 403 | The caller lacks the permission a later route requires |

A successful login writes `auth.login.success` with `entity_type = user_session` and the session id. Logout writes `auth.logout`. A successful department change writes `auth.department_change` with `details.active_department_id` set to the uuid or null. `module` is `auth` for all four.

`PATCH` rejects a department the user cannot select and leaves the stored value unchanged.

This slice does not call Koha. It does not add catalog, patron, circulation, or notification endpoints.

## Web application

### Proxy and client

`apps/web/next.config.ts` rewrites `/api/v1/:path*` to `${API_PROXY_TARGET}/api/v1/:path*`. `apps/web/lib/api.ts` calls that same-origin prefix with credentials included. Mutating calls copy `libraryhub_csrf` into `X-CSRF-Token`.

The staff layout reads the request cookies on the server and calls `/auth/me`, forwarding the `Cookie` header. Because it reads cookies, the layout is dynamic and the session payload is not cached. HTTP 401 redirects to `/login?next=<path>`.

### Theme

`app/globals.css` gains a `.ulms` scope. Inside it, shadcn variables use the prototype palette: cream `#FAF7F1` background, ink `#221A18` text, maroon `#7D1519` primary, gold `#FAA61A` ring and sidebar active color, maroon `#2E080A` sidebar, cream sidebar text. The public homepage does not use `.ulms`, so its current tokens stay.

Inter and Playfair Display remain the fonts already loaded in the root layout. Page titles use the display face.

### Login

`npx shadcn@latest add login-02` provides the page. `app/(auth)/layout.tsx` becomes a full-height `.ulms` wrapper with no width constraint, so the block can use the viewport.

The block's cover image is replaced by the prototype's left panel, visible from the `lg` breakpoint up:

- USANT seal from `https://www.usant.edu.ph/images/usant_logo_new.png`, with the text still readable if the image fails
- "University of Saint Anthony" and "libraryhub"
- Eyebrow "University Library Management System"
- Heading "One workspace for five libraries." with "five libraries." in gold italic
- The prototype's sentence about department-aware work and Koha remaining the source of truth
- Three tiles: `5` Departments, `RBAC` Role + dept scope, `Koha` Source of truth
- Footer: "ULMS workspace for the University of Saint Anthony."

The form copy matches the prototype:

- Eyebrow "Staff sign-in", heading "Welcome back", text "Sign in to manage your library department."
- A disabled button, "Continue with University SSO (OIDC)", with an accessible description that university SSO is not configured
- Divider "or local account"
- Fields "Username or email" and "Password"
- Gold submit button "Sign in"
- Note: "Argon2id password hashing, secure HttpOnly cookies, and rate limiting. Permissions are enforced by FastAPI."

The signup link and forgot-password link that ship with `login-02` are removed. Fields are empty on first render. The button is disabled while the request is in flight. A failed response shows `detail.message`. If the network call fails, the form shows "The sign-in service is unavailable." and keeps the typed values.

A signed-in visit to `/login` redirects to `/dashboard`. After a successful login, the browser goes to the `next` query value only when it is a relative path exactly equal to one of the staff paths in the permission table and the user has that path's permission. Any other value, including an absolute URL, goes to `/dashboard`.

### Shell

`npx shadcn@latest add sidebar-01` provides the sidebar, installed with the existing Hugeicons configuration. Collapsible icon mode, the rail, tooltips on collapsed items, keyboard access, and the mobile sheet stay. On a large screen the sidebar starts expanded at 16rem. The sidebar may store its collapsed state in its own UI cookie. That cookie is not an authentication secret.

The empty `(dashboard)` group is replaced by `(app)`. Placeholder routes at `app/catalog` and `app/student` move under `(app)` so one layout wraps every staff URL.

`(app)/layout.tsx` renders the sidebar and header inside `.ulms`. While `/auth/me` is loading, the layout shows a skeleton of the sidebar and header. The sidebar header is the USANT mark, "libraryhub", and "USANT · ULMS". Navigation groups use the table above, and an item is rendered only when `permissions` contains its code. The active item is the gold prototype treatment and matches the current path. The footer card says "Koha configured" when `koha_configured` is true and "Koha not configured" otherwise, with the prototype's line that Koha is the source of truth for catalog, patrons, and circulation.

The header contains:

- A menu button, visible on small screens, that opens the sidebar sheet
- A department select. Options are the payload's departments, plus "All departments" when `can_select_all_departments` is true. Changing it sends `PATCH /auth/session`. On `department_forbidden`, the select returns to the previous value and shows `detail.message`
- A command palette opened by a button and by Ctrl+K or ⌘K. It lists only permitted routes and navigates to the chosen one
- A bell that links to `/notifications` and shows no unread count
- A user menu with the display name, the distinct role names in assignment order separated by a comma, and Sign out. There is no role switcher

Sign out calls `POST /auth/logout` and then goes to `/login`. The browser leaves the staff layout only after that call succeeds. A network failure shows "Sign-out did not complete." and keeps the session.

A `csrf_failed` response retries the mutation once after `GET /auth/me`. A second failure redirects to `/login`. Any other 401 from an authenticated call redirects to `/login?next=<current path>`.

An unknown path under the staff layout renders the framework not-found page inside the shell.

### Page frames

Each permitted route renders a shared header: the prototype eyebrow, title, and description, then one sentence: "This module's tools will be added in a later spec."

| Path | Eyebrow | Title | Description |
|---|---|---|---|
| `/dashboard` | Overview | Greeting | Operational overview for the active department, with the current date in Asia/Manila |
| `/catalog` | Library | Catalog search | Search the Koha catalog. Results are fetched from Koha with pagination. The ULMS does not store a copy of the catalog. |
| `/patrons` | Library | Patron lookup | Search permitted patron fields from Koha. Sensitive fields are masked. Ambiguous matches are shown for manual review and are never auto-merged. |
| `/circulation` | Library | Circulation desk | Every action is executed by Koha. Success is shown only after Koha confirms the transaction. |
| `/holds` | Library | Holds & reservations | Koha is authoritative for hold queues. ULMS never keeps a second queue. |
| `/inventory` | Library | Inventory & stocktaking | Plan a stocktake session by department, scan barcodes, and review exceptions. |
| `/notifications` | Communication | Notifications | Durable in-app notifications stored in PostgreSQL. They survive reconnects and page reloads. |
| `/announcements` | Communication | Announcements | Publish department-targeted notices. Each announcement also creates durable in-app notifications. |
| `/reports` | Insights | Reports & exports | Every report shows its source, generation time, and data freshness. Large exports run as background jobs in production. |
| `/departments` | Administration | Departments & Koha branch mapping | Each department is configurable. Branch-dependent writes stay blocked until the mapping is verified. |
| `/staff` | Administration | Staff & roles | Role-based access with department scope. Permissions are enforced on every API endpoint. |
| `/audit` | Administration | Audit log | Append-only record of security and sensitive business events. |
| `/integrations` | Administration | Koha integration | Capability registry, health, and feature flags. Unsupported actions stay disabled. |
| `/student` | Student self-service | Student portal | You can see only your own account. The account is linked to Koha by a verified student identifier. |

The dashboard greeting uses the Manila hour: "Good morning" before 12:00, "Good afternoon" before 18:00, and "Good evening" after that, followed by the user's first name. The description names "All departments" or the active department's name, then the Manila date. When the user has `catalog.view`, the header links to `/catalog`. When the user has `circulation.view`, it also links to `/circulation`.

The catalog header links to `https://library.usant.edu.ph/` with `target="_blank"` and `rel="noopener"`.

When `active_department_id` is null, `/inventory` replaces the module sentence with the prototype's centered card: "Choose a department" and the sentence that an inventory session runs against one department at a time.

A route the user's permissions omit renders the access-denied panel: a lock icon, "Access denied", and "Your role does not include this module. Authorization is enforced by the backend API as well as this UI." The panel includes the role name.

Header actions that export, invite, publish, or mark notifications read are not part of these frames.

## Testing

New pytest modules live in `apps/api/tests/api/`. They run when PostgreSQL at `DATABASE_URL` is reachable and skip with an explicit reason when it is not. Each test rolls back the rows it writes. Session tests insert their own users. The seed test sets `LIBRARYHUB_BOOTSTRAP_PASSWORD` in the test process, calls the seed function inside the same transaction, and rolls it back.

Covered cases:

- Login by username and by email stores only the token hash and sets both cookies.
- Unknown user, wrong password, and suspended user return the same 401 detail. The audit row stores the matching `details.reason`. The submitted password is absent from the response and the audit row.
- The request after five failures for one identifier inside 15 minutes returns 429.
- `/auth/me` returns 401 for a missing cookie, a revoked session, an idle session, an absolutely expired session, and a session whose user is suspended.
- Logout and department change return `csrf_failed` when the header is missing or does not match.
- A global Super Administrator may set `active_department_id` to null. A librarian assigned only to College Library receives `department_forbidden` for null and for Junior High, and the stored department stays unchanged.
- After logout, `/auth/me` with the old cookie returns 401.
- The seed command creates Maria Reyes once and does not create a second user on the next run.

`apps/web` has no test runner. This slice does not add one. The web check is `npm run typecheck`, `npm run lint`, and a browser pass through sign-in, refresh, department change, a permitted page, a direct URL the role cannot open, sign-out, and the mobile menu.

## Later specs

Later specs cover module page bodies and their FastAPI domains, password reset, MFA, a working university SSO flow, staff invitations, notification counts, a live Koha probe, and the phase 2–6 tables in `plan/database design.md`.

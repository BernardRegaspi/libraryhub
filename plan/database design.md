# **Recommended PostgreSQL database tables for your ULMS**

I recommend using a dedicated PostgreSQL database named `university_library` with an application schema named `libraryhub`.

The most important design decision is that **PostgreSQL manages your ULMS application, while Koha remains responsible for the actual library records and transactions.**

That means your ULMS will not maintain its own competing copy of Koha's books, patrons, loans, reservations, and fines.

## **1. Database ownership: PostgreSQL vs. Koha**

| Data                                      | Where it should be stored        |
| ----------------------------------------- | -------------------------------- |
| Librarian and application accounts        | PostgreSQL                       |
| ULMS roles and permissions                | PostgreSQL                       |
| Department access                         | PostgreSQL                       |
| Student and faculty patron records        | Koha                             |
| Bibliographic records and book details    | Koha                             |
| Book copies, barcodes and item status     | Koha                             |
| Borrowing, returning and renewals         | Koha                             |
| Book reservations and holds               | Koha                             |
| Fines and circulation transactions        | Koha                             |
| Acquisitions and serials                  | Koha                             |
| ULMS announcements and notifications      | PostgreSQL                       |
| ULMS audit logs                           | PostgreSQL                       |
| Digital document metadata and permissions | PostgreSQL                       |
| ULMS inventory scanning sessions          | PostgreSQL, linked to Koha items |
| ULMS reports and generated exports        | PostgreSQL                       |
| RFID and kiosk device activity            | PostgreSQL                       |

**Do not create PostgreSQL tables named&#x20;**`books`**,&#x20;**`borrowers`**,&#x20;**`items`**,&#x20;**`issues`**, or&#x20;**`fines`**&#x20;to duplicate Koha's records.** Your FastAPI backend should use Koha's REST API for those operations.

## **2. Core authentication and user management**

These are the first tables I recommend implementing because nearly every ULMS module depends on them.

| Table                   | Important columns                                                                   | Purpose                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `library_departments`   | `id`, `code`, `name`, `koha_branchcode`, `is_active`                                | The five library departments and their optional Koha branch mappings |
| `app_users`             | `id`, `username`, `display_name`, `email`, `status`, `created_at`, `updated_at`     | ULMS application user profiles                                       |
| `auth_identities`       | `id`, `user_id`, `provider`, `provider_subject`, `koha_borrowernumber`, `linked_at` | Connects a ULMS account to Koha or university SSO                    |
| `user_credentials`      | `id`, `user_id`, `password_hash`, `password_changed_at`                             | Optional, only if ULMS manages local passwords                       |
| `user_sessions`         | `id`, `user_id`, `token_hash`, `expires_at`, `last_seen_at`, `revoked_at`           | Secure login sessions                                                |
| `roles`                 | `id`, `name`, `description`, `is_system_role`                                       | Defines user roles                                                   |
| `permissions`           | `id`, `code`, `module`, `description`                                               | Individual permissions                                               |
| `role_permissions`      | `role_id`, `permission_id`                                                          | Connects roles to permissions                                        |
| `user_role_assignments` | `id`, `user_id`, `role_id`, `department_id`, `assigned_by`                          | Gives a user a role globally or within a department                  |
| `user_preferences`      | `id`, `user_id`, `preference_key`, `preference_value`                               | Stores personal interface preferences                                |

### **How these tables relate**

**app_users**

One ULMS account per person

**auth_identities**

Koha / University SSO identity

**user_sessions**

Active login sessions

**user_role_assignments**

Roles and department scope

**user_preferences**

Personal settings

**roles → role_permissions → permissions**

Determines what users can access and do

### **Suggested initial roles**

| Role                  | Access                                          |
| --------------------- | ----------------------------------------------- |
| Super Administrator   | All departments and system settings             |
| Library Administrator | Library-wide administration                     |
| Head Librarian        | Management of assigned departments              |
| Librarian             | Catalog and circulation operations through Koha |
| Library Assistant     | Limited library operations                      |
| Faculty               | Faculty-facing library services                 |
| Student               | Student portal and library services             |

A user's department-specific role should be represented by `user_role_assignments.department_id`. A `NULL` department can represent a global role, subject to your authorization rules.

**Important authentication note:** Do not store Koha passwords in `user_credentials`. That table is only for accounts whose passwords are managed by ULMS. Also, a Koha API Client Credentials token is not an individual user's login credential.

## **3. Koha integration tables**

These tables manage the connection between your ULMS and the separate Koha installation.

| Table              | Important columns                                                             | Purpose                                   |
| ------------------ | ----------------------------------------------------------------------------- | ----------------------------------------- |
| `koha_instances`   | `id`, `name`, `base_url`, `auth_method`, `secret_reference`, `is_active`      | Koha connection configuration             |
| `koha_sync_jobs`   | `id`, `entity_type`, `sync_direction`, `status`, `started_at`, `completed_at` | Tracks background synchronization         |
| `koha_sync_events` | `id`, `job_id`, `external_id`, `event_type`, `details`, `created_at`          | Records individual synchronization events |
| `koha_api_logs`    | `id`, `endpoint`, `http_method`, `status_code`, `duration_ms`, `created_at`   | Records API activity and failures         |

For example, `auth_identities.koha_borrowernumber` can link a ULMS user to a Koha patron record.

Use Koha's REST API for book searches, patron information, availability, borrowing, returns and other supported operations. Don't directly modify Koha's MariaDB database.

## **4. Notifications and communication**

| Table                      | Important columns                                                               | Purpose                             |
| -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `notification_templates`   | `id`, `name`, `channel`, `subject_template`, `body_template`                    | Reusable notification templates     |
| `notifications`            | `id`, `title`, `body`, `channel`, `status`, `scheduled_at`, `created_by`        | Notification campaigns or messages  |
| `notification_recipients`  | `id`, `notification_id`, `user_id`, `koha_borrowernumber`, `read_at`            | Identifies message recipients       |
| `notification_deliveries`  | `id`, `recipient_id`, `provider`, `delivery_status`, `sent_at`, `error_message` | Tracks email, SMS and push delivery |
| `announcements`            | `id`, `title`, `content`, `status`, `published_at`, `expires_at`, `created_by`  | Library announcements               |
| `announcement_targets`     | `id`, `announcement_id`, `department_id`, `role_id`, `user_id`                  | Controls announcement audience      |
| `announcement_attachments` | `id`, `announcement_id`, `document_id`                                          | Links announcement attachments      |

The recipient table can support users who are not yet registered as ULMS accounts by using a Koha patron identifier where appropriate.

## **5. Document management and digital library**

This group manages files uploaded to your ULMS, their versions, and access permissions.

| Table                      | Important columns                                                                    | Purpose                                    |
| -------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `document_folders`         | `id`, `parent_id`, `name`, `created_by`                                              | Folder hierarchy                           |
| `documents`                | `id`, `folder_id`, `title`, `description`, `storage_key`, `mime_type`, `uploaded_by` | Main document metadata                     |
| `document_versions`        | `id`, `document_id`, `version_number`, `storage_key`, `checksum`, `uploaded_by`      | Document version history                   |
| `document_tags`            | `id`, `name`                                                                         | Document tags                              |
| `document_tag_assignments` | `document_id`, `tag_id`                                                              | Assigns tags to documents                  |
| `document_access_rules`    | `id`, `document_id`, `role_id`, `department_id`, `access_level`                      | Controls who can view or manage a document |

Store the actual files in private storage such as MinIO or a protected NAS. PostgreSQL should hold metadata and storage references, not large file contents.

## **6. Student and faculty portal**

These tables support personalization without duplicating Koha's bibliographic records.

| Table                | Important columns                                               | Purpose                          |
| -------------------- | --------------------------------------------------------------- | -------------------------------- |
| `reading_lists`      | `id`, `user_id`, `name`, `visibility`, `created_at`             | Personal or shared reading lists |
| `reading_list_items` | `id`, `reading_list_id`, `koha_biblionumber`, `added_at`        | Books saved from Koha            |
| `saved_searches`     | `id`, `user_id`, `search_query`, `search_filters`, `created_at` | Saved catalog searches           |

For `reading_list_items`, store the Koha bibliographic ID rather than a second copy of the book's title, author and publication data. Retrieve those details from Koha.

## **7. Inventory and stocktaking**

These tables support local scanning workflows and reconciliation with Koha.

| Table                     | Important columns                                                                             | Purpose                                        |
| ------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `inventory_sessions`      | `id`, `department_id`, `name`, `status`, `started_at`, `completed_at`, `created_by`           | An inventory or stocktaking session            |
| `inventory_scans`         | `id`, `session_id`, `barcode`, `koha_itemnumber`, `scanned_at`, `scanned_by`                  | Records scanned book barcodes                  |
| `inventory_discrepancies` | `id`, `session_id`, `koha_itemnumber`, `discrepancy_type`, `resolution_status`, `resolved_by` | Tracks missing, unexpected or mismatched items |

These are workflow and audit tables. Koha remains the authority for item records and item status.

## **8. RFID and self-service kiosk**

These tables are optional until you implement the hardware features.

| Table               | Important columns                                                            | Purpose                           |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| `rfid_devices`      | `id`, `department_id`, `device_name`, `device_identifier`, `status`          | Registered RFID readers           |
| `rfid_tag_mappings` | `id`, `tag_uid`, `koha_itemnumber`, `assigned_at`                            | Links RFID tags to Koha items     |
| `rfid_events`       | `id`, `device_id`, `tag_uid`, `event_type`, `event_time`, `details`          | RFID scan and device activity     |
| `kiosk_devices`     | `id`, `department_id`, `device_name`, `location`, `status`                   | Registered self-service terminals |
| `kiosk_sessions`    | `id`, `kiosk_id`, `started_at`, `ended_at`, `session_status`                 | Kiosk usage sessions              |
| `kiosk_events`      | `id`, `session_id`, `event_type`, `koha_itemnumber`, `event_time`, `details` | Kiosk operations and errors       |

The kiosk should call Koha for supported circulation operations. Do not create a second checkout system in PostgreSQL.

## **9. Payments, reports and system administration**

| Table                  | Important columns                                                                                        | Purpose                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `payment_transactions` | `id`, `user_id`, `koha_accountline_id`, `amount`, `currency`, `provider`, `provider_reference`, `status` | External payment-gateway transaction tracking, if required |
| `payment_events`       | `id`, `payment_transaction_id`, `event_type`, `payload`, `created_at`                                    | Payment webhook and status history                         |
| `report_definitions`   | `id`, `name`, `description`, `query_key`, `is_active`                                                    | Registered reports                                         |
| `report_runs`          | `id`, `report_id`, `requested_by`, `parameters`, `status`, `started_at`, `completed_at`                  | Report execution history                                   |
| `report_exports`       | `id`, `report_run_id`, `file_key`, `file_format`, `expires_at`                                           | Generated report files                                     |
| `audit_logs`           | `id`, `user_id`, `action`, `module`, `entity_type`, `entity_id`, `ip_address`, `created_at`              | Security and application activity history                  |
| `system_settings`      | `id`, `setting_key`, `setting_value`, `updated_by`, `updated_at`                                         | Application configuration                                  |
| `background_jobs`      | `id`, `job_type`, `status`, `payload`, `started_at`, `completed_at`, `error_message`                     | Tracks important background operations                     |

Only implement payment tables if you actually integrate a payment gateway. Koha remains the authority for fines and account balances. Never store payment-card information or sensitive payment credentials in these tables.

## **10. Department records to initialize**

Create these five records in `library_departments`:

| Code       | Department name            |
| ---------- | -------------------------- |
| `COLLEGE`  | College Library            |
| `JHS`      | Junior High School Library |
| `SHS`      | Senior High School Library |
| `GRADE`    | Grade School Library       |
| `GRADUATE` | Graduate School Library    |

The `koha_branchcode` field should be populated with the corresponding Koha branch code only after you confirm the actual branch configuration. Don't assume the codes match these examples.

## **11. Recommended relationships**

Here are the main relationships for the PostgreSQL schema:

**Identity and access**

- `app_users` → `auth_identities`
- `app_users` → `user_sessions`
- `app_users` → `user_role_assignments`
- `roles` → `role_permissions` → `permissions`
- `library_departments` → `user_role_assignments`

**Notifications**

- `notifications` → `notification_recipients`
- `notification_recipients` → `notification_deliveries`
- `announcements` → `announcement_targets`

**Documents**

- `document_folders` → `documents`
- `documents` → `document_versions`
- `documents` → `document_tag_assignments` → `document_tags`
- `documents` → `document_access_rules`

**Inventory**

- `inventory_sessions` → `inventory_scans`
- `inventory_sessions` → `inventory_discrepancies`

**Reports and audit**

- `report_definitions` → `report_runs` → `report_exports`
- `app_users` → `audit_logs`

## **12. Which tables should you implement first?**

I would not implement all these tables in the first development phase. Build the foundational database first, then add module-specific tables as those features are developed.

| Development phase              | Tables                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Phase 1 – Foundation           | Departments, users, identities, credentials if needed, sessions, roles, permissions, role permissions, role assignments |
| Phase 2 – Koha integration     | Koha instances, sync jobs, sync events, API logs                                                                        |
| Phase 3 – Main application     | Notifications, recipients, deliveries, announcements, targets                                                           |
| Phase 4 – Documents and portal | Folders, documents, versions, tags, reading lists, saved searches                                                       |
| Phase 5 – Library operations   | Inventory sessions, scans, discrepancies, RFID and kiosk tables                                                         |
| Phase 6 – Administration       | Payments if needed, reports, exports, audit logs, settings, background jobs                                             |

### **Important PostgreSQL implementation rules**

For this project, I recommend:

- Use UUID primary keys for ULMS-owned entities.
- Use `TIMESTAMPTZ` for timestamps.
- Use `JSONB` for flexible configuration and event metadata, not for replacing relational tables.
- Add foreign keys and indexes for frequently queried relationships.
- Use database migrations with Alembic.
- Keep database credentials separate for application runtime and migrations.
- Use an application database role with limited permissions, not a PostgreSQL superuser.
- Make audit logs append-only through application permissions and database controls.
- Store password hashes using Argon2id only for locally managed accounts.
- Store session token hashes, not raw session tokens.

Recommended architecture

**PostgreSQL:** ULMS accounts, access control, documents, notifications, reports, and application workflows.

**Koha:** Bibliographic catalog, patrons, items, circulation, reservations, fines, acquisitions, and serials.

**FastAPI:** Connects these two systems and enforces the ULMS business rules.

My recommendation is to turn this into an actual PostgreSQL database design next, with complete `CREATE TABLE` statements, UUID relationships, foreign keys, indexes, constraints, and an Alembic initial migration.
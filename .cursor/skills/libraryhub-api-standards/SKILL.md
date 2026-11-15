---
name: libraryhub-api-standards
description: >-
  Use for libraryhub FastAPI endpoints — Pydantic validation, `/api/v1` prefixes,
  health/readiness, error envelopes, pagination allowlists, OpenAPI accuracy.
---

# libraryhub API standards

## Prefix and modules

- Base: `/api/v1` via `app.core.config.Settings.api_v1_prefix`.
- Group routes under `apps/api/app/api/routes/` (expand by domain as in `plan/plan.md` §8).
- Koha operations behind `integrations/koha` and dedicated routes under `/api/v1/integrations/koha` when added.

## Requests and responses

- Validate with Pydantic v2 schemas; never return ORM objects directly.
- Use consistent error `detail` for clients; log diagnostics server-side with request IDs.
- Paginate collections; allowlist sort/filter fields — no raw SQL interpolation.

## Auth (when implemented)

- Enforce department-aware RBAC in services and routes, not only in the UI.
- Session/cookie or OIDC per university policy; secrets only in server env.

## Koha calls

- Central HTTPX client with timeouts and structured errors.
- Map Koha payloads to internal schemas; surface capability gaps via feature flags / UI messaging.

## Testing

- Add API tests under `apps/api/tests/api/` for new endpoints.
- Mock Koha for local runs; contract tests against staging when approved.
---
name: libraryhub-ai-coding-standards
description: >-
  Load FIRST for any libraryhub code change. Routes to other libraryhub-* skills,
  enforces plan boundaries (Koha REST only, PostgreSQL for ULMS data), and matches
  the apps/web + apps/api monorepo. Triggers on implement, fix, refactor, or new
  features in this repository.
---

# libraryhub AI coding standards

**ULMS** — Next.js 16 + FastAPI + standalone PostgreSQL; Koha is system of record for library data.

## Order of operations

1. Clarify the workflow (staff vs student, department scope).
2. Read the closest existing vertical (health API, Koha integration stubs, app shell).
3. Load routed skills (table below).
4. State assumptions before generating code.
5. Implement minimal diff; match existing patterns.
6. Run lint/tests for touched areas.
7. Report what was verified.

## Analyse before generating

```bash
cat package.json apps/api/pyproject.toml apps/web/package.json
ls apps/api/app apps/web/app
cat plan/tech-stack.md docs/architecture.md AGENTS.md
```

Do not connect the browser to PostgreSQL or Koha MariaDB. Do not duplicate Koha catalog as a second source of truth.

## Routing table

| Task involves | Load |
|---|---|
| Layering, new module placement | `libraryhub-architecture` |
| FastAPI routes, schemas, `/api/v1` | `libraryhub-api-standards` |
| Compose, CI, nginx, local DB | `libraryhub-devops-deployment` |
| Generated UI, shadcn, layout | `design-system` (if present) + antislop skills per AGENTS.md |
| Before claiming done | existing checklists in routed skills |

## References

- `plan/plan.md`, `plan/tech-stack.md`
- `docs/data-ownership.md`, `docs/koha-integration.md`
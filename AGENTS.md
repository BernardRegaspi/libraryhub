<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read the `antislop` skill (core, installed as the Cursor plugin `anti-slop`) and then the skill for the task:
- UI / visual: `antislop-ui`
- Copy & text: `antislop-copywriting`
- People: `antislop-human`
- Mobile / responsive: `antislop-layoutmobile`
- Code comments: `antislop-code`
Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->

## Monorepo

| Path | Role |
|------|------|
| `apps/web` | Next.js 16 ULMS UI |
| `apps/api` | FastAPI modular monolith |
| `infrastructure/` | Docker, Postgres notes, Nginx, monitoring |
| `docs/` | Architecture, security, developer setup |
| `plan/` | Implementation plan and tech stack |
| `docs/superpowers/` | Superpowers specs and implementation plans |

## AI skills (Cursor)

Load `libraryhub-ai-coding-standards` first for any code change; it routes to the other `.cursor/skills/libraryhub-*` skills.

## Boundaries

- Browser → FastAPI → PostgreSQL for ULMS-owned data.
- Koha is system of record for library records; integrate via REST only (`apps/api/app/integrations/koha/`).
- Never expose database or Koha credentials in `NEXT_PUBLIC_*` variables.
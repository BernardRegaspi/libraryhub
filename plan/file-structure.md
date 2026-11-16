# Repository file structure

Canonical layout from `plan/plan.md` §3.5, aligned with **comshop / BrgyCloud** `apps/` monorepo conventions.

```text
libraryhub/
├── apps/
│   ├── web/                     # Next.js ULMS UI (was `frontend/`)
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── services/
│   │   ├── types/
│   │   ├── public/
│   │   └── tests/
│   └── api/                     # FastAPI (was `backend/`)
│       ├── app/
│       │   ├── api/
│       │   ├── core/
│       │   ├── database/
│       │   ├── integrations/koha/
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── services/
│       │   └── main.py
│       ├── alembic/
│       └── tests/
├── infrastructure/
│   ├── docker/
│   ├── postgres/
│   ├── koha/
│   ├── nginx/
│   ├── monitoring/
│   ├── backups/
│   └── scripts/
├── docs/
│   ├── superpowers/             # Specs and plans (Superpowers workflow)
│   └── decisions/
├── plan/
├── .cursor/                     # Rules and libraryhub-* skills
├── .superpowers/sdd/            # Ephemeral SDD output (gitignored)
├── docker-compose.yml           # Local PostgreSQL + Redis
├── package.json                 # npm workspaces root
├── .env.example
├── LICENSE
├── AGENTS.md
└── README.md
```

Do not commit database dumps, Koha credentials, signing keys, or backup archives.
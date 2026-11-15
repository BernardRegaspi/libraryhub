# Koha (library system of record)

Koha is deployed on its own VM with MariaDB and the search engine supported by the selected Koha release. This repository does not contain Koha application code or database dumps.

ULMS integrates with Koha only through the Koha REST API (`apps/api/app/integrations/koha/`).

## In this repo

- Configuration notes and capability matrix drafts live in `docs/koha-integration.md`.
- No credentials, dumps, or production config files belong in git.

## References

- `plan/plan.md` §1.3, §4.2
- Official Koha releases: https://koha-community.org/download-koha/
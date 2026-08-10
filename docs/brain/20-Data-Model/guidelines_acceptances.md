---
type: table
table: guidelines_acceptances
summary: 4 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `guidelines_acceptances`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, NOT NULL, → users.id |
| `version` | TEXT | PK, NOT NULL, → guidelines_versions.version |
| `accepted_at` | INTEGER | NOT NULL, default unixepoch() |
| `request_id` | TEXT |  |

## Foreign keys

- `version` → `guidelines_versions.version` (on delete NO ACTION)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `guidelines_acceptances_version_idx`
- `sqlite_autoindex_guidelines_acceptances_1` (unique)

## Triggers

- `trg_guidelines_acceptance_immutable`


Back to [[ERD]].

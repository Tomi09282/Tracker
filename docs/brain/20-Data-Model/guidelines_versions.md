---
type: table
table: guidelines_versions
summary: 4 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `guidelines_versions`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `version` | TEXT | PK, NOT NULL |
| `i18n_key` | TEXT | NOT NULL |
| `published_at` | INTEGER | NOT NULL, default unixepoch() |
| `active` | INTEGER | NOT NULL, default 0 |


## Indexes

- `guidelines_versions_one_active_idx` (unique) (partial)
- `sqlite_autoindex_guidelines_versions_1` (unique)


## Constraints

- `version NOT GLOB '*[^0-9.]*' AND length(version`
- `length(i18n_key`
- `active IN (0,1`

Back to [[ERD]].

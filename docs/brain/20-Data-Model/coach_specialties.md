---
type: table
table: coach_specialties
summary: 4 columns, 14 rows
rows: 14
tags: [data-model, generated]
---

# `coach_specialties`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `i18n_key` | TEXT | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, default 0 |
| `active` | INTEGER | NOT NULL, default 1 |


## Indexes

- `sqlite_autoindex_coach_specialties_1` (unique)


## Constraints

- `key NOT GLOB '*[^a-z_]*' AND length(key`
- `length(i18n_key`
- `active IN (0,1`

Back to [[ERD]].

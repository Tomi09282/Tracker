---
type: table
table: muscle_groups
summary: 5 columns, 20 rows
rows: 20
tags: [data-model, generated]
---

# `muscle_groups`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `slug` | TEXT | NOT NULL |
| `name` | TEXT | NOT NULL |
| `body_side` | TEXT | NOT NULL, default 'front' |
| `sort_order` | INTEGER | NOT NULL, default 0 |


## Indexes

- `sqlite_autoindex_muscle_groups_1` (unique)


## Constraints

- `body_side IN ('front', 'back', 'both'`

Back to [[ERD]].

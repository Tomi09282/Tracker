---
type: table
table: equipment
summary: 4 columns, 16 rows
rows: 16
tags: [data-model, generated]
---

# `equipment`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `slug` | TEXT | NOT NULL |
| `name` | TEXT | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, default 0 |


## Indexes

- `sqlite_autoindex_equipment_1` (unique)



Back to [[ERD]].

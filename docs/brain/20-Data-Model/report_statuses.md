---
type: table
table: report_statuses
summary: 3 columns, 5 rows
rows: 5
tags: [data-model, generated]
---

# `report_statuses`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `is_terminal` | INTEGER | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, default 0 |


## Indexes

- `sqlite_autoindex_report_statuses_1` (unique)


## Constraints

- `key NOT GLOB '*[^a-z_]*' AND length(key`
- `is_terminal IN (0,1`

Back to [[ERD]].

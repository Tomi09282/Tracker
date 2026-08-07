---
type: table
table: report_reasons
summary: 5 columns, 12 rows
rows: 12
tags: [data-model, generated]
---

# `report_reasons`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `reportable` | INTEGER | NOT NULL, default 1 |
| `severity_rank` | INTEGER | NOT NULL, default 0 |
| `sort_order` | INTEGER | NOT NULL, default 0 |
| `active` | INTEGER | NOT NULL, default 1 |


## Indexes

- `sqlite_autoindex_report_reasons_1` (unique)


## Constraints

- `key NOT GLOB '*[^a-z_]*' AND length(key`
- `reportable IN (0,1`
- `active IN (0,1`

Back to [[ERD]].

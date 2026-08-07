---
type: table
table: measurement_metrics
summary: 6 columns, 15 rows
rows: 15
tags: [data-model, generated]
---

# `measurement_metrics`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK |
| `unit` | TEXT | NOT NULL |
| `min_x1000` | INTEGER | NOT NULL |
| `max_x1000` | INTEGER | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, default 0 |
| `active` | INTEGER | NOT NULL, default 1 |


## Indexes

- `sqlite_autoindex_measurement_metrics_1` (unique)


## Constraints

- `key GLOB '[a-z][a-z_]*'`
- `unit IN ('kg', 'cm', 'pct'`
- `max_x1000 > min_x1000`
- `active IN (0, 1`

Back to [[ERD]].

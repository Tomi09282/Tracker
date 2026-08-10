---
type: table
table: body_measurements
summary: 8 columns, 10 rows
rows: 10
tags: [data-model, generated]
---

# `body_measurements`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `client_user_id` | INTEGER | NOT NULL, → users.id |
| `metric_key` | TEXT | NOT NULL, → measurement_metrics.key |
| `measured_on` | TEXT | NOT NULL |
| `value_x1000` | INTEGER | NOT NULL |
| `note` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `metric_key` → `measurement_metrics.key` (on delete RESTRICT)
- `client_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `body_measurements_trend_idx`
- `sqlite_autoindex_body_measurements_1` (unique)

## Triggers

- `trg_body_measurements_touch`
- `trg_measurement_in_range_ins`
- `trg_measurement_in_range_upd`
- `trg_measurement_metric_active`

## Constraints

- `measured_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
- `value_x1000 > 0`
- `note IS NULL OR length(note`

Back to [[ERD]].

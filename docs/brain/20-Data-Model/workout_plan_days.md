---
type: table
table: workout_plan_days
summary: 11 columns, 14 rows
rows: 14
tags: [data-model, generated]
---

# `workout_plan_days`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-05.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_id` | INTEGER | NOT NULL, → workout_plans.id |
| `day_index` | INTEGER | NOT NULL |
| `slot` | INTEGER | NOT NULL, default 0 |
| `name` | TEXT | NOT NULL |
| `notes` | TEXT |  |
| `is_rest` | INTEGER | NOT NULL, default 0 |
| `est_minutes` | INTEGER |  |
| `start_time` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `plan_id` → `workout_plans.id` (on delete CASCADE)

## Indexes

- `workout_plan_days_slot_unique` (unique)

## Triggers

- `trg_plan_day_count_cap`
- `trg_plan_day_in_cycle_ins`
- `trg_plan_day_in_cycle_upd`
- `trg_plan_rev_days_del`
- `trg_plan_rev_days_ins`
- `trg_plan_rev_days_upd`
- `trg_workout_plan_days_touch`

## Constraints

- `typeof(day_index`
- `typeof(slot`
- `length(trim(name`
- `notes IS NULL OR length(notes`
- `is_rest IN (0, 1`
- `est_minutes IS NULL OR est_minutes BETWEEN 5 AND 300`
- `start_time IS NULL OR (length(start_time`

Back to [[ERD]].

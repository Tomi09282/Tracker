---
type: table
table: workout_plan_day_exceptions
summary: 9 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `workout_plan_day_exceptions`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_id` | INTEGER | NOT NULL, → workout_plans.id |
| `day_id` | INTEGER | NOT NULL, → workout_plan_days.id |
| `occurrence_date` | TEXT | NOT NULL |
| `action` | TEXT | NOT NULL |
| `moved_to_date` | TEXT |  |
| `reason` | TEXT |  |
| `created_by` | INTEGER | → users.id |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `created_by` → `users.id` (on delete SET NULL)
- `day_id` → `workout_plan_days.id` (on delete CASCADE)
- `plan_id` → `workout_plans.id` (on delete CASCADE)

## Indexes

- `workout_plan_day_exceptions_plan_idx`
- `workout_plan_day_exceptions_unique` (unique)

## Triggers

- `trg_plan_exception_parent_ins`

## Constraints

- `occurrence_date = date(occurrence_date`
- `action IN ('skip', 'move'`
- `moved_to_date IS NULL OR moved_to_date = date(moved_to_date`
- `reason IS NULL OR length(reason`
- `action <> 'move' OR moved_to_date IS NOT NULL`
- `action <> 'skip' OR moved_to_date IS NULL`

Back to [[ERD]].

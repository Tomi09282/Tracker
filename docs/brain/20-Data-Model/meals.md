---
type: table
table: meals
summary: 9 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `meals`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_id` | INTEGER | NOT NULL, → nutrition_plans.id |
| `day_id` | INTEGER | NOT NULL, → nutrition_plan_days.id |
| `position` | INTEGER | NOT NULL |
| `name` | TEXT | NOT NULL |
| `time_hint` | TEXT |  |
| `notes` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `day_id` → `nutrition_plan_days.id` (on delete CASCADE)
- `plan_id` → `nutrition_plans.id` (on delete CASCADE)

## Indexes

- `meals_plan_idx`
- `meals_day_idx`

## Triggers

- `trg_meal_count_cap`
- `trg_meal_parent_ins`
- `trg_meal_parent_upd`
- `trg_meals_touch`

## Constraints

- `position >= 0`
- `length(trim(name`
- `time_hint IS NULL OR time_hint GLOB '[0-2][0-9]:[0-5][0-9]'`
- `notes IS NULL OR length(notes`

Back to [[ERD]].

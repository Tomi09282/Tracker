---
type: table
table: nutrition_plan_days
summary: 11 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `nutrition_plan_days`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_id` | INTEGER | NOT NULL, → nutrition_plans.id |
| `day_index` | INTEGER | NOT NULL |
| `name` | TEXT |  |
| `kcal_target_x10` | INTEGER |  |
| `protein_mg_target` | INTEGER |  |
| `carb_mg_target` | INTEGER |  |
| `fat_mg_target` | INTEGER |  |
| `notes` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `plan_id` → `nutrition_plans.id` (on delete CASCADE)

## Indexes

- `sqlite_autoindex_nutrition_plan_days_1` (unique)

## Triggers

- `trg_nutrition_day_in_cycle_ins`
- `trg_nutrition_day_in_cycle_upd`
- `trg_nutrition_plan_days_touch`

## Constraints

- `day_index >= 0`
- `name IS NULL OR length(trim(name`
- `kcal_target_x10 IS NULL OR kcal_target_x10 BETWEEN 0 AND 150000`
- `protein_mg_target IS NULL OR protein_mg_target BETWEEN 0 AND 1000000`
- `carb_mg_target IS NULL OR carb_mg_target BETWEEN 0 AND 2000000`
- `fat_mg_target IS NULL OR fat_mg_target BETWEEN 0 AND 1000000`
- `notes IS NULL OR length(notes`

Back to [[ERD]].

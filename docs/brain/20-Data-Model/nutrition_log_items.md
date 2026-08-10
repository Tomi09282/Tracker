---
type: table
table: nutrition_log_items
summary: 16 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `nutrition_log_items`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `client_user_id` | INTEGER | NOT NULL, → users.id |
| `local_date` | TEXT | NOT NULL |
| `tz_name` | TEXT |  |
| `meal_label` | TEXT |  |
| `plan_day_id` | INTEGER | → nutrition_plan_days.id |
| `food_id` | INTEGER | → foods.id |
| `grams_x10` | INTEGER | NOT NULL |
| `food_name_snapshot` | TEXT | NOT NULL |
| `kcal_per_100g_x10_snapshot` | INTEGER | NOT NULL |
| `protein_mg_per_100g_snapshot` | INTEGER | NOT NULL |
| `carb_mg_per_100g_snapshot` | INTEGER | NOT NULL |
| `fat_mg_per_100g_snapshot` | INTEGER | NOT NULL |
| `fiber_mg_per_100g_snapshot` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `food_id` → `foods.id` (on delete SET NULL)
- `plan_day_id` → `nutrition_plan_days.id` (on delete SET NULL)
- `client_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `nutrition_log_items_plan_day_idx` (partial)
- `nutrition_log_items_food_idx` (partial)
- `nutrition_log_items_day_idx`

## Triggers

- `trg_nutrition_log_day_cap`
- `trg_nutrition_log_items_touch`

## Constraints

- `local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
- `tz_name IS NULL OR length(tz_name`
- `meal_label IS NULL OR length(trim(meal_label`
- `grams_x10 BETWEEN 1 AND 5000000`
- `length(trim(food_name_snapshot`
- `kcal_per_100g_x10_snapshot BETWEEN 0 AND 9000`
- `protein_mg_per_100g_snapshot BETWEEN 0 AND 100000`
- `carb_mg_per_100g_snapshot BETWEEN 0 AND 100000`
- `fat_mg_per_100g_snapshot BETWEEN 0 AND 100000`
- `fiber_mg_per_100g_snapshot IS NULL OR fiber_mg_per_100g_snapshot BETWEEN 0 AND 100000`

Back to [[ERD]].

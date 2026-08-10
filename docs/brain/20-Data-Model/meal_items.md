---
type: table
table: meal_items
summary: 15 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `meal_items`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_id` | INTEGER | NOT NULL, → nutrition_plans.id |
| `meal_id` | INTEGER | NOT NULL, → meals.id |
| `food_id` | INTEGER | → foods.id |
| `position` | INTEGER | NOT NULL |
| `grams_x10` | INTEGER | NOT NULL |
| `food_name_snapshot` | TEXT | NOT NULL |
| `kcal_per_100g_x10_snapshot` | INTEGER | NOT NULL |
| `protein_mg_per_100g_snapshot` | INTEGER | NOT NULL |
| `carb_mg_per_100g_snapshot` | INTEGER | NOT NULL |
| `fat_mg_per_100g_snapshot` | INTEGER | NOT NULL |
| `fiber_mg_per_100g_snapshot` | INTEGER |  |
| `note` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `food_id` → `foods.id` (on delete SET NULL)
- `meal_id` → `meals.id` (on delete CASCADE)
- `plan_id` → `nutrition_plans.id` (on delete CASCADE)

## Indexes

- `meal_items_food_idx` (partial)
- `meal_items_plan_idx`
- `meal_items_meal_idx`

## Triggers

- `trg_meal_item_count_cap`
- `trg_meal_item_parent_ins`
- `trg_meal_item_parent_upd`
- `trg_meal_items_touch`

## Constraints

- `position >= 0`
- `grams_x10 BETWEEN 1 AND 5000000`
- `length(trim(food_name_snapshot`
- `kcal_per_100g_x10_snapshot BETWEEN 0 AND 9000`
- `protein_mg_per_100g_snapshot BETWEEN 0 AND 100000`
- `carb_mg_per_100g_snapshot BETWEEN 0 AND 100000`
- `fat_mg_per_100g_snapshot BETWEEN 0 AND 100000`
- `fiber_mg_per_100g_snapshot IS NULL OR fiber_mg_per_100g_snapshot BETWEEN 0 AND 100000`
- `note IS NULL OR length(note`

Back to [[ERD]].

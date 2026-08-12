---
type: table
table: nutrition_plans
summary: 18 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `nutrition_plans`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `scope` | TEXT | NOT NULL, default 'template' |
| `author_user_id` | INTEGER | → users.id |
| `coach_client_id` | INTEGER | → coach_clients.id |
| `client_user_id` | INTEGER | → users.id |
| `source_plan_id` | INTEGER | → nutrition_plans.id |
| `source_revision` | INTEGER |  |
| `name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL |
| `description` | TEXT |  |
| `goal` | TEXT |  |
| `cycle_days` | INTEGER | NOT NULL, default 7 |
| `starts_on` | TEXT |  |
| `status` | TEXT | NOT NULL, default 'draft' |
| `revision` | INTEGER | NOT NULL, default 1 |
| `archived_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `source_plan_id` → `nutrition_plans.id` (on delete SET NULL)
- `client_user_id` → `users.id` (on delete CASCADE)
- `coach_client_id` → `coach_clients.id` (on delete CASCADE)
- `author_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `nutrition_plans_name_idx`
- `nutrition_plans_link_idx`
- `nutrition_plans_client_idx`
- `nutrition_plans_author_idx`

## Triggers

- `trg_nutrition_cycle_shrink`
- `trg_nutrition_plan_link_client_ins`
- `trg_nutrition_plan_link_client_upd`
- `trg_nutrition_plan_scope_frozen`
- `trg_nutrition_plans_touch`

## Constraints

- `scope IN ('template', 'client', 'personal', 'system'`
- `source_revision IS NULL OR source_revision > 0`
- `length(trim(name`
- `description IS NULL OR length(description`
- `goal IS NULL OR goal IN ( 'strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport'`
- `cycle_days BETWEEN 1 AND 28`
- `starts_on IS NULL OR starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
- `status IN ('draft', 'active', 'paused', 'completed'`
- `revision > 0`
- `(scope = 'client' AND coach_client_id IS NOT NULL AND client_user_id IS NOT NULL`

Back to [[ERD]].

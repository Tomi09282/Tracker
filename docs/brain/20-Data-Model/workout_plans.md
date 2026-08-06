---
type: table
table: workout_plans
summary: 20 columns, 11 rows
rows: 11
tags: [data-model, generated]
---

# `workout_plans`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `scope` | TEXT | NOT NULL, default 'template' |
| `author_user_id` | INTEGER | → users.id |
| `coach_client_id` | INTEGER | → coach_clients.id |
| `client_user_id` | INTEGER | → users.id |
| `source_plan_id` | INTEGER | → workout_plans.id |
| `source_revision` | INTEGER |  |
| `name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL |
| `description` | TEXT |  |
| `goal` | TEXT |  |
| `experience` | TEXT |  |
| `cycle_days` | INTEGER | NOT NULL, default 7 |
| `starts_on` | TEXT |  |
| `ends_on` | TEXT |  |
| `status` | TEXT | NOT NULL, default 'draft' |
| `revision` | INTEGER | NOT NULL, default 1 |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |
| `archived_at` | INTEGER |  |

## Foreign keys

- `source_plan_id` → `workout_plans.id` (on delete SET NULL)
- `client_user_id` → `users.id` (on delete CASCADE)
- `coach_client_id` → `coach_clients.id` (on delete CASCADE)
- `author_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `workout_plans_name_idx`
- `workout_plans_system_idx` (partial)
- `workout_plans_source_idx` (partial)
- `workout_plans_link_idx`
- `workout_plans_client_idx`
- `workout_plans_author_idx`

## Triggers

- `trg_plan_cycle_shrink`
- `trg_plan_link_client_ins`
- `trg_plan_link_client_upd`
- `trg_plan_scope_frozen`
- `trg_plan_source_owned_ins`
- `trg_plan_source_owned_upd`
- `trg_workout_plans_touch`

## Constraints

- `scope IN ('template', 'client', 'personal', 'system'`
- `source_revision IS NULL OR source_revision > 0`
- `length(trim(name`
- `description IS NULL OR length(description`
- `goal IS NULL OR goal IN ( 'strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport'`
- `experience IS NULL OR experience IN ( 'none', 'beginner', 'intermediate', 'advanced'`
- `cycle_days BETWEEN 1 AND 56`
- `starts_on IS NULL OR starts_on = date(starts_on`
- `ends_on IS NULL OR ends_on = date(ends_on`
- `status IN ('draft', 'active', 'paused', 'ended'`
- `revision > 0`
- `(scope = 'template' AND author_user_id IS NOT NULL AND client_user_id IS NULL AND coach_client_id IS NULL`

Back to [[ERD]].

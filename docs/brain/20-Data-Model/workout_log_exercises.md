---
type: table
table: workout_log_exercises
summary: 15 columns, 16 rows
rows: 16
tags: [data-model, generated]
---

# `workout_log_exercises`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-05.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `log_id` | INTEGER | NOT NULL, → workout_logs.id |
| `client_user_id` | INTEGER | NOT NULL, → users.id |
| `exercise_id` | INTEGER | → exercises.id |
| `exercise_name_snapshot` | TEXT | NOT NULL |
| `plan_exercise_id` | INTEGER | → workout_plan_exercises.id |
| `origin` | TEXT | NOT NULL, default 'plan' |
| `substituted_for_exercise_id` | INTEGER | → exercises.id |
| `block_kind` | TEXT | NOT NULL, default 'single' |
| `block_ordinal` | INTEGER | NOT NULL, default 0 |
| `position` | INTEGER | NOT NULL, default 0 |
| `target_metric` | TEXT | NOT NULL, default 'reps' |
| `load_mode` | TEXT | NOT NULL, default 'external' |
| `notes` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `substituted_for_exercise_id` → `exercises.id` (on delete SET NULL)
- `plan_exercise_id` → `workout_plan_exercises.id` (on delete SET NULL)
- `exercise_id` → `exercises.id` (on delete SET NULL)
- `client_user_id` → `users.id` (on delete CASCADE)
- `log_id` → `workout_logs.id` (on delete CASCADE)

## Indexes

- `workout_log_exercises_hist_idx`
- `workout_log_exercises_log_idx`

## Triggers

- `trg_log_exercise_identity`
- `trg_log_exercise_parent_ins`
- `trg_log_exercise_parent_upd`
- `trg_log_exercise_visible_ins`

## Constraints

- `length(trim(exercise_name_snapshot`
- `origin IN ('plan', 'added', 'substituted'`
- `block_kind IN ('single', 'superset', 'circuit', 'emom', 'amrap'`
- `typeof(block_ordinal`
- `typeof(position`
- `target_metric IN ('reps', 'time', 'distance'`
- `load_mode IN ('external', 'bodyweight', 'weighted_bodyweight', 'assisted'`
- `notes IS NULL OR length(notes`

Back to [[ERD]].

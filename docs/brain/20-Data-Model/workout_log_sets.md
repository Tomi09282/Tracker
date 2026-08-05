---
type: table
table: workout_log_sets
summary: 31 columns, 54 rows
rows: 54
tags: [data-model, generated]
---

# `workout_log_sets`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-05.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `log_exercise_id` | INTEGER | NOT NULL, → workout_log_exercises.id |
| `log_id` | INTEGER | NOT NULL, → workout_logs.id |
| `client_user_id` | INTEGER | NOT NULL, → users.id |
| `exercise_id` | INTEGER | → exercises.id |
| `local_date` | TEXT | NOT NULL |
| `plan_set_target_id` | INTEGER | → workout_plan_set_targets.id |
| `set_index` | INTEGER | NOT NULL |
| `set_kind` | TEXT | NOT NULL, default 'straight' |
| `target_reps` | INTEGER |  |
| `target_seconds` | INTEGER |  |
| `target_distance_m` | INTEGER |  |
| `target_weight_kg` | REAL |  |
| `target_rpe` | REAL |  |
| `target_rest_seconds` | INTEGER |  |
| `weight_kg` | REAL |  |
| `entry_unit` | TEXT |  |
| `entry_value` | REAL |  |
| `reps` | INTEGER |  |
| `seconds` | INTEGER |  |
| `distance_m` | INTEGER |  |
| `rpe` | REAL |  |
| `rest_taken_seconds` | INTEGER |  |
| `load_mode` | TEXT | NOT NULL, default 'external' |
| `bodyweight_kg` | REAL |  |
| `completed_at` | INTEGER |  |
| `write_uid` | TEXT |  |
| `voided_at` | INTEGER |  |
| `voided_reason` | TEXT |  |
| `corrects_set_id` | INTEGER | → workout_log_sets.id |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `corrects_set_id` → `workout_log_sets.id` (on delete SET NULL)
- `plan_set_target_id` → `workout_plan_set_targets.id` (on delete SET NULL)
- `exercise_id` → `exercises.id` (on delete SET NULL)
- `client_user_id` → `users.id` (on delete CASCADE)
- `log_id` → `workout_logs.id` (on delete CASCADE)
- `log_exercise_id` → `workout_log_exercises.id` (on delete CASCADE)

## Indexes

- `workout_log_sets_exercise_idx` (partial)
- `workout_log_sets_e1rm_idx` (partial)
- `workout_log_sets_repmax_idx` (partial)
- `workout_log_sets_progress_idx` (partial)
- `workout_log_sets_log_idx`
- `workout_log_sets_slot_unique` (unique)

## Triggers

- `trg_log_rollup_recompute_del`
- `trg_log_rollup_recompute_ins`
- `trg_log_rollup_recompute_upd`
- `trg_log_set_frozen`
- `trg_log_set_parent_ins`
- `trg_log_set_parent_upd`
- `trg_log_set_server_columns`
- `trg_log_set_void_terminal`

## Constraints

- `local_date = date(local_date`
- `typeof(set_index`
- `set_kind IN ('straight', 'warmup', 'drop', 'backoff', 'amrap', 'failure'`
- `target_reps IS NULL OR (typeof(target_reps`
- `target_seconds IS NULL OR (typeof(target_seconds`
- `target_distance_m IS NULL OR (typeof(target_distance_m`
- `target_weight_kg IS NULL OR (target_weight_kg >= 0 AND target_weight_kg <= 1000`
- `target_rpe IS NULL OR target_rpe IN (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10`
- `target_rest_seconds IS NULL OR target_rest_seconds BETWEEN 0 AND 3600`
- `weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000`
- `entry_unit IS NULL OR entry_unit IN ('kg', 'lb'`
- `entry_value IS NULL OR (entry_value >= 0 AND entry_value <= 2500`

Back to [[ERD]].

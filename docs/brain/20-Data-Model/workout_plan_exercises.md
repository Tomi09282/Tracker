---
type: table
table: workout_plan_exercises
summary: 23 columns, 15 rows
rows: 15
tags: [data-model, generated]
---

# `workout_plan_exercises`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_id` | INTEGER | NOT NULL, → workout_plans.id |
| `block_id` | INTEGER | NOT NULL, → workout_plan_blocks.id |
| `exercise_id` | INTEGER | → exercises.id |
| `exercise_name_snapshot` | TEXT | NOT NULL |
| `position` | INTEGER | NOT NULL, default 0 |
| `target_metric` | TEXT | NOT NULL, default 'reps' |
| `load_mode` | TEXT | NOT NULL, default 'external' |
| `target_sets` | INTEGER | NOT NULL, default 3 |
| `target_reps_min` | INTEGER |  |
| `target_reps_max` | INTEGER |  |
| `target_seconds` | INTEGER |  |
| `target_distance_m` | INTEGER |  |
| `target_weight_kg` | REAL |  |
| `target_weight_entry_unit` | TEXT |  |
| `target_weight_entry_value` | REAL |  |
| `target_percent_1rm` | REAL |  |
| `target_rpe` | REAL |  |
| `rest_seconds` | INTEGER |  |
| `tempo` | TEXT |  |
| `notes` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `exercise_id` → `exercises.id` (on delete SET NULL)
- `block_id` → `workout_plan_blocks.id` (on delete CASCADE)
- `plan_id` → `workout_plans.id` (on delete CASCADE)

## Indexes

- `workout_plan_exercises_exercise_idx` (partial)
- `workout_plan_exercises_plan_idx`
- `workout_plan_exercises_block_idx`

## Triggers

- `trg_plan_exercise_count_cap`
- `trg_plan_exercise_parent_ins`
- `trg_plan_exercise_parent_upd`
- `trg_plan_exercise_visible_ins`
- `trg_plan_exercise_visible_upd`
- `trg_plan_rev_ex_del`
- `trg_plan_rev_ex_ins`
- `trg_plan_rev_ex_upd`
- `trg_plan_target_sets_shrink`
- `trg_workout_plan_exercises_touch`

## Constraints

- `length(trim(exercise_name_snapshot`
- `typeof(position`
- `target_metric IN ('reps', 'time', 'distance'`
- `load_mode IN ('external', 'bodyweight', 'weighted_bodyweight', 'assisted'`
- `typeof(target_sets`
- `target_reps_min IS NULL OR (typeof(target_reps_min`
- `target_reps_max IS NULL OR (typeof(target_reps_max`
- `target_seconds IS NULL OR (typeof(target_seconds`
- `target_distance_m IS NULL OR (typeof(target_distance_m`
- `target_weight_kg IS NULL OR (target_weight_kg >= 0 AND target_weight_kg <= 1000`
- `target_weight_entry_unit IS NULL OR target_weight_entry_unit IN ('kg', 'lb'`
- `target_weight_entry_value IS NULL OR (target_weight_entry_value >= 0 AND target_weight_entry_value <= 2500`

Back to [[ERD]].

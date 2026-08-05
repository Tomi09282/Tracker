---
type: table
table: workout_plan_set_targets
summary: 14 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `workout_plan_set_targets`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-05.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_id` | INTEGER | NOT NULL, → workout_plans.id |
| `exercise_row_id` | INTEGER | NOT NULL, → workout_plan_exercises.id |
| `set_index` | INTEGER | NOT NULL |
| `set_kind` | TEXT | NOT NULL, default 'straight' |
| `target_reps` | INTEGER |  |
| `target_seconds` | INTEGER |  |
| `target_distance_m` | INTEGER |  |
| `target_weight_kg` | REAL |  |
| `target_weight_entry_unit` | TEXT |  |
| `target_weight_entry_value` | REAL |  |
| `target_percent_1rm` | REAL |  |
| `target_rpe` | REAL |  |
| `rest_seconds` | INTEGER |  |

## Foreign keys

- `exercise_row_id` → `workout_plan_exercises.id` (on delete CASCADE)
- `plan_id` → `workout_plans.id` (on delete CASCADE)

## Indexes

- `workout_plan_set_targets_plan_idx`
- `workout_plan_set_targets_unique` (unique)

## Triggers

- `trg_plan_rev_tgt_del`
- `trg_plan_rev_tgt_ins`
- `trg_plan_rev_tgt_upd`
- `trg_plan_target_index_bound`
- `trg_plan_target_parent_ins`
- `trg_plan_target_parent_upd`

## Constraints

- `typeof(set_index`
- `set_kind IN ('straight', 'warmup', 'drop', 'backoff', 'amrap', 'failure'`
- `target_reps IS NULL OR (typeof(target_reps`
- `target_seconds IS NULL OR (typeof(target_seconds`
- `target_distance_m IS NULL OR (typeof(target_distance_m`
- `target_weight_kg IS NULL OR (target_weight_kg >= 0 AND target_weight_kg <= 1000`
- `target_weight_entry_unit IS NULL OR target_weight_entry_unit IN ('kg', 'lb'`
- `target_weight_entry_value IS NULL OR (target_weight_entry_value >= 0 AND target_weight_entry_value <= 2500`
- `target_percent_1rm IS NULL OR target_percent_1rm BETWEEN 1 AND 200`
- `target_rpe IS NULL OR target_rpe IN (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10`
- `rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600`
- `target_weight_kg IS NULL OR target_percent_1rm IS NULL`

Back to [[ERD]].

---
type: table
table: workout_pr_events
summary: 17 columns, 11 rows
rows: 11
tags: [data-model, generated]
---

# `workout_pr_events`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `client_user_id` | INTEGER | NOT NULL, → users.id |
| `exercise_id` | INTEGER | → exercises.id |
| `exercise_name_snapshot` | TEXT | NOT NULL |
| `source_set_id` | INTEGER | → workout_log_sets.id |
| `log_id` | INTEGER | → workout_logs.id |
| `kind` | TEXT | NOT NULL |
| `higher_is_better` | INTEGER | NOT NULL, default 1 |
| `value_unit` | TEXT | NOT NULL, default 'kg' |
| `rep_bucket` | INTEGER | NOT NULL, default 0 |
| `value` | REAL | NOT NULL |
| `previous_value` | REAL |  |
| `local_date` | TEXT | NOT NULL |
| `achieved_at` | INTEGER | NOT NULL, default unixepoch() |
| `invalidated_at` | INTEGER |  |
| `invalidated_reason` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `log_id` → `workout_logs.id` (on delete SET NULL)
- `source_set_id` → `workout_log_sets.id` (on delete SET NULL)
- `exercise_id` → `exercises.id` (on delete SET NULL)
- `client_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `workout_pr_events_source_idx` (partial)
- `workout_pr_events_exercise_idx` (partial)
- `workout_pr_events_feed_idx` (partial)
- `workout_pr_events_day_unique` (unique) (partial)
- `workout_pr_events_source_unique` (unique) (partial)

## Triggers

- `trg_pr_event_immutable`
- `trg_pr_event_owner`
- `trg_pr_event_session_shape`

## Constraints

- `length(trim(exercise_name_snapshot`
- `kind IN ( 'e1rm', 'rep_max', 'session_volume', 'max_hold', 'max_distance', 'best_time'`
- `higher_is_better IN (0, 1`
- `value_unit IN ('kg', 'seconds', 'metres'`
- `typeof(rep_bucket`
- `value > 0`
- `previous_value IS NULL OR previous_value > 0`
- `local_date = date(local_date`
- `invalidated_reason IS NULL OR length(invalidated_reason`
- `kind <> 'rep_max' OR rep_bucket > 0`
- `kind <> 'e1rm' OR rep_bucket = 0`
- `kind <> 'session_volume' OR (rep_bucket = 0 AND source_set_id IS NULL`

Back to [[ERD]].

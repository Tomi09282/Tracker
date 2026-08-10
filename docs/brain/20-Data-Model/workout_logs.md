---
type: table
table: workout_logs
summary: 29 columns, 14 rows
rows: 14
tags: [data-model, generated]
---

# `workout_logs`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `client_user_id` | INTEGER | NOT NULL, → users.id |
| `coach_client_id` | INTEGER | → coach_clients.id |
| `plan_id` | INTEGER | → workout_plans.id |
| `plan_day_id` | INTEGER | → workout_plan_days.id |
| `plan_revision` | INTEGER |  |
| `plan_name_snapshot` | TEXT |  |
| `day_name_snapshot` | TEXT |  |
| `occurrence_date` | TEXT |  |
| `title` | TEXT |  |
| `source` | TEXT | NOT NULL, default 'plan' |
| `status` | TEXT | NOT NULL, default 'in_progress' |
| `started_at` | INTEGER | NOT NULL, default unixepoch() |
| `completed_at` | INTEGER |  |
| `last_activity_at` | INTEGER | NOT NULL, default unixepoch() |
| `local_date` | TEXT | NOT NULL |
| `tz_name` | TEXT |  |
| `bodyweight_kg` | REAL |  |
| `duration_seconds` | INTEGER |  |
| `perceived_effort` | INTEGER |  |
| `notes` | TEXT |  |
| `total_sets` | INTEGER | NOT NULL, default 0 |
| `total_working_sets` | INTEGER | NOT NULL, default 0 |
| `total_reps` | INTEGER | NOT NULL, default 0 |
| `total_volume_kg` | REAL | NOT NULL, default 0 |
| `total_work_seconds` | INTEGER | NOT NULL, default 0 |
| `rollup_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `plan_day_id` → `workout_plan_days.id` (on delete SET NULL)
- `plan_id` → `workout_plans.id` (on delete SET NULL)
- `coach_client_id` → `coach_clients.id` (on delete SET NULL)
- `client_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `workout_logs_occurrence_unique` (unique) (partial)
- `workout_logs_one_live_unique` (unique) (partial)
- `workout_logs_stale_idx` (partial)
- `workout_logs_open_idx` (partial)
- `workout_logs_adherence_idx` (partial)
- `workout_logs_link_idx` (partial)
- `workout_logs_client_idx`

## Triggers

- `trg_log_link_client_ins`
- `trg_log_plan_day_ins`
- `trg_log_plan_shape_ins`
- `trg_log_rollup_truthful`
- `trg_workout_logs_frozen`
- `trg_workout_logs_touch`

## Constraints

- `plan_revision IS NULL OR plan_revision > 0`
- `plan_name_snapshot IS NULL OR length(plan_name_snapshot`
- `day_name_snapshot IS NULL OR length(day_name_snapshot`
- `occurrence_date IS NULL OR occurrence_date = date(occurrence_date`
- `title IS NULL OR length(trim(title`
- `source IN ('plan', 'freestyle', 'repeat'`
- `status IN ('in_progress', 'completed', 'abandoned'`
- `local_date = date(local_date`
- `tz_name IS NULL OR length(tz_name`
- `bodyweight_kg IS NULL OR bodyweight_kg BETWEEN 25 AND 400`
- `duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400`
- `perceived_effort IS NULL OR perceived_effort BETWEEN 1 AND 10`

Back to [[ERD]].

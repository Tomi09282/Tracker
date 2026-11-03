---
type: table
table: daily_summaries
summary: 15 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `daily_summaries`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, NOT NULL, → users.id |
| `local_date` | TEXT | PK, NOT NULL |
| `status` | TEXT | NOT NULL |
| `workout_due` | INTEGER |  |
| `workout_done` | INTEGER |  |
| `kcal_target_x10` | INTEGER |  |
| `kcal_eaten_x10` | INTEGER |  |
| `kcal_outcome` | TEXT |  |
| `habits_scheduled` | INTEGER | NOT NULL, default 0 |
| `habits_done` | INTEGER | NOT NULL, default 0 |
| `tasks_due` | INTEGER | NOT NULL, default 0 |
| `tasks_done` | INTEGER | NOT NULL, default 0 |
| `perfect_day` | INTEGER | NOT NULL, default 0 |
| `rules_version` | INTEGER | → point_rule_sets.id |
| `closed_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `rules_version` → `point_rule_sets.id` (on delete NO ACTION)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `sqlite_autoindex_daily_summaries_1` (unique)

## Triggers

- `trg_daily_summary_immutable`

## Constraints

- `local_date = date(local_date`
- `status IN ('closed', 'lapsed'`
- `workout_due IS NULL OR workout_due IN (0, 1`
- `workout_done IS NULL OR workout_done IN (0, 1`
- `kcal_target_x10 IS NULL OR (typeof(kcal_target_x10`
- `kcal_eaten_x10 IS NULL OR (typeof(kcal_eaten_x10`
- `kcal_outcome IS NULL OR kcal_outcome IN ('hit', 'over', 'under', 'no_data'`
- `typeof(habits_scheduled`
- `typeof(habits_done`
- `typeof(tasks_due`
- `typeof(tasks_done`
- `perfect_day IN (0, 1`

Back to [[ERD]].

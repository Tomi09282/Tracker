---
type: table
table: habit_day_results
summary: 17 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `habit_day_results`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `habit_id` | INTEGER | NOT NULL, → habits.id |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `local_date` | TEXT | NOT NULL |
| `outcome` | TEXT | NOT NULL |
| `count` | INTEGER | NOT NULL, default 0 |
| `target_count` | INTEGER | NOT NULL, default 1 |
| `multiplier_bp` | INTEGER | NOT NULL, default 10000 |
| `streak_after` | INTEGER | NOT NULL |
| `best_after` | INTEGER | NOT NULL |
| `freezes_after` | INTEGER | NOT NULL |
| `week_streak_after` | INTEGER |  |
| `quota_met` | INTEGER |  |
| `milestone_days` | INTEGER |  |
| `freeze_earned` | INTEGER | NOT NULL, default 0 |
| `rules_version` | INTEGER | → point_rule_sets.id |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `rules_version` → `point_rule_sets.id` (on delete NO ACTION)
- `user_id` → `users.id` (on delete CASCADE)
- `habit_id` → `habits.id` (on delete CASCADE)

## Indexes

- `habit_day_results_user_idx`
- `sqlite_autoindex_habit_day_results_1` (unique)

## Triggers

- `trg_habit_result_immutable`
- `trg_habit_result_owner`
- `trg_habit_result_settled`

## Constraints

- `local_date = date(local_date`
- `outcome IN ('done', 'missed', 'skipped', 'frozen', 'open', 'clean', 'relapse', 'lapsed'`
- `typeof(count`
- `typeof(target_count`
- `typeof(multiplier_bp`
- `typeof(streak_after`
- `typeof(best_after`
- `typeof(freezes_after`
- `week_streak_after IS NULL OR (typeof(week_streak_after`
- `quota_met IS NULL OR quota_met IN (0, 1`
- `milestone_days IS NULL OR (typeof(milestone_days`
- `freeze_earned IN (0, 1`

Back to [[ERD]].

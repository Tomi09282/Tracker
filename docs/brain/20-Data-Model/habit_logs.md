---
type: table
table: habit_logs
summary: 9 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `habit_logs`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `habit_id` | INTEGER | NOT NULL, → habits.id |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `local_date` | TEXT | NOT NULL |
| `count` | INTEGER | NOT NULL, default 0 |
| `status` | TEXT | NOT NULL, default 'pending' |
| `done_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)
- `habit_id` → `habits.id` (on delete CASCADE)

## Indexes

- `habit_logs_user_day_idx`
- `sqlite_autoindex_habit_logs_1` (unique)

## Triggers

- `trg_habit_log_owner`
- `trg_habit_log_owner_upd`
- `trg_habit_log_settled_insert`
- `trg_habit_log_settled_update`

## Constraints

- `local_date = date(local_date`
- `typeof(count`
- `status IN ('pending', 'done', 'skipped', 'relapse'`
- `done_at IS NULL OR typeof(done_at`
- `(status = 'done'`
- `status <> 'skipped' OR count = 0`
- `status <> 'relapse' OR count > 0`

Back to [[ERD]].

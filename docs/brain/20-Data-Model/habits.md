---
type: table
table: habits
summary: 18 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `habits`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `name` | TEXT | NOT NULL |
| `kind` | TEXT | NOT NULL |
| `schedule_type` | TEXT | NOT NULL, default 'daily' |
| `weekday_mask` | INTEGER | NOT NULL, default 127 |
| `times_per_week` | INTEGER |  |
| `target_count` | INTEGER | NOT NULL, default 1 |
| `unit` | TEXT |  |
| `points_success` | INTEGER | NOT NULL |
| `points_penalty` | INTEGER | NOT NULL |
| `reminder_time` | TEXT |  |
| `sort_order` | INTEGER | NOT NULL, default 0 |
| `started_on` | TEXT | NOT NULL |
| `archived_at` | INTEGER |  |
| `client_key` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `habits_user_idx`
- `habits_client_key_uidx` (unique)

## Triggers

- `trg_habit_identity_frozen`

## Constraints

- `length(name`
- `kind IN ('good', 'bad'`
- `schedule_type IN ('daily', 'weekdays', 'times_per_week'`
- `typeof(weekday_mask`
- `times_per_week IS NULL OR (typeof(times_per_week`
- `typeof(target_count`
- `unit IS NULL OR (length(unit`
- `typeof(points_success`
- `typeof(points_penalty`
- `reminder_time IS NULL OR (reminder_time GLOB '[0-2][0-9]:[0-5][0-9]' AND reminder_time <= '23:59'`
- `typeof(sort_order`
- `started_on = date(started_on`

Back to [[ERD]].

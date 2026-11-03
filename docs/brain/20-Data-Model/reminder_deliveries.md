---
type: table
table: reminder_deliveries
summary: 11 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `reminder_deliveries`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `kind` | TEXT | NOT NULL |
| `event_id` | INTEGER | → events.id |
| `habit_id` | INTEGER | → habits.id |
| `task_id` | INTEGER | → tasks.id |
| `occurrence_at` | INTEGER | NOT NULL |
| `offset_minutes` | INTEGER | NOT NULL |
| `fire_at` | INTEGER | NOT NULL |
| `notification_id` | INTEGER | → notifications.id |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `notification_id` → `notifications.id` (on delete SET NULL)
- `task_id` → `tasks.id` (on delete CASCADE)
- `habit_id` → `habits.id` (on delete CASCADE)
- `event_id` → `events.id` (on delete CASCADE)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `reminder_deliveries_notification_idx` (partial)
- `reminder_deliveries_task_idx` (partial)
- `reminder_deliveries_habit_idx` (partial)
- `reminder_deliveries_user_fire_idx`
- `reminder_deliveries_dedupe_uidx` (unique)

## Triggers

- `trg_reminder_delivery_immutable`
- `trg_reminder_delivery_notification`
- `trg_reminder_delivery_owner`

## Constraints

- `kind IN ('event', 'habit', 'task'`
- `typeof(occurrence_at`
- `typeof(offset_minutes`
- `typeof(fire_at`
- `(kind = 'event'`
- `fire_at = occurrence_at - offset_minutes * 60`

Back to [[ERD]].

---
type: table
table: event_reminders
summary: 5 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `event_reminders`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `event_id` | INTEGER | NOT NULL, → events.id |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `offset_minutes` | INTEGER | NOT NULL |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)
- `event_id` → `events.id` (on delete CASCADE)

## Indexes

- `event_reminders_user_idx`
- `sqlite_autoindex_event_reminders_1` (unique)

## Triggers

- `trg_event_reminder_cap`
- `trg_event_reminder_immutable`
- `trg_event_reminder_owner`

## Constraints

- `typeof(offset_minutes`

Back to [[ERD]].

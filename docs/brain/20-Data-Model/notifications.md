---
type: table
table: notifications
summary: 9 columns, 2 rows
rows: 2
tags: [data-model, generated]
---

# `notifications`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `coach_client_id` | INTEGER | → coach_clients.id |
| `type` | TEXT | NOT NULL |
| `title` | TEXT | NOT NULL |
| `body` | TEXT |  |
| `link_path` | TEXT |  |
| `read_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `coach_client_id` → `coach_clients.id` (on delete SET NULL)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `notifications_link_idx` (partial)
- `notifications_inbox_idx`
- `notifications_unread_idx` (partial)

## Triggers

- `trg_notification_immutable`
- `trg_notification_recipient_is_a_party`

## Constraints

- `length(type`
- `length(title`
- `body IS NULL OR length(body`
- `link_path IS NULL OR (link_path LIKE '/%' AND link_path NOT LIKE '//%'`
- `read_at IS NULL OR read_at >= created_at`

Back to [[ERD]].

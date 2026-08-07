---
type: table
table: messages
summary: 8 columns, 2 rows
rows: 2
tags: [data-model, generated]
---

# `messages`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `conversation_id` | INTEGER | NOT NULL, → conversations.id |
| `sender_id` | INTEGER | → users.id |
| `sender_is_coach` | INTEGER | NOT NULL |
| `body` | TEXT | NOT NULL |
| `deleted_at` | INTEGER |  |
| `read_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `sender_id` → `users.id` (on delete SET NULL)
- `conversation_id` → `conversations.id` (on delete CASCADE)

## Indexes

- `messages_sender_idx`
- `messages_unread_idx` (partial)
- `messages_thread_idx`

## Triggers

- `trg_conversation_touch_del`
- `trg_conversation_touch_ins`
- `trg_conversation_touch_upd`
- `trg_message_blocked`
- `trg_message_immutable`
- `trg_message_needs_live_link`
- `trg_message_sender_is_a_party`

## Constraints

- `sender_is_coach IN (0, 1`
- `length(body`
- `read_at IS NULL OR read_at >= created_at`

Back to [[ERD]].

---
type: table
table: conversations
summary: 9 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `conversations`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `coach_client_id` | INTEGER | → coach_clients.id |
| `client_id` | INTEGER | NOT NULL, → users.id |
| `coach_id` | INTEGER | → users.id |
| `coach_name_snapshot` | TEXT | NOT NULL |
| `blocked_by` | INTEGER | → users.id |
| `blocked_at` | INTEGER |  |
| `last_message_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `blocked_by` → `users.id` (on delete SET NULL)
- `coach_id` → `users.id` (on delete SET NULL)
- `client_id` → `users.id` (on delete CASCADE)
- `coach_client_id` → `coach_clients.id` (on delete SET NULL)

## Indexes

- `conversations_client_idx`
- `conversations_coach_idx`
- `sqlite_autoindex_conversations_1` (unique)

## Triggers

- `trg_conversation_matches_link`
- `trg_conversation_parties_frozen`

## Constraints

- `length(coach_name_snapshot`
- `coach_id IS NULL OR coach_id <> client_id`
- `(blocked_at IS NULL`

Back to [[ERD]].

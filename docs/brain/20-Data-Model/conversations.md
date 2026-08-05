---
type: table
table: conversations
summary: 8 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `conversations`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-05.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `coach_client_id` | INTEGER | NOT NULL, → coach_clients.id |
| `coach_id` | INTEGER | NOT NULL, → users.id |
| `client_id` | INTEGER | NOT NULL, → users.id |
| `blocked_by` | INTEGER | → users.id |
| `blocked_at` | INTEGER |  |
| `last_message_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `blocked_by` → `users.id` (on delete SET NULL)
- `client_id` → `users.id` (on delete CASCADE)
- `coach_id` → `users.id` (on delete CASCADE)
- `coach_client_id` → `coach_clients.id` (on delete CASCADE)

## Indexes

- `conversations_client_idx`
- `conversations_coach_idx`
- `sqlite_autoindex_conversations_1` (unique)

## Triggers

- `trg_conversation_matches_link`
- `trg_conversation_parties_frozen`

## Constraints

- `coach_id <> client_id`
- `(blocked_at IS NULL`

Back to [[ERD]].

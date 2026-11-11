---
type: table
table: challenges
summary: 11 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `challenges`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `name` | TEXT | NOT NULL |
| `category` | TEXT |  |
| `points` | INTEGER | NOT NULL |
| `weight` | INTEGER | NOT NULL, default 1 |
| `archived_at` | INTEGER |  |
| `deleted_at` | INTEGER |  |
| `client_key` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `challenges_pool_idx`
- `challenges_client_key_uidx` (unique)

## Triggers

- `trg_challenge_deleted_final`
- `trg_challenge_identity_frozen`

## Constraints

- `length(name`
- `category IS NULL OR category IN ('discipline', 'movement', 'mind', 'connection', 'food'`
- `typeof(points`
- `typeof(weight`
- `archived_at IS NULL OR typeof(archived_at`
- `deleted_at IS NULL OR typeof(deleted_at`
- `length(client_key`
- `deleted_at IS NULL OR archived_at IS NOT NULL`

Back to [[ERD]].

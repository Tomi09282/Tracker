---
type: table
table: push_devices
summary: 7 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `push_devices`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-05.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `platform` | TEXT | NOT NULL |
| `token_hash` | TEXT | NOT NULL |
| `last_seen_at` | INTEGER | NOT NULL, default unixepoch() |
| `revoked_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `push_devices_user_idx` (partial)
- `sqlite_autoindex_push_devices_1` (unique)


## Constraints

- `platform IN ('ios', 'android', 'web'`

Back to [[ERD]].

---
type: table
table: refresh_tokens
summary: 9 columns, 107 rows
rows: 107
tags: [data-model, generated]
---

# `refresh_tokens`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `token_hash` | TEXT | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `family_id` | TEXT | NOT NULL |
| `family_created_at` | INTEGER | NOT NULL |
| `expires_at` | INTEGER | NOT NULL |
| `consumed_at` | INTEGER |  |
| `revoked` | INTEGER | NOT NULL, default 0 |
| `user_agent` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `refresh_tokens_expiry_idx`
- `refresh_tokens_family_idx`
- `refresh_tokens_user_idx`
- `sqlite_autoindex_refresh_tokens_1` (unique)



Back to [[ERD]].

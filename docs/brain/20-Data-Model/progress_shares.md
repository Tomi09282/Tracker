---
type: table
table: progress_shares
summary: 8 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `progress_shares`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `coach_client_id` | INTEGER | NOT NULL, → coach_clients.id |
| `client_user_id` | INTEGER | NOT NULL, → users.id |
| `share_measurements` | INTEGER | NOT NULL, default 0 |
| `share_photos` | INTEGER | NOT NULL, default 0 |
| `granted_at` | INTEGER | NOT NULL, default unixepoch() |
| `revoked_at` | INTEGER |  |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `client_user_id` → `users.id` (on delete CASCADE)
- `coach_client_id` → `coach_clients.id` (on delete CASCADE)

## Indexes

- `progress_shares_client_idx`
- `sqlite_autoindex_progress_shares_1` (unique)

## Triggers

- `trg_progress_share_client_ins`
- `trg_progress_share_client_upd`
- `trg_progress_shares_touch`

## Constraints

- `share_measurements IN (0, 1`
- `share_photos IN (0, 1`

Back to [[ERD]].

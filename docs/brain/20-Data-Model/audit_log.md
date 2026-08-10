---
type: table
table: audit_log
summary: 9 columns, 190 rows
rows: 190
tags: [data-model, generated]
---

# `audit_log`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `actor_id` | INTEGER | → users.id |
| `action` | TEXT | NOT NULL |
| `target_type` | TEXT |  |
| `target_id` | INTEGER |  |
| `detail` | TEXT |  |
| `request_id` | TEXT |  |
| `ip` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `actor_id` → `users.id` (on delete SET NULL)

## Indexes

- `audit_log_marketplace_idx` (partial)
- `audit_log_coin_idx` (partial)
- `audit_log_action_idx`
- `audit_log_actor_idx`

## Triggers

- `audit_log_no_delete`
- `audit_log_no_update`
- `trg_audit_log_coin_complete`
- `trg_audit_log_marketplace_complete`


Back to [[ERD]].

---
type: table
table: rewards
summary: 11 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `rewards`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `name` | TEXT | NOT NULL |
| `description` | TEXT |  |
| `cost_minor` | INTEGER | NOT NULL |
| `repeatable` | INTEGER | NOT NULL, default 1 |
| `cooldown_days` | INTEGER |  |
| `archived_at` | INTEGER |  |
| `client_key` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `rewards_shop_idx`
- `rewards_client_key_uidx` (unique)

## Triggers

- `trg_reward_identity_frozen`

## Constraints

- `length(name`
- `description IS NULL OR length(description`
- `typeof(cost_minor`
- `repeatable IN (0, 1`
- `cooldown_days IS NULL OR (typeof(cooldown_days`
- `archived_at IS NULL OR typeof(archived_at`
- `length(client_key`
- `repeatable = 1 OR cooldown_days IS NULL`

Back to [[ERD]].

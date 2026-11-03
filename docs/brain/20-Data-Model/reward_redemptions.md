---
type: table
table: reward_redemptions
summary: 10 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `reward_redemptions`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `reward_id` | INTEGER | NOT NULL, → rewards.id |
| `name_snapshot` | TEXT | NOT NULL |
| `cost_minor_snapshot` | INTEGER | NOT NULL |
| `local_date` | TEXT | NOT NULL |
| `fulfilled_at` | INTEGER |  |
| `client_key` | TEXT | NOT NULL |
| `request_id` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `reward_id` → `rewards.id` (on delete CASCADE)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `reward_redemptions_user_idx`
- `reward_redemptions_reward_idx`
- `reward_redemptions_key_uidx` (unique)

## Triggers

- `trg_reward_redemption_immutable`
- `trg_reward_redemption_once`
- `trg_reward_redemption_truthful`

## Constraints

- `length(name_snapshot`
- `typeof(cost_minor_snapshot`
- `local_date = date(local_date`
- `fulfilled_at IS NULL OR typeof(fulfilled_at`
- `length(client_key`
- `length(request_id`

Back to [[ERD]].

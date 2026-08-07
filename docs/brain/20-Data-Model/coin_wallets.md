---
type: table
table: coin_wallets
summary: 4 columns, 14 rows
rows: 14
tags: [data-model, generated]
---

# `coin_wallets`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, → users.id |
| `balance_minor` | INTEGER | NOT NULL, default 0 |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)


## Triggers

- `trg_coin_wallet_opens_empty`
- `trg_coin_wallet_truthful`

## Constraints

- `typeof(balance_minor`

Back to [[ERD]].

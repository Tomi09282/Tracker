---
type: table
table: subscription_tiers
summary: 9 columns, 4 rows
rows: 4
tags: [data-model, generated]
---

# `subscription_tiers`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK |
| `name` | TEXT | NOT NULL |
| `client_cap` | INTEGER |  |
| `price_minor` | INTEGER | NOT NULL, default 0 |
| `currency` | TEXT | NOT NULL, default 'EUR' |
| `sort_order` | INTEGER | NOT NULL, default 0 |
| `active` | INTEGER | NOT NULL, default 1 |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `provider_price_id` | TEXT |  |


## Indexes

- `subscription_tiers_price_idx` (unique) (partial)
- `sqlite_autoindex_subscription_tiers_1` (unique)


## Constraints

- `active IN (0, 1`
- `client_cap IS NULL OR client_cap >= 0`
- `price_minor >= 0`
- `length(currency`

Back to [[ERD]].

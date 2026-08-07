---
type: table
table: coin_purchases
summary: 9 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `coin_purchases`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `item_id` | INTEGER | NOT NULL, → coin_store_items.id |
| `sku_snapshot` | TEXT | NOT NULL |
| `title_snapshot` | TEXT | NOT NULL |
| `entitlement_key` | TEXT | NOT NULL |
| `price_minor_snapshot` | INTEGER | NOT NULL |
| `request_id` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `item_id` → `coin_store_items.id` (on delete RESTRICT)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `coin_purchases_item_idx`
- `coin_purchases_user_idx`

## Triggers

- `trg_coin_purchase_immutable`
- `trg_coin_purchase_truthful`

## Constraints

- `length(sku_snapshot`
- `length(trim(title_snapshot`
- `length(entitlement_key`
- `typeof(price_minor_snapshot`
- `length(request_id`

Back to [[ERD]].

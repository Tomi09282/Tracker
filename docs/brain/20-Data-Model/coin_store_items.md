---
type: table
table: coin_store_items
summary: 10 columns, 2 rows
rows: 2
tags: [data-model, generated]
---

# `coin_store_items`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `sku` | TEXT | NOT NULL |
| `title` | TEXT | NOT NULL |
| `description` | TEXT |  |
| `price_minor` | INTEGER | NOT NULL |
| `entitlement_key` | TEXT | NOT NULL |
| `active` | INTEGER | NOT NULL, default 1 |
| `delisted_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |


## Indexes

- `coin_store_items_browse_idx` (partial)
- `coin_store_items_entitlement_uidx` (unique) (partial)
- `coin_store_items_sku_uidx` (unique)

## Triggers

- `trg_coin_store_item_affordable_ins`
- `trg_coin_store_item_affordable_upd`
- `trg_coin_store_item_frozen`
- `trg_coin_store_item_touch`

## Constraints

- `sku GLOB '[a-z][a-z0-9._-]*' AND length(sku`
- `length(trim(title`
- `description IS NULL OR length(description`
- `typeof(price_minor`
- `entitlement_key GLOB '[a-z][a-z0-9._-]*' AND length(entitlement_key`
- `active IN (0, 1`

Back to [[ERD]].

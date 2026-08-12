---
type: table
table: coin_entitlements
summary: 8 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `coin_entitlements`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `item_id` | INTEGER | NOT NULL, → coin_store_items.id |
| `purchase_id` | INTEGER | NOT NULL, → coin_purchases.id |
| `entitlement_key` | TEXT | NOT NULL |
| `granted_at` | INTEGER | NOT NULL, default unixepoch() |
| `revoked_at` | INTEGER |  |
| `revoked_reason` | TEXT |  |

## Foreign keys

- `purchase_id` → `coin_purchases.id` (on delete CASCADE)
- `item_id` → `coin_store_items.id` (on delete RESTRICT)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `coin_entitlements_purchase_idx`
- `coin_entitlements_user_idx`
- `coin_entitlements_live_uidx` (unique) (partial)

## Triggers

- `trg_coin_entitlement_immutable`
- `trg_coin_entitlement_truthful`
- `trg_theme_revoked_resets_pack`

## Constraints

- `length(entitlement_key`
- `revoked_reason IS NULL OR length(revoked_reason`

Back to [[ERD]].

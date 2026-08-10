---
type: table
table: coin_ledger
summary: 11 columns, 2 rows
rows: 2
tags: [data-model, generated]
---

# `coin_ledger`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `amount_minor` | INTEGER | NOT NULL |
| `reason_key` | TEXT | NOT NULL, → coin_reasons.key |
| `ref_type` | TEXT |  |
| `ref_id` | INTEGER |  |
| `idempotency_key` | TEXT | NOT NULL |
| `actor_user_id` | INTEGER | → users.id |
| `request_id` | TEXT | NOT NULL |
| `note` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `actor_user_id` → `users.id` (on delete SET NULL)
- `reason_key` → `coin_reasons.key` (on delete RESTRICT)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `coin_ledger_actor_idx` (partial)
- `coin_ledger_user_idx`
- `coin_ledger_sum_idx`
- `coin_ledger_ref_uidx` (unique) (partial)
- `coin_ledger_idem_uidx` (unique)

## Triggers

- `trg_coin_ledger_immutable`
- `trg_coin_ledger_needs_wallet`
- `trg_coin_ledger_never_negative`
- `trg_coin_ledger_reason_shape`
- `trg_coin_ledger_ref_truthful`
- `trg_coin_wallet_recompute`

## Constraints

- `typeof(amount_minor`
- `ref_type IS NULL OR length(ref_type`
- `ref_id IS NULL OR (typeof(ref_id`
- `length(idempotency_key`
- `length(request_id`
- `note IS NULL OR length(note`

Back to [[ERD]].

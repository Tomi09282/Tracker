---
type: table
table: coach_subscriptions
summary: 9 columns, 2 rows
rows: 2
tags: [data-model, generated]
---

# `coach_subscriptions`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `coach_id` | INTEGER | PK, → users.id |
| `tier_key` | TEXT | NOT NULL, → subscription_tiers.key |
| `status` | TEXT | NOT NULL |
| `provider` | TEXT | NOT NULL, default 'stripe' |
| `provider_customer_id` | TEXT |  |
| `provider_subscription_id` | TEXT |  |
| `current_period_end` | INTEGER |  |
| `provider_event_at` | INTEGER |  |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `tier_key` → `subscription_tiers.key` (on delete NO ACTION)
- `coach_id` → `users.id` (on delete CASCADE)

## Indexes

- `coach_subscriptions_customer_idx` (partial)
- `coach_subscriptions_provider_sub_idx` (unique) (partial)


## Constraints

- `status IN ('trialing','active','past_due','canceled'`

Back to [[ERD]].

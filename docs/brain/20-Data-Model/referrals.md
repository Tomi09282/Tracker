---
type: table
table: referrals
summary: 6 columns, 3 rows
rows: 3
tags: [data-model, generated]
---

# `referrals`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `coach_id` | INTEGER | NOT NULL, → users.id |
| `referred_user_id` | INTEGER | NOT NULL, → users.id |
| `code_id` | INTEGER | → invite_codes.id |
| `awarded_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `code_id` → `invite_codes.id` (on delete SET NULL)
- `referred_user_id` → `users.id` (on delete CASCADE)
- `coach_id` → `users.id` (on delete CASCADE)

## Indexes

- `referrals_user_unique` (unique)



Back to [[ERD]].

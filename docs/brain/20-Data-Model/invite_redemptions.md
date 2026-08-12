---
type: table
table: invite_redemptions
summary: 6 columns, 3 rows
rows: 3
tags: [data-model, generated]
---

# `invite_redemptions`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `code_id` | INTEGER | → invite_codes.id |
| `user_id` | INTEGER | → users.id |
| `outcome` | TEXT | NOT NULL |
| `ip` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete SET NULL)
- `code_id` → `invite_codes.id` (on delete SET NULL)

## Indexes

- `invite_redemptions_code_idx`


## Constraints

- `outcome IN ('accepted', 'expired', 'exhausted', 'revoked', 'unknown'`

Back to [[ERD]].

---
type: table
table: users
summary: 12 columns, 14 rows
rows: 14
tags: [data-model, generated]
---

# `users`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `email` | TEXT | NOT NULL |
| `password_hash` | TEXT | NOT NULL |
| `role` | TEXT | NOT NULL, default 'user' |
| `session_version` | INTEGER | NOT NULL, default 1 |
| `failed_logins` | INTEGER | NOT NULL, default 0 |
| `next_login_at` | INTEGER | NOT NULL, default 0 |
| `disabled_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |
| `must_change_credentials` | INTEGER | NOT NULL, default 0 |
| `created_by` | INTEGER | → users.id |

## Foreign keys

- `created_by` → `users.id` (on delete SET NULL)

## Indexes

- `users_role_idx`
- `users_email_unique` (unique)

## Triggers

- `trg_user_delete_keeps_exercises`
- `trg_user_opens_wallet`
- `users_updated_at`

## Constraints

- `role IN ('user', 'coach', 'admin'`
- `must_change_credentials IN (0, 1`

Back to [[ERD]].

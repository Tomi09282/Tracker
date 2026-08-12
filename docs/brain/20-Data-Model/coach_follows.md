---
type: table
table: coach_follows
summary: 3 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `coach_follows`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `follower_user_id` | INTEGER | PK, NOT NULL, → users.id |
| `coach_user_id` | INTEGER | PK, NOT NULL, → coach_profiles.user_id |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `coach_user_id` → `coach_profiles.user_id` (on delete CASCADE)
- `follower_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `coach_follows_coach_idx`
- `sqlite_autoindex_coach_follows_1` (unique)

## Triggers

- `trg_follow_no_self_ins`


Back to [[ERD]].

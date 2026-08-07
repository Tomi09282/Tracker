---
type: table
table: workout_calendar_feeds
summary: 11 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `workout_calendar_feeds`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `plan_id` | INTEGER | → workout_plans.id |
| `coach_client_id` | INTEGER | → coach_clients.id |
| `token_hash` | TEXT | NOT NULL |
| `label` | TEXT |  |
| `timezone` | TEXT |  |
| `expires_at` | INTEGER | NOT NULL |
| `revoked_at` | INTEGER |  |
| `last_used_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `coach_client_id` → `coach_clients.id` (on delete CASCADE)
- `plan_id` → `workout_plans.id` (on delete CASCADE)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `workout_calendar_feeds_link_idx` (partial)
- `workout_calendar_feeds_user_idx`
- `workout_calendar_feeds_hash_unique` (unique)


## Constraints

- `token_hash GLOB '[0-9a-f]*' AND length(token_hash`
- `label IS NULL OR length(trim(label`
- `timezone IS NULL OR (length(timezone`

Back to [[ERD]].

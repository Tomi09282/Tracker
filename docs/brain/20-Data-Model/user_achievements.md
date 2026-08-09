---
type: table
table: user_achievements
summary: 7 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `user_achievements`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `achievement_key` | TEXT | NOT NULL, → achievements.key |
| `source_type` | TEXT |  |
| `source_id` | INTEGER |  |
| `reward_minor_snapshot` | INTEGER | NOT NULL |
| `unlocked_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `achievement_key` → `achievements.key` (on delete RESTRICT)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `user_achievements_feed_idx`
- `user_achievements_once_uidx` (unique)

## Triggers

- `trg_user_achievement_immutable`
- `trg_user_achievement_truthful`

## Constraints

- `source_type IS NULL OR length(source_type`
- `source_id IS NULL OR (typeof(source_id`
- `typeof(reward_minor_snapshot`

Back to [[ERD]].

---
type: table
table: challenge_draws
summary: 13 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `challenge_draws`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `local_date` | TEXT | NOT NULL |
| `option1_id` | INTEGER | NOT NULL, → challenges.id |
| `option2_id` | INTEGER | → challenges.id |
| `option3_id` | INTEGER | → challenges.id |
| `rerolls_used` | INTEGER | NOT NULL, default 0 |
| `reroll_key` | TEXT |  |
| `picked_challenge_id` | INTEGER | → challenges.id |
| `picked_task_id` | INTEGER | → tasks.id |
| `picked_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `picked_task_id` → `tasks.id` (on delete CASCADE)
- `picked_challenge_id` → `challenges.id` (on delete CASCADE)
- `option3_id` → `challenges.id` (on delete CASCADE)
- `option2_id` → `challenges.id` (on delete CASCADE)
- `option1_id` → `challenges.id` (on delete CASCADE)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `sqlite_autoindex_challenge_draws_1` (unique)

## Triggers

- `trg_challenge_draw_options_owned`
- `trg_challenge_draw_pick_truthful`
- `trg_challenge_draw_reroll_owned`
- `trg_challenge_draw_shape`

## Constraints

- `local_date = date(local_date`
- `rerolls_used IN (0, 1`
- `reroll_key IS NULL OR (length(reroll_key`
- `picked_at IS NULL OR typeof(picked_at`
- `option2_id IS NULL OR option2_id <> option1_id`
- `option3_id IS NULL OR (option2_id IS NOT NULL AND option3_id <> option1_id AND option3_id <> option2_id`
- `(rerolls_used = 1`
- `(picked_challenge_id IS NULL`
- `picked_challenge_id IS NULL OR picked_challenge_id IN (option1_id, option2_id, option3_id`

Back to [[ERD]].

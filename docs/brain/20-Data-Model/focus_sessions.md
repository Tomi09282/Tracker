---
type: table
table: focus_sessions
summary: 17 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `focus_sessions`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `client_key` | TEXT | NOT NULL |
| `title` | TEXT | NOT NULL |
| `created_on` | TEXT | NOT NULL |
| `starts_at` | INTEGER | NOT NULL |
| `planned_minutes` | INTEGER | NOT NULL |
| `checkin_minutes` | INTEGER | NOT NULL |
| `checkins_done` | INTEGER | NOT NULL, default 0 |
| `last_checkin_at` | INTEGER |  |
| `status` | TEXT | NOT NULL, default 'open' |
| `closed_at` | INTEGER |  |
| `closed_on` | TEXT |  |
| `paid_minutes` | INTEGER |  |
| `paid_checkins` | INTEGER |  |
| `rules_version` | INTEGER | → point_rule_sets.id |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `rules_version` → `point_rule_sets.id` (on delete NO ACTION)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `focus_sessions_created_idx`
- `focus_sessions_closed_idx`
- `focus_sessions_client_key_uidx` (unique)
- `focus_sessions_one_open_uidx` (unique) (partial)

## Triggers

- `trg_focus_checkin_paced`
- `trg_focus_close_truthful`
- `trg_focus_closed_immutable`
- `trg_focus_plan_frozen`

## Constraints

- `length(client_key`
- `length(title`
- `created_on = date(created_on`
- `typeof(starts_at`
- `typeof(planned_minutes`
- `typeof(checkin_minutes`
- `typeof(checkins_done`
- `last_checkin_at IS NULL OR typeof(last_checkin_at`
- `status IN ('open', 'done', 'cancelled'`
- `closed_at IS NULL OR typeof(closed_at`
- `closed_on IS NULL OR closed_on = date(closed_on`
- `paid_minutes IS NULL OR (typeof(paid_minutes`

Back to [[ERD]].

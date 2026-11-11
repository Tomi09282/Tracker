---
type: table
table: coin_events
summary: 14 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `coin_events`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `reason_key` | TEXT | NOT NULL, → coin_reasons.key |
| `amount_minor` | INTEGER | NOT NULL |
| `xp_minor` | INTEGER | NOT NULL, default 0 |
| `local_date` | TEXT | NOT NULL |
| `source_type` | TEXT | NOT NULL |
| `source_id` | INTEGER | NOT NULL |
| `seq` | INTEGER | NOT NULL, default 0 |
| `reverses_event_id` | INTEGER | → coin_events.id |
| `rules_version` | INTEGER | → point_rule_sets.id |
| `request_id` | TEXT | NOT NULL |
| `note` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `rules_version` → `point_rule_sets.id` (on delete NO ACTION)
- `reverses_event_id` → `coin_events.id` (on delete CASCADE)
- `reason_key` → `coin_reasons.key` (on delete RESTRICT)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `coin_events_xp_idx`
- `coin_events_day_idx`
- `coin_events_natural_uidx` (unique) (partial)
- `sqlite_autoindex_coin_events_1` (unique)

## Triggers

- `trg_coin_event_daily_cap`
- `trg_coin_event_focus_truthful`
- `trg_coin_event_immutable`
- `trg_coin_event_reversal_truthful`
- `trg_coin_event_seq`
- `trg_coin_event_shape`

## Constraints

- `typeof(amount_minor`
- `typeof(xp_minor`
- `local_date = date(local_date`
- `length(source_type`
- `typeof(source_id`
- `typeof(seq`
- `length(request_id`
- `note IS NULL OR length(note`

Back to [[ERD]].

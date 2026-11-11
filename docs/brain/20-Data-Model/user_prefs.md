---
type: table
table: user_prefs
summary: 8 columns, 3 rows
rows: 3
tags: [data-model, generated]
---

# `user_prefs`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, → users.id |
| `timezone` | TEXT |  |
| `timezone_set_at` | INTEGER |  |
| `day_start_hour` | INTEGER | NOT NULL, default 4 |
| `lifeos_started_on` | TEXT |  |
| `kcal_tolerance_pct` | INTEGER | NOT NULL, default 10 |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)


## Triggers

- `trg_user_prefs_started_once`
- `trg_user_prefs_timezone_daily`

## Constraints

- `timezone IS NULL OR (length(timezone`
- `timezone_set_at IS NULL OR typeof(timezone_set_at`
- `day_start_hour IN (0, 2, 4, 6`
- `lifeos_started_on IS NULL OR lifeos_started_on = date(lifeos_started_on`
- `typeof(kcal_tolerance_pct`

Back to [[ERD]].

---
type: table
table: workout_plan_blocks
summary: 10 columns, 13 rows
rows: 13
tags: [data-model, generated]
---

# `workout_plan_blocks`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_id` | INTEGER | NOT NULL, → workout_plans.id |
| `day_id` | INTEGER | NOT NULL, → workout_plan_days.id |
| `kind` | TEXT | NOT NULL, default 'single' |
| `position` | INTEGER | NOT NULL, default 0 |
| `rounds` | INTEGER |  |
| `rest_seconds` | INTEGER |  |
| `cap_seconds` | INTEGER |  |
| `label` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `day_id` → `workout_plan_days.id` (on delete CASCADE)
- `plan_id` → `workout_plans.id` (on delete CASCADE)

## Indexes

- `workout_plan_blocks_plan_idx`
- `workout_plan_blocks_day_idx`

## Triggers

- `trg_plan_block_parent_ins`
- `trg_plan_block_parent_upd`
- `trg_plan_rev_blocks_del`
- `trg_plan_rev_blocks_ins`
- `trg_plan_rev_blocks_upd`

## Constraints

- `kind IN ('single', 'superset', 'circuit', 'emom', 'amrap'`
- `typeof(position`
- `rounds IS NULL OR rounds BETWEEN 1 AND 50`
- `rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600`
- `cap_seconds IS NULL OR cap_seconds BETWEEN 10 AND 7200`
- `label IS NULL OR length(trim(label`
- `kind <> 'single' OR (rounds IS NULL AND cap_seconds IS NULL`
- `kind NOT IN ('circuit', 'emom'`

Back to [[ERD]].

---
type: table
table: exercise_equipment_map
summary: 2 columns, 1432 rows
rows: 1432
tags: [data-model, generated]
---

# `exercise_equipment_map`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `exercise_id` | INTEGER | PK, NOT NULL, → exercises.id |
| `equipment_id` | INTEGER | PK, NOT NULL, → equipment.id |

## Foreign keys

- `equipment_id` → `equipment.id` (on delete CASCADE)
- `exercise_id` → `exercises.id` (on delete CASCADE)

## Indexes

- `exercise_equipment_by_equipment`
- `sqlite_autoindex_exercise_equipment_map_1` (unique)



Back to [[ERD]].

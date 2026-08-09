---
type: table
table: exercise_muscle_map
summary: 3 columns, 4101 rows
rows: 4101
tags: [data-model, generated]
---

# `exercise_muscle_map`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `exercise_id` | INTEGER | PK, NOT NULL, → exercises.id |
| `muscle_group_id` | INTEGER | PK, NOT NULL, → muscle_groups.id |
| `role` | TEXT | NOT NULL, default 'primary' |

## Foreign keys

- `muscle_group_id` → `muscle_groups.id` (on delete CASCADE)
- `exercise_id` → `exercises.id` (on delete CASCADE)

## Indexes

- `exercise_muscle_by_muscle`
- `sqlite_autoindex_exercise_muscle_map_1` (unique)


## Constraints

- `role IN ('primary', 'secondary'`

Back to [[ERD]].

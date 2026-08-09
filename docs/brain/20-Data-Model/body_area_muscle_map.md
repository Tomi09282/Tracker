---
type: table
table: body_area_muscle_map
summary: 3 columns, 44 rows
rows: 44
tags: [data-model, generated]
---

# `body_area_muscle_map`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `body_area` | TEXT | PK, NOT NULL |
| `muscle_group_id` | INTEGER | PK, NOT NULL, → muscle_groups.id |
| `relation` | TEXT | NOT NULL, default 'loads' |

## Foreign keys

- `muscle_group_id` → `muscle_groups.id` (on delete CASCADE)

## Indexes

- `body_area_muscle_map_muscle_idx`
- `sqlite_autoindex_body_area_muscle_map_1` (unique)


## Constraints

- `body_area IN ( 'neck', 'shoulder', 'elbow', 'wrist', 'upper-back', 'lower-back', 'hip', 'knee', 'ankle', 'foot', 'chest', 'abdomen', 'other'`
- `relation IN ('loads', 'stabilises'`

Back to [[ERD]].

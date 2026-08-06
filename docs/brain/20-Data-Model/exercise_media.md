---
type: table
table: exercise_media
summary: 11 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `exercise_media`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `exercise_id` | INTEGER | NOT NULL, → exercises.id |
| `kind` | TEXT | NOT NULL |
| `storage_key` | TEXT | NOT NULL |
| `mime` | TEXT | NOT NULL |
| `width` | INTEGER |  |
| `height` | INTEGER |  |
| `bytes` | INTEGER |  |
| `position` | INTEGER | NOT NULL, default 0 |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `deleted_at` | INTEGER |  |

## Foreign keys

- `exercise_id` → `exercises.id` (on delete CASCADE)

## Indexes

- `exercise_media_exercise_idx`
- `sqlite_autoindex_exercise_media_1` (unique)


## Constraints

- `kind IN ('image', 'video'`

Back to [[ERD]].

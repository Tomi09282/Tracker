---
type: table
table: progress_photos
summary: 11 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `progress_photos`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `client_user_id` | INTEGER | NOT NULL, → users.id |
| `taken_on` | TEXT | NOT NULL |
| `pose` | TEXT |  |
| `storage_key` | TEXT | NOT NULL |
| `mime` | TEXT | NOT NULL |
| `bytes` | INTEGER | NOT NULL |
| `width` | INTEGER |  |
| `height` | INTEGER |  |
| `note` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `client_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `progress_photos_client_idx`
- `sqlite_autoindex_progress_photos_1` (unique)


## Constraints

- `taken_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
- `pose IS NULL OR length(trim(pose`
- `length(storage_key`
- `mime IN ('image/jpeg', 'image/png', 'image/webp'`
- `bytes > 0 AND bytes <= 25 * 1024 * 1024`
- `width IS NULL OR width BETWEEN 1 AND 20000`
- `height IS NULL OR height BETWEEN 1 AND 20000`
- `note IS NULL OR length(note`

Back to [[ERD]].

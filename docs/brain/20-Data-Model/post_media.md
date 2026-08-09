---
type: table
table: post_media
summary: 13 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `post_media`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `post_id` | INTEGER | NOT NULL, → coach_posts.id |
| `role_key` | TEXT | NOT NULL, → post_media_roles.key |
| `storage_key` | TEXT | NOT NULL |
| `thumb_key` | TEXT | NOT NULL |
| `mime` | TEXT | NOT NULL, → post_media_mimes.mime |
| `width` | INTEGER | NOT NULL |
| `height` | INTEGER | NOT NULL |
| `bytes` | INTEGER | NOT NULL |
| `alt` | TEXT |  |
| `sort_order` | INTEGER | NOT NULL, default 0 |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `deleted_at` | INTEGER |  |

## Foreign keys

- `mime` → `post_media_mimes.mime` (on delete NO ACTION)
- `role_key` → `post_media_roles.key` (on delete NO ACTION)
- `post_id` → `coach_posts.id` (on delete CASCADE)

## Indexes

- `post_media_created_idx`
- `post_media_mime_fk_idx`
- `post_media_role_fk_idx`
- `post_media_one_cover_idx` (unique) (partial)
- `post_media_post_idx` (partial)
- `sqlite_autoindex_post_media_2` (unique)
- `sqlite_autoindex_post_media_1` (unique)

## Triggers

- `trg_post_media_daily_cap_ins`
- `trg_post_media_mime_active_ins`
- `trg_post_media_per_post_cap_ins`

## Constraints

- `storage_key GLOB 'pub_*' AND storage_key GLOB '*.webp' AND storage_key NOT GLOB '*[^a-z0-9_.]*' AND length(storage_key`
- `thumb_key GLOB 'pub_*' AND thumb_key GLOB '*.webp' AND thumb_key NOT GLOB '*[^a-z0-9_.]*' AND length(thumb_key`
- `typeof(width`
- `typeof(height`
- `typeof(bytes`
- `alt IS NULL OR (length(alt`
- `typeof(sort_order`

Back to [[ERD]].

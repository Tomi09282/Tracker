---
type: table
table: message_attachments
summary: 7 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `message_attachments`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `message_id` | INTEGER | NOT NULL, → messages.id |
| `storage_key` | TEXT | NOT NULL |
| `mime` | TEXT | NOT NULL |
| `bytes` | INTEGER | NOT NULL |
| `duration_seconds` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `message_id` → `messages.id` (on delete CASCADE)

## Indexes

- `message_attachments_message_idx`
- `sqlite_autoindex_message_attachments_1` (unique)


## Constraints

- `mime IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4'`
- `bytes > 0 AND bytes <= 134217728`
- `duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 3600`

Back to [[ERD]].

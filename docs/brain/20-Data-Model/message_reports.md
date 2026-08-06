---
type: table
table: message_reports
summary: 10 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `message_reports`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `message_id` | INTEGER | NOT NULL, → messages.id |
| `reporter_id` | INTEGER | NOT NULL, → users.id |
| `reason` | TEXT | NOT NULL |
| `note` | TEXT |  |
| `body_snapshot` | TEXT |  |
| `status` | TEXT | NOT NULL, default 'open' |
| `resolved_at` | INTEGER |  |
| `resolved_by` | INTEGER | → users.id |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `resolved_by` → `users.id` (on delete SET NULL)
- `reporter_id` → `users.id` (on delete CASCADE)
- `message_id` → `messages.id` (on delete CASCADE)

## Indexes

- `message_reports_reporter_idx`
- `message_reports_message_idx`
- `message_reports_queue_idx`
- `sqlite_autoindex_message_reports_1` (unique)


## Constraints

- `reason IN ('abuse', 'spam', 'inappropriate', 'other'`
- `note IS NULL OR length(note`
- `body_snapshot IS NULL OR length(body_snapshot`
- `status IN ('open', 'upheld', 'rejected'`
- `(status = 'open'`

Back to [[ERD]].

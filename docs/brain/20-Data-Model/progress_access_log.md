---
type: table
table: progress_access_log
summary: 8 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `progress_access_log`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `subject_user_id` | INTEGER | NOT NULL, → users.id |
| `viewer_user_id` | INTEGER | → users.id |
| `viewer_email_snapshot` | TEXT | NOT NULL |
| `coach_client_id` | INTEGER | → coach_clients.id |
| `kind` | TEXT | NOT NULL |
| `target_id` | INTEGER |  |
| `at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `coach_client_id` → `coach_clients.id` (on delete SET NULL)
- `viewer_user_id` → `users.id` (on delete SET NULL)
- `subject_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `progress_access_log_subject_idx`


## Constraints

- `length(viewer_email_snapshot`
- `length(kind`

Back to [[ERD]].

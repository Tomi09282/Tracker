---
type: table
table: tasks
summary: 19 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `tasks`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `title` | TEXT | NOT NULL |
| `notes` | TEXT |  |
| `priority` | INTEGER | NOT NULL, default 2 |
| `points` | INTEGER |  |
| `due_on` | TEXT |  |
| `due_time` | TEXT |  |
| `recurrence` | TEXT |  |
| `parent_task_id` | INTEGER | → tasks.id |
| `occurrence_on` | TEXT |  |
| `completed_at` | INTEGER |  |
| `completed_on` | TEXT |  |
| `overdue_on` | TEXT |  |
| `deleted_at` | INTEGER |  |
| `client_key` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |
| `challenge_id` | INTEGER | → challenges.id |

## Foreign keys

- `challenge_id` → `challenges.id` (on delete SET NULL)
- `parent_task_id` → `tasks.id` (on delete CASCADE)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `tasks_challenge_idx` (partial)
- `tasks_done_idx`
- `tasks_open_idx`
- `tasks_occurrence_uidx` (unique) (partial)
- `tasks_client_key_uidx` (unique) (partial)

## Triggers

- `trg_task_challenge_frozen`
- `trg_task_challenge_owner`
- `trg_task_completion_settled`
- `trg_task_identity_frozen`
- `trg_task_overdue_once`
- `trg_task_parent_owner`

## Constraints

- `length(title`
- `notes IS NULL OR length(notes`
- `priority IN (1, 2, 3`
- `points IS NULL OR (typeof(points`
- `due_on IS NULL OR due_on = date(due_on`
- `due_time IS NULL OR (due_time GLOB '[0-2][0-9]:[0-5][0-9]' AND due_time <= '23:59'`
- `recurrence IS NULL OR (json_valid(recurrence`
- `occurrence_on IS NULL OR occurrence_on = date(occurrence_on`
- `completed_at IS NULL OR typeof(completed_at`
- `completed_on IS NULL OR completed_on = date(completed_on`
- `overdue_on IS NULL OR overdue_on = date(overdue_on`
- `deleted_at IS NULL OR typeof(deleted_at`

Back to [[ERD]].

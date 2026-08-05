---
type: table
table: exercises
summary: 16 columns, 1652 rows
rows: 1652
tags: [data-model, generated]
---

# `exercises`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-05.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL |
| `description` | TEXT |  |
| `instructions` | TEXT |  |
| `status` | TEXT | NOT NULL, default 'private' |
| `owner_id` | INTEGER | → users.id |
| `rejection_reason` | TEXT |  |
| `submitted_at` | INTEGER |  |
| `source` | TEXT | NOT NULL, default 'custom' |
| `source_uid` | TEXT |  |
| `difficulty` | TEXT |  |
| `exercise_type` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |
| `deleted_at` | INTEGER |  |

## Foreign keys

- `owner_id` → `users.id` (on delete CASCADE)

## Indexes

- `exercises_source_uid_unique` (unique) (partial)
- `exercises_sort_idx`
- `exercises_owner_idx`
- `exercises_scope_idx`

## Triggers

- `exercises_updated_at`
- `trg_exercise_hard_delete_guard`

## Constraints

- `status IN ('global', 'private', 'pending_review', 'rejected'`
- `source IN ('wger', 'free-exercise-db', 'custom'`
- `difficulty IS NULL OR difficulty IN ('beginner', 'intermediate', 'advanced'`
- `exercise_type IS NULL OR exercise_type IN ('strength', 'stretching', 'cardio', 'mobility', 'plyometrics'`

Back to [[ERD]].

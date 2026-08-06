---
type: table
table: teams
summary: 7 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `teams`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `coach_id` | INTEGER | NOT NULL, → users.id |
| `name` | TEXT | NOT NULL |
| `description` | TEXT |  |
| `archived_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `coach_id` → `users.id` (on delete CASCADE)

## Indexes

- `teams_coach_idx`

## Triggers

- `teams_updated_at`


Back to [[ERD]].

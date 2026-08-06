---
type: table
table: coach_clients
summary: 11 columns, 3 rows
rows: 3
tags: [data-model, generated]
---

# `coach_clients`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `coach_id` | INTEGER | NOT NULL, → users.id |
| `client_id` | INTEGER | NOT NULL, → users.id |
| `team_id` | INTEGER | → teams.id |
| `status` | TEXT | NOT NULL, default 'invited' |
| `origin` | TEXT | NOT NULL, default 'invite' |
| `invited_at` | INTEGER | NOT NULL, default unixepoch() |
| `accepted_at` | INTEGER |  |
| `archived_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `team_id` → `teams.id` (on delete SET NULL)
- `client_id` → `users.id` (on delete CASCADE)
- `coach_id` → `users.id` (on delete CASCADE)

## Indexes

- `coach_clients_team_idx`
- `coach_clients_client_idx`
- `coach_clients_coach_idx`
- `coach_clients_pair_unique` (unique)

## Triggers

- `coach_clients_no_self`
- `coach_clients_updated_at`

## Constraints

- `status IN ('invited', 'active', 'archived'`
- `origin IN ('invite', 'team_code', 'pregenerated', 'manual'`

Back to [[ERD]].

---
type: table
table: invite_codes
summary: 11 columns, 7 rows
rows: 7
tags: [data-model, generated]
---

# `invite_codes`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `code_hash` | TEXT | NOT NULL |
| `label` | TEXT |  |
| `coach_id` | INTEGER | NOT NULL, → users.id |
| `team_id` | INTEGER | → teams.id |
| `kind` | TEXT | NOT NULL, default 'multi' |
| `max_uses` | INTEGER | NOT NULL, default 1 |
| `uses` | INTEGER | NOT NULL, default 0 |
| `expires_at` | INTEGER |  |
| `revoked_at` | INTEGER |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `team_id` → `teams.id` (on delete CASCADE)
- `coach_id` → `users.id` (on delete CASCADE)

## Indexes

- `invite_codes_coach_idx`
- `invite_codes_hash_unique` (unique)


## Constraints

- `kind IN ('single', 'multi'`
- `max_uses > 0`
- `uses >= 0`

Back to [[ERD]].

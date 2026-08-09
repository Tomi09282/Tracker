---
type: table
table: retired_handles
summary: 3 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `retired_handles`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `handle` | TEXT | PK, NOT NULL |
| `prev_user_id` | INTEGER |  |
| `released_at` | INTEGER | NOT NULL, default unixepoch() |


## Indexes

- `sqlite_autoindex_retired_handles_1` (unique)


## Constraints

- `handle NOT GLOB '*[^a-z0-9-]*'`

Back to [[ERD]].

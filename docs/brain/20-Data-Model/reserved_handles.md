---
type: table
table: reserved_handles
summary: 1 columns, 53 rows
rows: 53
tags: [data-model, generated]
---

# `reserved_handles`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `handle` | TEXT | PK, NOT NULL |


## Indexes

- `sqlite_autoindex_reserved_handles_1` (unique)


## Constraints

- `handle NOT GLOB '*[^a-z0-9-]*'`

Back to [[ERD]].

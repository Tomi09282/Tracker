---
type: table
table: post_kinds
summary: 6 columns, 3 rows
rows: 3
tags: [data-model, generated]
---

# `post_kinds`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `requires_event_at` | INTEGER | NOT NULL, default 0 |
| `allows_capacity` | INTEGER | NOT NULL, default 0 |
| `allows_price` | INTEGER | NOT NULL, default 0 |
| `sort_order` | INTEGER | NOT NULL, default 0 |
| `active` | INTEGER | NOT NULL, default 1 |


## Indexes

- `sqlite_autoindex_post_kinds_1` (unique)


## Constraints

- `key NOT GLOB '*[^a-z_]*' AND length(key`
- `requires_event_at IN (0,1`
- `allows_capacity IN (0,1`
- `allows_price IN (0,1`
- `active IN (0,1`

Back to [[ERD]].

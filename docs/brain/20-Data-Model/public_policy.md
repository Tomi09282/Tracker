---
type: table
table: public_policy
summary: 3 columns, 8 rows
rows: 8
tags: [data-model, generated]
---

# `public_policy`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `value` | INTEGER | NOT NULL |
| `note` | TEXT | NOT NULL |


## Indexes

- `sqlite_autoindex_public_policy_1` (unique)


## Constraints

- `key NOT GLOB '*[^a-z0-9_]*' AND length(key`
- `typeof(value`
- `length(trim(note`

Back to [[ERD]].

---
type: table
table: public_currencies
summary: 3 columns, 4 rows
rows: 4
tags: [data-model, generated]
---

# `public_currencies`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `code` | TEXT | PK, NOT NULL |
| `minor_units` | INTEGER | NOT NULL |
| `active` | INTEGER | NOT NULL, default 1 |


## Indexes

- `sqlite_autoindex_public_currencies_1` (unique)


## Constraints

- `code NOT GLOB '*[^A-Z]*' AND length(code`
- `typeof(minor_units`
- `active IN (0, 1`

Back to [[ERD]].

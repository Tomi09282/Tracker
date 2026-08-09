---
type: table
table: public_cities
summary: 5 columns, 10 rows
rows: 10
tags: [data-model, generated]
---

# `public_cities`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `country_code` | TEXT | NOT NULL |
| `name_native` | TEXT | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, default 0 |
| `active` | INTEGER | NOT NULL, default 1 |


## Indexes

- `sqlite_autoindex_public_cities_1` (unique)


## Constraints

- `key NOT GLOB '*[^a-z0-9-]*' AND length(key`
- `country_code NOT GLOB '*[^A-Z]*' AND length(country_code`
- `length(name_native`
- `active IN (0, 1`

Back to [[ERD]].

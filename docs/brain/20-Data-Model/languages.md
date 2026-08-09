---
type: table
table: languages
summary: 6 columns, 25 rows
rows: 25
tags: [data-model, generated]
---

# `languages`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `code` | TEXT | PK, NOT NULL |
| `name_en` | TEXT | NOT NULL |
| `name_native` | TEXT | NOT NULL |
| `is_default` | INTEGER | NOT NULL, default 0 |
| `enabled` | INTEGER | NOT NULL, default 1 |
| `sort_order` | INTEGER | NOT NULL, default 0 |


## Indexes

- `languages_single_default` (unique) (partial)
- `sqlite_autoindex_languages_1` (unique)


## Constraints

- `code GLOB '[a-z][a-z]'`
- `is_default IN (0, 1`
- `enabled IN (0, 1`

Back to [[ERD]].

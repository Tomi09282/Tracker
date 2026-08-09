---
type: table
table: achievements
summary: 6 columns, 7 rows
rows: 7
tags: [data-model, generated]
---

# `achievements`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `title_key` | TEXT | NOT NULL |
| `category` | TEXT | NOT NULL |
| `reward_minor` | INTEGER | NOT NULL |
| `active` | INTEGER | NOT NULL, default 1 |
| `sort_order` | INTEGER | NOT NULL, default 0 |


## Indexes

- `sqlite_autoindex_achievements_1` (unique)


## Constraints

- `key GLOB '[a-z][a-z0-9._]*' AND length(key`
- `length(title_key`
- `length(category`
- `typeof(reward_minor`
- `active IN (0, 1`

Back to [[ERD]].

---
type: table
table: post_media_mimes
summary: 2 columns, 3 rows
rows: 3
tags: [data-model, generated]
---

# `post_media_mimes`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `mime` | TEXT | PK, NOT NULL |
| `active` | INTEGER | NOT NULL, default 1 |


## Indexes

- `sqlite_autoindex_post_media_mimes_1` (unique)


## Constraints

- `length(mime`
- `active IN (0,1`

Back to [[ERD]].

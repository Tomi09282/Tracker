---
type: table
table: coin_reasons
summary: 9 columns, 19 rows
rows: 19
tags: [data-model, generated]
---

# `coin_reasons`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `sign` | INTEGER | NOT NULL |
| `ref_type` | TEXT |  |
| `max_minor` | INTEGER | NOT NULL |
| `active` | INTEGER | NOT NULL, default 1 |
| `label` | TEXT | NOT NULL |
| `xp` | INTEGER | NOT NULL, default 0 |
| `spend` | INTEGER | NOT NULL, default 0 |
| `cap_exempt` | INTEGER | NOT NULL, default 0 |


## Indexes

- `sqlite_autoindex_coin_reasons_1` (unique)


## Constraints

- `key GLOB '[a-z][a-z0-9._]*' AND length(key`
- `sign IN (-1, 1`
- `ref_type IS NULL OR length(ref_type`
- `typeof(max_minor`
- `active IN (0, 1`
- `length(trim(label`
- `xp IN (0, 1`
- `spend IN (0, 1`
- `cap_exempt IN (0, 1`

Back to [[ERD]].

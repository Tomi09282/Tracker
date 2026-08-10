---
type: table
table: theme_packs
summary: 6 columns, 7 rows
rows: 7
tags: [data-model, generated]
---

# `theme_packs`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | PK, NOT NULL |
| `label` | TEXT | NOT NULL |
| `surface_hex` | TEXT | NOT NULL |
| `entitlement_key` | TEXT |  |
| `active` | INTEGER | NOT NULL, default 1 |
| `sort_order` | INTEGER | NOT NULL, default 0 |


## Indexes

- `sqlite_autoindex_theme_packs_1` (unique)

## Triggers

- `trg_theme_pack_frozen`

## Constraints

- `key GLOB '[a-z][a-z0-9_]*' AND length(key`
- `length(trim(label`
- `surface_hex GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`
- `entitlement_key IS NULL OR length(entitlement_key`
- `active IN (0, 1`

Back to [[ERD]].

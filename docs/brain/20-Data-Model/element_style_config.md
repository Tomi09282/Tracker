---
type: table
table: element_style_config
summary: 4 columns, 27 rows
rows: 27
tags: [data-model, generated]
---

# `element_style_config`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `element_id` | TEXT | PK, NOT NULL |
| `variant` | TEXT | NOT NULL, default 'A' |
| `updated_by` | INTEGER | → users.id |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `updated_by` → `users.id` (on delete SET NULL)

## Indexes

- `sqlite_autoindex_element_style_config_1` (unique)


## Constraints

- `element_id GLOB 'E[0-9]*'`
- `variant IN ('A', 'B', 'C', 'D', 'E'`

Back to [[ERD]].

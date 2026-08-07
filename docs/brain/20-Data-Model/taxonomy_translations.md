---
type: table
table: taxonomy_translations
summary: 7 columns, 252 rows
rows: 252
tags: [data-model, generated]
---

# `taxonomy_translations`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `kind` | TEXT | NOT NULL |
| `ref_id` | INTEGER | NOT NULL |
| `lang` | TEXT | NOT NULL, → languages.code |
| `name` | TEXT | NOT NULL |
| `origin` | TEXT | NOT NULL, default 'manual' |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `lang` → `languages.code` (on delete NO ACTION)

## Indexes

- `idx_taxonomy_tr_lookup`
- `sqlite_autoindex_taxonomy_translations_1` (unique)


## Constraints

- `kind IN ('muscle_group', 'equipment'`
- `length(trim(name`
- `origin IN ('manual', 'dataset', 'machine'`

Back to [[ERD]].

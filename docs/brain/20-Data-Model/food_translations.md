---
type: table
table: food_translations
summary: 8 columns, 285 rows
rows: 285
tags: [data-model, generated]
---

# `food_translations`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `food_id` | INTEGER | NOT NULL, → foods.id |
| `lang` | TEXT | NOT NULL |
| `name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL |
| `origin` | TEXT | NOT NULL, default 'dataset' |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `food_id` → `foods.id` (on delete CASCADE)

## Indexes

- `food_translations_lang_idx`
- `food_translations_uidx` (unique)

## Triggers

- `trg_food_tr_fts_del`
- `trg_food_tr_fts_ins`
- `trg_food_tr_fts_upd`
- `trg_food_translations_touch`

## Constraints

- `lang GLOB '[a-z][a-z]'`
- `length(trim(name`
- `origin IN ('dataset', 'human', 'machine'`

Back to [[ERD]].

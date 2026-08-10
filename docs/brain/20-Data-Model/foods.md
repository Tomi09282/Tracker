---
type: table
table: foods
summary: 17 columns, 95 rows
rows: 95
tags: [data-model, generated]
---

# `foods`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-10.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `source` | TEXT | NOT NULL, default 'manual' |
| `source_ref` | TEXT |  |
| `owner_user_id` | INTEGER | → users.id |
| `name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL |
| `brand` | TEXT |  |
| `kcal_per_100g_x10` | INTEGER | NOT NULL |
| `protein_mg_per_100g` | INTEGER | NOT NULL |
| `carb_mg_per_100g` | INTEGER | NOT NULL |
| `fat_mg_per_100g` | INTEGER | NOT NULL |
| `fiber_mg_per_100g` | INTEGER |  |
| `serving_g_x10` | INTEGER |  |
| `serving_label` | TEXT |  |
| `verified` | INTEGER | NOT NULL, default 0 |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `owner_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `foods_name_idx`
- `foods_owner_idx` (partial)
- `foods_source_ref_uidx` (unique) (partial)

## Triggers

- `trg_foods_fts_del`
- `trg_foods_fts_ins`
- `trg_foods_fts_upd`
- `trg_foods_touch`

## Constraints

- `source IN ('usda', 'off', 'manual', 'system'`
- `source_ref IS NULL OR length(source_ref`
- `length(trim(name`
- `brand IS NULL OR length(brand`
- `kcal_per_100g_x10 BETWEEN 0 AND 9000`
- `protein_mg_per_100g BETWEEN 0 AND 100000`
- `carb_mg_per_100g BETWEEN 0 AND 100000`
- `fat_mg_per_100g BETWEEN 0 AND 100000`
- `fiber_mg_per_100g IS NULL OR fiber_mg_per_100g BETWEEN 0 AND 100000`
- `serving_g_x10 IS NULL OR serving_g_x10 BETWEEN 1 AND 100000`
- `serving_label IS NULL OR length(serving_label`
- `verified IN (0, 1`

Back to [[ERD]].

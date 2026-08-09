---
type: table
table: exercise_translations
summary: 10 columns, 4790 rows
rows: 4790
tags: [data-model, generated]
---

# `exercise_translations`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `exercise_id` | INTEGER | NOT NULL, → exercises.id |
| `lang` | TEXT | NOT NULL |
| `name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL |
| `description` | TEXT |  |
| `instructions` | TEXT |  |
| `origin` | TEXT | NOT NULL, default 'dataset' |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `exercise_id` → `exercises.id` (on delete CASCADE)

## Indexes

- `exercise_translations_lang_idx`
- `exercise_translations_unique` (unique)

## Triggers

- `exercise_translations_fts_delete`
- `exercise_translations_fts_insert`
- `exercise_translations_fts_update`
- `exercise_translations_updated_at`

## Constraints

- `lang GLOB '[a-z][a-z]'`
- `origin IN ('dataset', 'human', 'machine'`

Back to [[ERD]].

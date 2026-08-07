---
type: table
table: user_theme_prefs
summary: 6 columns, 4 rows
rows: 4
tags: [data-model, generated]
---

# `user_theme_prefs`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-07.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, → users.id |
| `pack` | TEXT | NOT NULL, default 'midnight', → theme_packs.key |
| `accent` | TEXT |  |
| `gradient` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `pack` → `theme_packs.key` (on delete RESTRICT)
- `user_id` → `users.id` (on delete CASCADE)


## Triggers

- `trg_theme_pack_entitled_ins`
- `trg_theme_pack_entitled_upd`
- `user_theme_prefs_updated_at`

## Constraints

- `accent IS NULL OR accent GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`

Back to [[ERD]].

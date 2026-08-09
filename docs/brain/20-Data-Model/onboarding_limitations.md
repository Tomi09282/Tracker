---
type: table
table: onboarding_limitations
summary: 6 columns, 3 rows
rows: 3
tags: [data-model, generated]
---

# `onboarding_limitations`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → onboarding_profiles.user_id |
| `body_area` | TEXT | NOT NULL |
| `severity` | TEXT | NOT NULL, default 'caution' |
| `note` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `onboarding_profiles.user_id` (on delete CASCADE)

## Indexes

- `idx_onboarding_limitations_user`
- `sqlite_autoindex_onboarding_limitations_1` (unique)


## Constraints

- `body_area IN ( 'neck', 'shoulder', 'elbow', 'wrist', 'upper-back', 'lower-back', 'hip', 'knee', 'ankle', 'foot', 'chest', 'abdomen', 'other'`
- `severity IN ('past', 'caution', 'avoid'`
- `note IS NULL OR length(note`

Back to [[ERD]].

---
type: table
table: coach_profile_specialties
summary: 2 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `coach_profile_specialties`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, NOT NULL, → coach_profiles.user_id |
| `specialty_key` | TEXT | PK, NOT NULL, → coach_specialties.key |

## Foreign keys

- `specialty_key` → `coach_specialties.key` (on delete NO ACTION)
- `user_id` → `coach_profiles.user_id` (on delete CASCADE)

## Indexes

- `coach_profile_specialties_key_idx`
- `sqlite_autoindex_coach_profile_specialties_1` (unique)

## Triggers

- `trg_profile_specialty_active_ins`
- `trg_profile_specialty_cap_ins`


Back to [[ERD]].

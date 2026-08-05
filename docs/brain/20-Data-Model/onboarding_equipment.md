---
type: table
table: onboarding_equipment
summary: 2 columns, 6 rows
rows: 6
tags: [data-model, generated]
---

# `onboarding_equipment`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-05.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, NOT NULL, → onboarding_profiles.user_id |
| `equipment_id` | INTEGER | PK, NOT NULL, → equipment.id |

## Foreign keys

- `equipment_id` → `equipment.id` (on delete CASCADE)
- `user_id` → `onboarding_profiles.user_id` (on delete CASCADE)

## Indexes

- `idx_onboarding_equipment_eq`
- `sqlite_autoindex_onboarding_equipment_1` (unique)



Back to [[ERD]].

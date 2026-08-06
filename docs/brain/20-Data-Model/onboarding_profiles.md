---
type: table
table: onboarding_profiles
summary: 18 columns, 3 rows
rows: 3
tags: [data-model, generated]
---

# `onboarding_profiles`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-06.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, → users.id |
| `status` | TEXT | NOT NULL, default 'draft' |
| `step` | INTEGER | NOT NULL, default 0 |
| `primary_goal` | TEXT |  |
| `experience` | TEXT |  |
| `sessions_per_week` | INTEGER |  |
| `session_minutes` | INTEGER |  |
| `training_location` | TEXT |  |
| `units` | TEXT | NOT NULL, default 'metric' |
| `height_cm` | REAL |  |
| `bodyweight_kg` | REAL |  |
| `birth_year` | INTEGER |  |
| `sex` | TEXT |  |
| `notes` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |
| `completed_at` | INTEGER |  |
| `timezone` | TEXT |  |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)


## Triggers

- `trg_onboarding_touch`

## Constraints

- `status IN ('draft', 'complete'`
- `step BETWEEN 0 AND 20`
- `primary_goal IN ( 'strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport'`
- `experience IN ('none', 'beginner', 'intermediate', 'advanced'`
- `sessions_per_week BETWEEN 1 AND 14`
- `session_minutes BETWEEN 10 AND 240`
- `training_location IN ('gym', 'home', 'outdoor', 'mixed'`
- `units IN ('metric', 'imperial'`
- `height_cm BETWEEN 90 AND 260`
- `bodyweight_kg BETWEEN 25 AND 400`
- `birth_year BETWEEN 1900 AND 2100`
- `sex IN ('female', 'male', 'other', 'undisclosed'`

Back to [[ERD]].

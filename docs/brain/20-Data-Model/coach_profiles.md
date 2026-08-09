---
type: table
table: coach_profiles
summary: 16 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `coach_profiles`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | PK, → users.id |
| `handle` | TEXT | NOT NULL |
| `display_name` | TEXT | NOT NULL |
| `headline` | TEXT |  |
| `bio_src` | TEXT |  |
| `bio_doc` | TEXT |  |
| `doc_version` | INTEGER |  |
| `city_key` | TEXT | → public_cities.key |
| `verified_at` | INTEGER |  |
| `verified_by` | INTEGER | → users.id |
| `published_at` | INTEGER |  |
| `removed_at` | INTEGER |  |
| `removed_by` | INTEGER | → users.id |
| `removal_reason` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `removed_by` → `users.id` (on delete SET NULL)
- `verified_by` → `users.id` (on delete SET NULL)
- `city_key` → `public_cities.key` (on delete NO ACTION)
- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `coach_profiles_city_fk_idx` (partial)
- `coach_profiles_removed_by_fk_idx` (partial)
- `coach_profiles_verified_by_fk_idx` (partial)
- `coach_profiles_verified_idx` (partial)
- `coach_profiles_public_city_idx` (partial)
- `coach_profiles_public_idx` (partial)
- `sqlite_autoindex_coach_profiles_1` (unique)

## Triggers

- `trg_profile_handle_available_ins`
- `trg_profile_handle_available_upd`
- `trg_profile_handle_retire_del`
- `trg_profile_handle_retire_upd`
- `trg_profile_publish_standing_ins`
- `trg_profile_publish_standing_upd`
- `trg_profile_removal_pair_ins`
- `trg_profile_removal_pair_upd`
- `trg_profile_removal_reasoned_upd`
- `trg_profile_removed_by_admin_upd`
- `trg_profile_verified_by_admin_ins`
- `trg_profile_verified_by_admin_upd`
- `trg_profile_verified_pair_ins`
- `trg_profile_verified_pair_upd`

## Constraints

- `handle NOT GLOB '*[^a-z0-9-]*' AND handle GLOB '[a-z0-9]*' AND substr(handle, -1, 1`
- `length(display_name`
- `headline IS NULL OR length(headline`
- `bio_src IS NULL OR length(bio_src`
- `bio_doc IS NULL OR (json_valid(bio_doc`
- `doc_version IS NULL OR (typeof(doc_version`
- `removal_reason IS NULL OR length(removal_reason`
- `(bio_src IS NULL`
- `(bio_doc IS NULL`

Back to [[ERD]].

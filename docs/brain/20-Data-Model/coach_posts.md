---
type: table
table: coach_posts
summary: 24 columns, 2 rows
rows: 2
tags: [data-model, generated]
---

# `coach_posts`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `public_id` | TEXT | NOT NULL |
| `author_user_id` | INTEGER | NOT NULL, → users.id |
| `kind_key` | TEXT | NOT NULL, → post_kinds.key |
| `title` | TEXT | NOT NULL |
| `body_src` | TEXT | NOT NULL |
| `body_doc` | TEXT | NOT NULL |
| `body_excerpt` | TEXT | NOT NULL |
| `doc_version` | INTEGER | NOT NULL |
| `city_key` | TEXT | → public_cities.key |
| `event_at` | INTEGER |  |
| `event_tz` | TEXT |  |
| `capacity` | INTEGER |  |
| `price_minor` | INTEGER |  |
| `price_currency` | TEXT | → public_currencies.code |
| `published_at` | INTEGER |  |
| `deleted_at` | INTEGER |  |
| `removed_at` | INTEGER |  |
| `removed_by` | INTEGER | → users.id |
| `removal_reason` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |
| `write_uid` | TEXT |  |
| `row_version` | INTEGER | NOT NULL, default 1 |

## Foreign keys

- `removed_by` → `users.id` (on delete SET NULL)
- `price_currency` → `public_currencies.code` (on delete NO ACTION)
- `city_key` → `public_cities.key` (on delete NO ACTION)
- `kind_key` → `post_kinds.key` (on delete NO ACTION)
- `author_user_id` → `users.id` (on delete CASCADE)

## Indexes

- `coach_posts_write_uid_uidx` (unique) (partial)
- `coach_posts_removed_by_fk_idx` (partial)
- `coach_posts_currency_fk_idx` (partial)
- `coach_posts_city_fk_idx` (partial)
- `coach_posts_kind_fk_idx`
- `coach_posts_doc_version_idx`
- `coach_posts_author_published_idx`
- `coach_posts_author_manage_idx`
- `coach_posts_feed_event_idx` (partial)
- `coach_posts_feed_kind_idx` (partial)
- `coach_posts_feed_author_idx` (partial)
- `coach_posts_feed_city_idx` (partial)
- `coach_posts_feed_idx` (partial)
- `sqlite_autoindex_coach_posts_1` (unique)

## Triggers

- `trg_coach_posts_fts_del`
- `trg_coach_posts_fts_ins`
- `trg_coach_posts_fts_upd`
- `trg_post_doc_needs_a_source_upd`
- `trg_post_excerpt_is_derived_upd`
- `trg_post_frozen_while_removed_upd`
- `trg_post_identity_frozen_upd`
- `trg_post_kind_shape_ins`
- `trg_post_kind_shape_upd`
- `trg_post_publish_quota_ins`
- `trg_post_publish_quota_upd`
- `trg_post_publish_standing_ins`
- `trg_post_publish_standing_upd`
- `trg_post_published_at_write_once_upd`
- `trg_post_removal_pair_ins`
- `trg_post_removal_pair_upd`
- `trg_post_removal_reasoned_upd`
- `trg_post_removed_by_admin_upd`
- `trg_post_restore_standing_upd`

## Constraints

- `public_id NOT GLOB '*[^A-Za-z0-9_-]*' AND length(public_id`
- `length(title`
- `length(body_src`
- `json_valid(body_doc`
- `length(body_excerpt`
- `typeof(doc_version`
- `event_at IS NULL OR (typeof(event_at`
- `event_tz IS NULL OR (length(event_tz`
- `capacity IS NULL OR (typeof(capacity`
- `price_minor IS NULL OR (typeof(price_minor`
- `published_at IS NULL OR typeof(published_at`
- `removal_reason IS NULL OR length(removal_reason`

Back to [[ERD]].

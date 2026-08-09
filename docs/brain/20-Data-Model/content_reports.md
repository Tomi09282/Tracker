---
type: table
table: content_reports
summary: 15 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `content_reports`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-09.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `subject_post_id` | INTEGER | → coach_posts.id |
| `subject_profile_id` | INTEGER | → coach_profiles.user_id |
| `subject_author_user_id` | INTEGER | → users.id |
| `reporter_user_id` | INTEGER | → users.id |
| `reason_key` | TEXT | NOT NULL, → report_reasons.key |
| `note` | TEXT |  |
| `body_snapshot` | TEXT |  |
| `snapshot_truncated` | INTEGER | NOT NULL, default 0 |
| `status_key` | TEXT | NOT NULL, default 'open', → report_statuses.key |
| `resolved_at` | INTEGER |  |
| `resolved_by` | INTEGER | → users.id |
| `resolution_note` | TEXT |  |
| `request_id` | TEXT |  |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `resolved_by` → `users.id` (on delete SET NULL)
- `status_key` → `report_statuses.key` (on delete NO ACTION)
- `reason_key` → `report_reasons.key` (on delete NO ACTION)
- `reporter_user_id` → `users.id` (on delete SET NULL)
- `subject_author_user_id` → `users.id` (on delete CASCADE)
- `subject_profile_id` → `coach_profiles.user_id` (on delete CASCADE)
- `subject_post_id` → `coach_posts.id` (on delete CASCADE)

## Indexes

- `content_reports_resolver_fk_idx` (partial)
- `content_reports_status_fk_idx`
- `content_reports_reason_fk_idx`
- `content_reports_author_idx`
- `content_reports_reporter_idx`
- `content_reports_subject_profile_idx` (partial)
- `content_reports_subject_post_idx` (partial)
- `content_reports_queue_idx`
- `content_reports_dedupe_profile_idx` (unique) (partial)
- `content_reports_dedupe_post_idx` (unique) (partial)

## Triggers

- `trg_report_daily_quota_ins`
- `trg_report_not_self_ins`
- `trg_report_reason_reportable_ins`
- `trg_report_resolution_consistent_ins`
- `trg_report_resolution_consistent_upd`
- `trg_report_resolver_is_admin_upd`
- `trg_report_shape_ins`
- `trg_report_snapshot_cleared_upd`
- `trg_report_subject_frozen_upd`

## Constraints

- `note IS NULL OR length(note`
- `body_snapshot IS NULL OR length(body_snapshot`
- `snapshot_truncated IN (0,1`
- `resolution_note IS NULL OR length(resolution_note`

Back to [[ERD]].

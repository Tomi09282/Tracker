---
type: table
table: events
summary: 15 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `events`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | NOT NULL, → users.id |
| `title` | TEXT | NOT NULL |
| `notes` | TEXT |  |
| `location` | TEXT |  |
| `all_day` | INTEGER | NOT NULL, default 0 |
| `start_at` | INTEGER | NOT NULL |
| `end_at` | INTEGER | NOT NULL |
| `start_local` | TEXT | NOT NULL |
| `tz` | TEXT | NOT NULL |
| `recurrence_json` | TEXT |  |
| `until_date` | TEXT |  |
| `client_key` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |
| `updated_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `user_id` → `users.id` (on delete CASCADE)

## Indexes

- `events_user_start_idx`
- `events_client_key_uidx` (unique)

## Triggers

- `trg_event_identity_frozen`

## Constraints

- `typeof(title`
- `notes IS NULL OR (typeof(notes`
- `location IS NULL OR (typeof(location`
- `all_day IN (0, 1`
- `typeof(start_at`
- `typeof(end_at`
- `length(start_local`
- `length(tz`
- `recurrence_json IS NULL OR (length(recurrence_json`
- `until_date IS NULL OR until_date = date(until_date`
- `length(client_key`
- `end_at >= start_at AND end_at - start_at <= 14 * 86400 + 3600`

Back to [[ERD]].

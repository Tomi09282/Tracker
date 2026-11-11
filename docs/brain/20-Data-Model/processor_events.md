---
type: table
table: processor_events
summary: 7 columns, 0 rows
rows: 0
tags: [data-model, generated]
---

# `processor_events`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `provider` | TEXT | NOT NULL, default 'stripe' |
| `event_id` | TEXT | NOT NULL |
| `event_type` | TEXT | NOT NULL |
| `event_at` | INTEGER | NOT NULL |
| `received_at` | INTEGER | NOT NULL, default unixepoch() |
| `request_id` | TEXT |  |


## Indexes

- `processor_events_received_idx`
- `processor_events_unique_idx` (unique)



Back to [[ERD]].

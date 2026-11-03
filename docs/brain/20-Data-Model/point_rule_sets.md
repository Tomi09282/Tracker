---
type: table
table: point_rule_sets
summary: 5 columns, 1 rows
rows: 1
tags: [data-model, generated]
---

# `point_rule_sets`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-11-03.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | PK |
| `rules_json` | TEXT | NOT NULL |
| `note` | TEXT |  |
| `created_by` | INTEGER | → users.id |
| `created_at` | INTEGER | NOT NULL, default unixepoch() |

## Foreign keys

- `created_by` → `users.id` (on delete SET NULL)


## Triggers

- `trg_point_rule_set_immutable`
- `trg_point_rule_set_no_delete`

## Constraints

- `json_valid(rules_json`
- `note IS NULL OR length(trim(note`

Back to [[ERD]].

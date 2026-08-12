---
type: table
table: schema_migrations
summary: 2 columns, 24 rows
rows: 24
tags: [data-model, generated]
---

# `schema_migrations`

> [!info] Generated file
> Written by `backend/scripts/brain-gen.mjs` from the LIVE schema and the mounted routers.
> Do not hand-edit — run `npm run brain:gen` instead. Last generated: 2026-08-12.

| Column | Type | Notes |
|---|---|---|
| `version` | INTEGER | PK |
| `applied_at` | INTEGER | NOT NULL, default unixepoch() |





Back to [[ERD]].

---
type: adr
title: ADR-0001 Numbered migrations via PRAGMA user_version
status: accepted
phase: 1
date: 2026-08-03
---

> [!warning] HISTORICAL — the code this note described was deleted 2026-08-04
> Kept for its engineering lessons only. Nothing here describes running code.
> See [[60-Decisions/0006 Full rebuild from scratch|ADR-0006]].

# ADR-0001 — Numbered migrations via `PRAGMA user_version`

**Context.** BASE executed `schema.sql` at boot — fine for a greenfield scaffold, wrong the
moment a live DB must evolve. The webdev-standards skill mandates a numbered migration
runner with `user_version` as the gate.

**Decision.** `src/db/migrations/NNN_name.sql`, applied in filename order inside one
transaction each; the migration itself sets `PRAGMA user_version = N` **inside** its
transaction (a PRAGMA outside the tx would persist even on rollback). Boot applies all
pending migrations before listening. `001_init.sql` is BASE's schema converted;
`002_phase1.sql` is spec §3.2/§3.3 verbatim.

**Consequences.** Schema drift is impossible to hide; a fresh DB and an upgraded DB
converge; FTS5 availability is proven at boot by 002 applying (AC-1). Checksums for
tamper detection deferred to the first production DB (spec Q-7).

**Revisit when:** production deploy (adopt checksums).

---
type: adr
title: ADR-0005 better-sqlite3 worker-tx commit-on-return law
status: accepted
phase: 1
date: 2026-08-03
---

> [!warning] The CODE this note described was deleted 2026-08-04 — but the LAW is live and now
> enforced by a gate. See [[60-Decisions/0006 Full rebuild from scratch|ADR-0006]] for the rebuild.
>
> **2026-08-05: clause 3 became `backend/scripts/check-worker-tx.mjs`** (`npm run check:worker-tx`),
> and it found a real violation on its first run — `copyDaysTx` grew a plan's cycle before checking
> the destination slots, so a refused copy committed the growth. Because the schedule is
> `starts_on + k*cycle_days + day_index`, that silently re-dated every future occurrence for the
> client. **The bug outlived the rebuild this banner describes**, which is the argument for gates
> over checklists in one sentence.

# ADR-0005 — Worker-tx law: a tx that returns, commits

**Context.** REVIEW-PVP (Fable, proven live): `updateExercise` ran its field UPDATE
before junction validation, then `return { code: 'VALIDATION' }` — and better-sqlite3's
`.transaction()` **commits on return**. The client got a 400 while the rename silently
persisted. Only `throw` rolls back.

**Decision (law for every current and future worker fn).**
1. Inside a worker transaction, ALL validation that can produce an error result runs
   BEFORE the first write statement.
2. After any write, the tx body may only complete — never conditionally return an error
   result. If post-write failure semantics are ever needed, throw a typed error and let
   the route map it.
3. Code-review checklist item for every future PR touching `worker.js`: grep the tx body
   for `run(` followed by a conditional `return`.

**Consequences.** Guard-in-UPDATE patterns (guarded `UPDATE … WHERE owner`, `changes===0`
probes) are unaffected — the guard lives in the SQL, and the probe-after-zero-changes is a
read, not a write. Fixed in Phase 1 fix round: `updateExercise`, `updateElementStyles`,
plus a comment at the `tx()` helper stating the law.

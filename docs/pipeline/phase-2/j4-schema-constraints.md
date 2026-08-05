# J4 — the constraints migration 010 must satisfy

Distilled from `j4-schema-research.json` (481 KB): three independent schema designs, each attacked
from a security angle and a maintenance angle. **39 fatal flaws, 67 serious.** Every verdict was
"fixable" — none of the three designs was thrown away, and the recurring flaws below are what all
of them got wrong in one form or another.

This file is the checklist. The migration is not done until every line here is answered.

## All three designs independently reached the same conclusion

| design | thesis |
|---|---|
| Snapshot Session | the session is a self-contained snapshot minted at start — the player needs zero network and zero joins while the client trains |
| Copy-on-assign | a template is a mould, never a live link: assigning deep-copies the plan, logging deep-copies the prescription |
| History-integrity | a log is a historical fact, not a view of current state |

**COPY, DO NOT REFERENCE.** Three designers, three different starting lenses, one answer. That is
the strongest signal in the whole exercise and it is the spine of the schema.

## The recurring fatal flaws — ranked by how many designs had them

### 1. A denormalised owner column with no coherence constraint (all three)
Every design denormalised an owner or parent id for query speed, and every design left at least one
of them unguarded. `workout_log_sets.log_id`, `plan_assignments.client_id`,
`workout_plans.client_user_id` — each was a client-supplied FK that nothing tied to its parent's
owner. Cross-tenant write, reachable from the lowest-privilege role.

**Rule: a denormalised id gets a BEFORE INSERT *and* BEFORE UPDATE trigger, or it does not exist.**
One design added the trigger to one such column and not its sibling.

### 2. INSERT has no WHERE clause (all three)
Ownership predicates were written for the UPDATE path and quietly assumed for INSERT. But
`INSERT ... VALUES` admits no guard. A coach could inject a plan into a stranger's client.

**Rule: every ownership-bearing INSERT is `INSERT ... SELECT ... WHERE <ownership>`, or it is
guarded by a trigger. Never `VALUES`.**

### 3. Idempotency keyed on STATE, not on request identity (two designs)
"Replay" was detected as `completed_at IS NULL`. That makes "the same request twice" and "a
different request against the same set" indistinguishable — the second silently overwrites.

**Rule: the client-supplied idempotency key must participate in the uniqueness constraint the
upsert conflicts on. If it does not appear in the index, it is decoration.**

### 4. A derived cache the same batch both reads and advances (all three)
PR detection compared against `exercise_records`, which the same transaction then updated. The
number of PRs — and in Phase 7 the number of coins — therefore depended on network delivery order.

**Rule: derive PRs from the set rows, not from the record cache. A cache may be a read
accelerator; it may never be the source of the comparison that creates it.**

### 5. Warm-up sets poisoning the record book
One design filtered `set_kind <> 'warmup'` in the PR layer and nowhere else, so warm-ups still
moved `top_weight_kg`, `total_reps` and the records upsert.

### 6. Formula versioning breaking the thing it protects
Storing `e1rm_formula` alongside a stored e1RM, then indexing and comparing on the value WITHOUT
the formula column, means changing the formula silently corrupts every comparison.

### 7. Freeze triggers that guard a subset of columns
A "frozen" completed log could still have its `plan_id`, `bodyweight_kg` and every rollup rewritten,
because the trigger listed five columns and the table had twenty.

### 8. ON DELETE CASCADE stranding or erasing history
`exercises.owner_id` cascades from `users`; log tables cascade from `exercises`. Deleting a coach
account would erase clients' training history — and no later migration can change an FK action.

**Rule: history never cascades. A log row keeps its own copy of what it needs.**

### 9. Out-of-order arrival is not the same problem as replay
Every idempotency story proved that resending an identical payload is safe, then assumed that is
all an offline queue does. It is not: twelve queued set-checks arrive interleaved and duplicated.

### 10. A durable bearer token outside the archive story
The ICS calendar feed token had `revoked_at` but no expiry and no link to `coach_clients`, so
archiving a client left a working URL to their schedule.

### 11. `syncOfflineQueue` was structurally unimplementable
Promised ONE immediate transaction, AND per-op results, AND a throw on a bad op. Under
better-sqlite3's commit-on-return law (ADR-0005) you can have any two.

### 12. Both critics caught it: **migration 009 is already taken**
`009_language_roster.sql` exists. The workflow's ground truth said user_version 8 because that was
true when it started; the roster landed while the designs were being attacked. The migration runner
**silently skips** a duplicate number rather than rejecting it.

**The next migration is `010`.** Worth a separate guard: the runner should refuse a duplicate
number instead of skipping it.

## Type-affinity traps worth naming

`reps INTEGER` is affinity, not a type — a REAL sails through `BETWEEN 1 AND 100`. A CHECK that
validates a stored e1RM against a formula chosen by a column the writer also supplies is
self-disabling.

## Source

Full designs, every flaw and every proposed fix: `j4-schema-research.json`.

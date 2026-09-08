---
type: adr
title: ADR-0012 — Exercise filtering is opt-in on top of flagging, not a replacement for it
status: accepted
phase: coach-tooling
date: 2026-09-09
tags: [decision, coach, plan-editor, library]
---

# ADR-0012 — Filtering is opt-in on top of flagging

**Owner decision, 2026-09-09.**

## Context

[[coach-plan-editor]] specifies the exercise picker as flag-only:

> Results are flagged, never filtered: an alert-toned body-area chip (`Térd`) when the movement
> loads an area the client must avoid, a softer tone for milder conflicts, plus a grey
> `2 eszköz hiányzik`.

The reasoning behind that is sound and is not in dispute: a movement that is hidden is a movement
the coach never learns exists, and a picker that silently shrinks its own library teaches the coach
to distrust it.

What the owner reported is a different failure. Building a plan, there is no way to narrow the list
by muscle group, by equipment, or by any combination of those with the name. The picker sends `q`
and `for_client` and nothing else (`frontend/src/features/plans/PlanEditorPage.tsx:98`) — even
though `GET /exercises` has accepted `muscle`, `equipment`, `difficulty` and `type` since migration
003, and the taxonomy junctions those read were built for exactly this.

Separately, `frontend/src/features/library/LibraryPage.tsx:73` records that the equipment chip strip
was removed from the library **on purpose** — two identical horizontal chip strips stacked, told
apart only by an 11px label — and leaves the replacement as a recorded open question: *a filter
sheet behind the funnel badge*.

So the gap is not a missing capability. It is a missing surface, in a screen whose spec forbids the
obvious version of that surface.

## Decision

Flagging stays the default. Filtering is added as a layer the coach opts into.

- Muscle, equipment, difficulty and type reach the picker through a **filter sheet behind a funnel
  badge**, the badge carrying the count of active filters.
- In the coach context the sheet also carries two toggles — `Csak amihez van eszköze` and
  `Konfliktusok elrejtése` — and **both default to off**.
- With every toggle off and no filter set, the picker behaves exactly as the spec describes today:
  full library, flags on the rows that need them.

This answers the library's open question with the same component. One picker, two callers.

## The toggles filter on the server, not in the client

The exercise list is cursor-paginated (`limit + 1`, `cursor` opaque). Filtering the returned page in
the browser would drop a 20-row page to three rows, and the "there is more" signal would then be a
lie about a page the server already considers complete. Both toggles therefore become query
parameters — `only_available=1` and `hide_conflicts=1`, valid only alongside `for_client` — and the
same SQL that computes `missing_equipment` and `conflicts` narrows the result set instead of
annotating it.

`equipment` becomes multi-valued at the same time, because a sheet with tick boxes produces a set,
not a single slug.

## Consequences

- The spec's sentence stands with a clause added: results are flagged **by default**, and filtered
  only on explicit request. The default screenful is unchanged.
- `GET /exercises` gains two parameters and widens one. No schema change.
- The library and the plan editor stop drawing two different lists from one endpoint. The picker
  moves out of `PlanEditorPage.tsx`, which is 926 lines and is the reason a shared component was not
  reached for the first time.
- **Revisit if** the toggles turn out to be left on permanently. That would not mean the toggles are
  wrong — it would mean the default is, and the decision here is what to flip.

## Related

[[coach-plan-editor]] · [[library]] · [[0013-coach-writes-client-equipment]]

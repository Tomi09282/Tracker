---
type: adr
title: ADR-0013 — The coach may write a client's equipment, and nothing else in the profile
status: accepted
phase: coach-tooling
date: 2026-09-09
tags: [decision, coach, onboarding, audit]
---

# ADR-0013 — The coach writes equipment, and only equipment

**Owner decision, 2026-09-09.**

## Context

`onboarding_equipment` is the client's own answer to "what can you actually reach", collected on
step three of onboarding. Migration 008 states what it is for:

> the plan builder filters exercises by it — `WHERE equipment_id IN (...)` against a JSON blob is a
> table scan

`for_client` reads it to compute `missing_equipment` per row, which is what draws the grey
`2 eszköz hiányzik` chip in the picker.

The coach can **read** that profile — `GET /clients/:id/onboarding`, `requireCoach`, keyed on the
link — and can write none of it. That is the hole. The plan builder flags and (per [[0012-opt-in-exercise-filtering]])
now filters on a list the coach can see is wrong and cannot correct. The client is not in the room
when the plan is written, and "message the client, wait, re-open the editor" is not a workflow.

A second gap sits next to it and is a plain omission rather than a design tension: nothing in
`SettingsPage.tsx` links to the equipment editor at all. The route `/onboarding` is live and
unguarded after completion, and `PATCH /onboarding` already accepts `equipment: number[]` — so the
client's own path exists and has no door. [[settings]] does not mention it either.

## Decision

**The client gets a door.** A `Felszerelés` section in Settings, reusing the onboarding chip field
against the existing `PATCH /onboarding`. No new endpoint.

**The coach gets a narrow one.** A new route that writes the equipment set and nothing else:

```
PATCH /clients/:linkId/onboarding/equipment
```

- `requireCoach`, keyed on the **link**, not on the user id — matching its neighbour, so access ends
  when the link is archived rather than at the next token refresh.
- **One transaction, three writes**: replace the equipment set, insert an `audit_log` row, insert a
  `notifications` row addressed to the client.
- Goals, experience, body data, units, sex and limitations stay client-only.

## Why equipment only

The `conflicts` half of `for_client` derives from `onboarding_limitations` — what the client said
about their own injuries. A coach who can overwrite that can silently erase the safety signal the
flag exists to raise, from inside the screen the flag is drawn on.

Equipment is a fact about a room, and a coach who has seen the room may know it better than the
client did during onboarding. A limitation is a fact about a body, and the only authority on it is
the person in that body. The line is drawn there and not at "the coach is trusted", because the
trust is not what is in question — the failure mode is.

## Why the audit row is not left to whoever writes the route

`check-admin-audit` gates every route behind `requireRole('admin')` and states its own reasoning:

> Every admin write in this product currently writes an audit row. That is a fact about today, and
> it was true because whoever wrote each route remembered. […] the failure is SILENT

That argument transfers verbatim to a coach writing another user's row, and the gate cannot see it,
because the gate looks for the admin role. **The gate is extended to cover coach cross-user writes**
as part of this work. Adding the audit line without extending the gate would reproduce exactly the
condition the gate was written to end: a fact about today, held up by memory.

The notification is not decoration either. A client whose equipment list changes under them, with no
trace, learns that the app edits their answers — and the next thing they distrust is the injury
list.

## Consequences

- One new route, one new gate clause, one new Settings section.
- `onboarding_equipment` keeps its `PRIMARY KEY (user_id, equipment_id)`. **One equipment set per
  client**, no location profiles — see below.
- Last write wins between coach and client. The set is small, the write is a replace, and the
  notification means the loser of a race finds out.
- **Revisit if** clients turn out to train in two places with different kit. The owner considered
  gym/home/travel profiles and declined them for now: it is a `profile_id` on the junction's primary
  key, a migration, a switcher in the UI, and a fourth thing `for_client` has to know. Additive when
  wanted, so nothing here forecloses it.

## Related

[[0012-opt-in-exercise-filtering]] · [[settings]] · [[onboarding]] · [[coach-client-detail]]

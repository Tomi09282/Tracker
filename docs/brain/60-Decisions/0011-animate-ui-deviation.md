---
type: adr
title: ADR-0011 — Animate UI not installed; components hand-built on Pressable
status: accepted
phase: 1
date: 2026-08-06
tags: [decision, phase-1, design-system]
---

# ADR-0011 — Animate UI not installed (accepted deviation)

**Owner decision, 2026-08-06: the deviation is accepted.** T1.11 closes.

## Context

The Phase 1 spec named three things for the component layer: **Animate UI** source-installed,
**Motion** as the animation runtime, and **Lucide** as the icon set. Motion and Lucide are in, as
specified. Animate UI is not.

## What was built instead

Every interactive control composes one primitive, `frontend/src/ui/primitives/Pressable.tsx`, built
on the shared `control.ts` recipe. That primitive owns:

- the **44 px minimum target**, structurally rather than by each component remembering,
- the five interaction states (rest, hover, press, focus-visible, disabled),
- the token-only styling contract, and
- the busy/loading state.

## Why

**The 44 px floor and the five states have to live in ONE place the build can enforce.** The token
gate (`npm run check:tokens`) rejects a raw `<button>` anywhere outside `src/ui/`, and the E2E walks
measure every interactive element on every route in both roles. Both of those work because there is
exactly one control implementation to check.

A vendored component set inverts that: each component arrives with its own sizing, its own state
handling and its own raw values, and each would need patching to obey the floor and the token
layer — with nothing preventing the next vendored component from arriving unpatched. The
enforcement would move from the build back into somebody's memory, which is the failure mode this
project has spent two phases eliminating.

## Consequences

- Fewer components come for free; each new control is written against `Pressable`.
- The 44 px floor is provable rather than asserted — measured across 27 route/role/width
  combinations with zero violations ([[E2E Matrix Phase-1]], [[E2E Matrix Phase-2]]).
- Motion and Lucide are unaffected and are used as the spec intended.
- **Revisit if** the owner later wants Animate UI's specific components. The migration cost is
  real but bounded: the interaction contract already exists, so vendored components would be
  adapted to `control.ts` rather than the other way round.

## Related

[[0007 Design system inputs and conflict resolution]] · [[TODO Phase-1]] T1.11

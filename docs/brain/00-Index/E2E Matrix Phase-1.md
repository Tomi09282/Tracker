---
type: report
title: Webview E2E matrix — Phase 1
updated: 2026-08-06
tags: [audit, phase-1, e2e]
---

# Webview E2E matrix — Phase 1 (T1.43)

Never ran until now; it was one of the two items holding Phase 1 open. Walked at **360 × 740** —
the width the Phase 1 spec names, narrower than the 375 the Phase 2 matrix used — and at
**1440 × 900**, in **both roles**, because a role gate renders a different page and half the
defects found were on those gated pages.

**27 route/role/width combinations. Zero defects remaining.**

## What was asserted

Same probe as [[E2E Matrix Phase-2]]: horizontal overflow, targets under 44 × 44, exactly one `h1`,
images without `alt`, and clipped text with no ellipsis. All measured in the DOM.

## Result

| route | user @360 | coach @360 | user @1440 | coach @1440 |
|---|---|---|---|---|
| `/` home | ✅ | ✅ | ✅ | ✅ |
| `/library` | ✅ | ✅ | ✅ | ✅ |
| `/workout` | ✅ | ✅ | ✅ | ✅ |
| `/settings` | ✅ | ✅ | ✅ | ✅ |
| `/admin` | ✅ *(fixed)* | ✅ | ✅ | ✅ |
| `/progress` | ✅ | ✅ | — | — |
| `/coach` | ✅ *(fixed)* | ✅ | ✅ | ✅ |
| `/coach/plans` | ✅ | ✅ | — | ✅ |
| `/coach/clients/:id` | — | ✅ | — | ✅ |
| `/coach/plans/:id` | — | ✅ | — | ✅ |

## The defects, and the pattern behind them

Two, and they are the **same shape as the one the Phase 2 walk found** — which is why the pattern
is worth naming rather than just fixing:

> **A role gate that renders nothing but an `EmptyState` leaves the page with no `h1`.**

`EmptyState` renders an `h2`, correctly, because it usually sits inside a screen that already has a
heading. On a gated route it IS the screen. Three routes did this — `/workout` when no session is
running (found in Phase 2), `/admin` for a non-admin, and `/coach` for a non-coach.

The fix is the `heading` prop added during the Phase 2 walk; these two are the remaining call sites
that needed it. Promoting `EmptyState` to `h1` everywhere would be wrong — the other eleven call
sites sit inside pages that already have one, and two `h1`s is its own defect.

**A gated page is the one nobody walks.** Both defects were on routes a developer only sees by
deliberately logging in as the wrong role, which is exactly why the walk had to be done in both.

## Not covered

- Real iOS/Android hardware. Chromium in a webview only.
- Screen readers themselves — the semantics are asserted structurally, not by listening.
- Landscape orientation and OS text scaling.

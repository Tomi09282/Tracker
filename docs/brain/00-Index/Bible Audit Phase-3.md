---
type: report
title: Visual Design Bible audit — Phase 3
updated: 2026-08-06
tags: [audit, phase-3, design]
---

# Visual Design Bible audit — Phase 3

Same split as [[Bible Audit Phase-2]]: **the measurable half is measured in the DOM, the visual
half is named as not covered rather than quietly claimed.** Every verdict comes from a live probe
against the running app at **360 × 740** and **1440 × 900**, on the screens this phase added.

## Measurable — all verified

| axis | rule | 360 | 1440 |
|---|---|---|---|
| **Type scale** | every rendered `font-size` is a declared token | ✅ 0 off-scale | ✅ 0 off-scale |
| **Motion** | every `transition`/`animation` duration is a declared token | ✅ 0 rogue | ✅ 0 rogue |
| **Targets** | every interactive element ≥ 44 × 44 | ✅ 0 violations | ✅ 0 violations |
| **Surfaces** | no pure `#000` / `#fff` background or text | ✅ 0 | ✅ 0 |
| **Overflow** | no horizontal page scroll | ✅ 0 px | ✅ 0 px |
| **Headings** | exactly one `h1` per route | ✅ 1, 1, 1 | ✅ 1, 1, 1 |
| **Raw values** | none outside `tokens.css` | ✅ `check-tokens`, in the build | — |

Routes: `/coach`, `/notifications`, `/coach/clients/:id` (the last carries the **Üzenetek** tab, so
the chat is audited inside its real container rather than in isolation).

Declared durations read **out of the stylesheet**, not restated: `100 · 150 · 250 · 400 ms`.

## The probe was broken on purpose before it was believed

Phase 2 recorded a *false* finding — an audit that carried its own copy of the token list and
therefore drifted from it. This phase closes the other half of the same hole: **an audit that never
fires is indistinguishable from an audit of a clean app.** So before recording a single ✅, five
defects were planted in the live DOM and the probe re-run:

| planted | caught |
|---|---|
| `font-size: 19px` (between `--text-body` 17 and `--text-title-3` 20) | ✅ `offScale: [19]` |
| `transition: opacity 333ms` | ✅ `rogueDur: ["0.333s"]` |
| `background: #fff` | ✅ `pureBW: 1` |
| a 2000 px-wide child | ✅ `overflowX: 560` |
| a 20 × 20 `<button>` | ✅ `smallTargets: 1` |

All five caught, then removed. **The zeros above are measurements, not silence.**

## Adherence — the one thing this phase added to a screen the Bible already covered

The coach roster gained a session count, and it is a **count, never a percentage**. A percentage
needs a denominator, and "how many sessions were prescribed" is the schedule rule — arithmetic over
a window, not a column the roster query can join. The number is computed at read time, so it is
correct on the next request rather than as often as a job runs.

It was proven load-bearing the same way as the probe: read `0`, insert one completed session, read
`1` with a `last_session_on` date, delete it, read `0` again. A number on a coach's screen that
never moves is worse than no number, because it looks like data.

The comment it replaced is worth keeping in mind: the dashboard used to explain the column's
absence with *"nothing logs a workout yet"*. True when written, false the day the player shipped —
**a comment that asserts a state of the world rather than a rule will outlive the world.**

## Not covered, and why

- **Screenshots.** The Browser pane does not composite frames in this session, so no image was
  captured. This costs nothing the table above provides: a screenshot is evidence of a frame, a
  measurement is evidence of a fact, and where the two disagreed in Phase 2 the measurement won.
- **Anything requiring the Bible document itself** — exact hex, spacing rhythm, per-screen
  blueprints. Phase 0 verified all 13 Midnight tokens byte-exact; no colour token has changed since.
- **Composition and hierarchy.** Whether a screen *feels* right is not a DOM property.
- **Real device rendering.** Chromium in a webview, not iOS Safari or Android WebView.
- **Dark/light beyond the token layer.** Both themes resolve from the same variables, which is
  checked structurally by `check-tokens`, not walked visually here.

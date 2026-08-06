---
type: report
title: Visual Design Bible audit — Phase 4
updated: 2026-08-06
tags: [audit, phase-4, design]
---

# Visual Design Bible audit — Phase 4

Same split as [[Bible Audit Phase-3]]: the measurable half is measured in the DOM, the visual half
is named as not covered rather than quietly claimed. Live probe, both widths, on the screens this
phase added.

## Measurable

| axis | rule | 360 | 1440 |
|---|---|---|---|
| **Type scale** | every rendered `font-size` is a declared token | ✅ 0 off-scale | ✅ 0 off-scale |
| **Motion** | every `transition`/`animation` duration is a declared token | ✅ 0 rogue | ✅ 0 rogue |
| **Targets** | every interactive element ≥ 44 × 44 | ⚠️ **1 found, fixed** | ✅ 0 |
| **Surfaces** | no pure `#000` / `#fff` background or text | ✅ 0 | ✅ 0 |
| **Overflow** | no horizontal page scroll | ✅ 0 px | ✅ 0 px |
| **Headings** | exactly one `h1` per route | ✅ | ✅ |
| **Raw values** | none outside `tokens.css` | ✅ `check-tokens`, in the build | — |
| **Strings** | no key path rendered to a user | ⚠️ **2 found, fixed + gated** | — |

The target violation and the string violations are recorded rather than quietly repaired: an audit
that only ever reports zeros is one nobody has reason to trust. Details in [[E2E Matrix Phase-4]].

## The probe was broken on purpose again

Evidence rule six, from Phase 3: *a probe never seen to fire cannot be told apart from a clean
subject.* Same five defects planted live and all five caught before any ✅ above was written down —
a 19 px font, a 333 ms transition, a `#fff` background, a 2000 px child and a 20 × 20 button.

The `check-i18n` extension got the same treatment for real rather than for show: `common.add` was
deleted from the reference bundle, the gate failed **by name and by file:line**, and the key was
restored. A gate added in response to a defect and never seen to fail is a gate that has not been
tested, it has been written.

## Two decisions that are design rather than layout

- **Every body-measurement chart is `direction="neutral"`.** The chart component can colour a
  change green, and for a lift it does. For a body it does not, because the app does not know
  whether +3 kg is a bulk going well or a month going badly, and a green number is the app
  answering that on somebody's behalf. It is also the cheapest way for a fitness app to say
  something harmful to a person with a disordered relationship to food, and it costs nothing to
  not do.
- **A macro bar clamps its FILL and never its LABEL.** A progress bar that stops at 100% tells a
  person who ate 3200 against a 2500 target exactly what it tells a person who ate 2500. The fill
  has to clamp; the number does not, and past the target the bar turns **warning**, never
  **danger** — someone 300 kcal over has had a normal Tuesday, and the tone of a colour is part of
  what a screen says.

## Not covered, and why

- **Screenshots.** The Browser pane does not composite in this session. Every row above is a
  measurement, which is the evidence that won the two times the two disagreed.
- **Anything requiring the Bible document itself** — exact hex, spacing rhythm, per-screen
  blueprints. Phase 0 verified all 13 Midnight tokens byte-exact; no colour token has changed.
- **Composition and hierarchy.** Whether a screen *feels* right is not a DOM property.
- **Real device rendering.** Chromium in a webview, not iOS Safari or Android WebView.

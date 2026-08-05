---
type: report
title: Visual Design Bible audit — Phase 2
updated: 2026-08-05
tags: [audit, phase-2, design]
---

# Visual Design Bible audit — Phase 2

Same split as Phase 1's T1.44: **the measurable half is measured in the DOM, and the visual half is
named as not covered rather than quietly claimed.** Every verdict below comes from a live probe on
a running app, not from reading the source.

## Measurable — all verified

| axis | rule | result |
|---|---|---|
| **Type scale** | every rendered `font-size` comes from a declared token | ✅ 0 off-scale sizes on 6 routes |
| **Motion** | every `transition-duration` is a declared token | ✅ 0 rogue durations on 6 routes |
| **Targets** | every interactive element ≥ 44 × 44 | ✅ 0 violations after the two E2E fixes |
| **Surfaces** | no pure `#000` / `#fff` backgrounds | ✅ 0 on 6 routes |
| **Overflow** | no horizontal page scroll | ✅ 0 at 375 px and 1440 px |
| **Headings** | exactly one `h1` per route | ✅ after the `EmptyState` fix |
| **Raw values** | none outside `tokens.css` | ✅ `check-tokens` gate, in the build |

The declared durations are `instant 100ms · fast 150ms · base 250ms · slow 400ms`. The rendered set
across every Phase 2 screen is exactly `{100, 150, 250}` — no screen invents a number, and no
screen uses `slow`, which is correct: 400 ms is for a sheet, and Phase 2 shipped no sheets.

## A false finding, recorded because it is instructive

The first pass of this audit reported a Bible violation: a `0.1s` transition that matched none of
the tokens. **The code was right and the audit was wrong** — my probe's token list was typed from
memory and omitted `--duration-instant`, which `control.ts` uses deliberately, with a comment
saying why: *a press must answer immediately*.

The second pass reads the token list **out of the stylesheet** instead of restating it. An audit
that carries its own copy of the thing it is auditing will eventually disagree with it — the same
drift shape as every other defect in this project, in the checking layer rather than the code.

## Not covered, and why

- **Anything requiring the Bible document itself.** Exact hex values, spacing rhythm, the specific
  blueprint each screen must conform to — those need the source, which lives outside this repo.
  The Phase 0 audit verified all 13 Midnight tokens byte-exact against it; nothing since has
  changed a colour token, so that verdict still stands.
- **Composition and hierarchy.** Whether a screen *feels* right is not a DOM property. This is the
  half T1.44 also left open.
- **Real device rendering.** Chromium in a webview, not iOS Safari or Android WebView.

## Method note

Every number here came from a probe run against the live app. Where a probe and a screenshot
disagreed during the E2E walk, the probe won — see [[E2E Matrix Phase-2]] for the case where a
screenshot suggested a stranded navigation bar that measurement showed was correctly pinned.

---
type: report
title: Visual Design Bible audit — Phase 5
updated: 2026-08-06
tags: [audit, phase-5, design, coins]
---

# Visual Design Bible audit — Phase 5

Same split as [[Bible Audit Phase-4]]. Live probe at **360 × 740**, on the coin screens and — for
the first time — on `/settings`, because Phase 5 put paid content in the theme picker.

## Measurable

| axis | rule | result |
|---|---|---|
| **Type scale** | every rendered `font-size` is a declared token | ✅ 0 off-scale on 4 surfaces |
| **Motion** | every duration is a declared token | ✅ 0 rogue |
| **Targets** | every interactive element ≥ 44 × 44 | ✅ 0 violations |
| **Overflow** | no horizontal page scroll | ✅ 0 px |
| **Headings** | exactly one `h1` per route | ✅ |
| **Surfaces** | no pure `#000` / `#fff` | ⚠️ **10 on `/settings`** — see below |
| **Raw values** | none outside `tokens.css` | ✅ `check-tokens`, in the build |
| **Strings** | no key path rendered to a user | ✅ `check-i18n`, now bidirectional |

## The ten, and why they stay

They are the accent swatches. `readableOn()` picks pure black or pure white as the FOREGROUND on
each one, whichever has the higher ratio against that colour — and the colour is chosen by the
user from a continuous picker, so no token in the palette can be guaranteed legible on it.

That is a NAMED EXCEPTION, not a defect. The Bible's rule is about SURFACES; this is a checkmark
on an arbitrary hue, and the alternative is a swatch whose tick you cannot see.

**What is worth recording is how it was found.** It is pre-existing — it has been in the accent
picker since Phase 1 — and every audit since has reported `pureBW: 0`. Those reports were true
about the routes they walked, and `/settings` was never one of them. **An audit covers what it
walks, and a clean row is a statement about coverage before it is a statement about the app.** The
matrix in [[E2E Matrix Phase-5]] now lists routes rather than implying the product.

## What the coin screens are, in Bible terms

- **The balance is one live region.** The container carries `aria-label` and BOTH children are
  `aria-hidden`, measured — so a screen reader hears "350 érme" once instead of the odometer's
  every intermediate value. An odometer that announces each frame is worse than no animation.
- **E25 varies how the number ARRIVES, never what it is.** All five render the same
  `toCoins(balanceMinor)`. A variant that computed its own figure would be a second arithmetic of
  somebody's money selected from an admin dropdown.
- **Reduced motion drops the roll and keeps the delta chip.** The rule is that the state change
  still happens and is still visible, it just does not travel — so what is dropped is movement and
  never information.
- **Spending is plain, not danger.** Buying something you chose to buy is not an error, and
  colouring it like one makes a statement read as a list of mistakes.
- **The buy button is not disabled when the balance is short.** It answers 409 with the real
  numbers, which is how someone learns how many coins short they are. Disabling it hides that,
  which is the rare case where "a control that cannot succeed" is the wrong rule — this one can.

## Not covered

- **Screenshots.** The pane does not composite in this session; every row is a measurement.
- **1440.** The coin screens were walked at 360 only. They are single-column lists with no
  breakpoint behaviour, which is a reason and not an excuse — it is recorded as uncovered.
- **Composition and hierarchy**, and **real device rendering**, as in every previous phase.

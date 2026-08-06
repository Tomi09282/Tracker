---
type: report
title: Webview E2E matrix — Phase 4
updated: 2026-08-06
tags: [audit, phase-4, e2e]
---

# Webview E2E matrix — Phase 4 (T4.4.3)

The screens this phase added, walked at **360 × 740** and **1440 × 900**, in the roles that can
reach them. Same probe as [[E2E Matrix Phase-3]]: horizontal overflow, targets under 44 × 44,
exactly one `h1`, plus the Bible axes recorded in [[Bible Audit Phase-4]].

| screen | 360 | 1440 |
|---|---|---|
| `/` (with the nutrition card) | ✅ | ✅ |
| `/nutrition` | ✅ | ✅ |
| `/progress` · **Body** | ✅ after one fix | ✅ |
| `/progress` · **Photos** | ✅ | — |
| `/progress` · **Sharing** | ✅ | — |
| `/coach/clients/:id` · **Nutrition tab** | ✅ | ✅ |

## The one defect, and why the probe found it and review would not

The metric `<select>` on the Body tab shared a `flex-wrap` row with the value input, the date input
and the save button. At 1440 that is comfortable. At 360 it came out **37 × 44** — under the floor
in the one dimension a thumb actually misses, while being tall enough to look fine in a screenshot.

Full width now, measured **294 × 44**. It is also the control with the longest label in the form
(*Alkar (jobb)* / *Forearm (right)*), so it was never going to share a row honestly.

## What was exercised, not just rendered

Both new screens were driven rather than looked at:

- **A day of food logged end to end** — searched a seeded food in Hungarian, picked it, entered
  150 g, saved, and read the totals back. 80 g of 389 kcal/100 g came out as 311 kcal on both the
  page and the Home card, which is the point of them sharing one component.
- **A nutrition plan built as the coach** — created, day added, meal added, food searched and
  prescribed, with the draft notice showing and the plan correctly invisible to the client.
- **Four measurements across four dates**, so the trend charts drew real geometry with a real
  `sr-only` table under them rather than the "not enough points" message.

## Two defects the browser found that the code review had not

- **The food log read back in English.** A Hungarian user logged *Zabpehely* and their own diary
  said *Oats, rolled, dry*, because the snapshot came from `foods.name` — the canonical fallback
  that exists so a row is always nameable, and is not what anybody should be shown. Fixed and
  asserted both ways in smoke.
- **`common.add` rendered as the literal string `common.add`** on a button, with `check-i18n`
  green. The gate compared bundles to each other and never compared the CODE to the bundles — see
  [[0012-phase-4-lessons]].

## Not covered

- Real iOS/Android hardware. Chromium in a webview only.
- Screen readers themselves — semantics are asserted structurally, not by listening.
- Screenshots. The Browser pane does not composite frames in this session; every ✅ above is a
  measurement, which is the stronger evidence where the two have disagreed before.
- A photo library large enough to need pagination. The list caps at 200 and the cap is stated;
  behaviour past it is untested.
- The coach's view of a client's progress data, because no client in the walk had granted it —
  the *deny* path is covered exhaustively in smoke instead, which is the direction that matters.

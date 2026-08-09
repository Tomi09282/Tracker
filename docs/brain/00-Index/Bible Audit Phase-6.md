---
type: report
title: Visual Design Bible audit — Phase 6
updated: 2026-08-09
tags: [audit, phase-6, design, marketplace, public]
---

# Visual Design Bible audit — Phase 6

Same split as [[Bible Audit Phase-5]]. Live probe at **360 × 740 and 1440 × 900**, on all three
public marketplace routes, each one **populated with real seeded content** — a feed with two posts,
an event post rendered through the real markdown parser, and a published coach profile.

This audit was **blocked until now, on purpose**. T6.6.2 sat at `blocked` rather than `pending`
through the whole backend phase, because a Bible audit measures rendered screens and there were
none: a table of ✅ about screens that do not exist is precisely the trap Phase 5 earned rule 7 for.

## Measurable

| axis | rule | 360 | 1440 |
|---|---|---|---|
| **Type scale** | every rendered `font-size` is a declared token | ✅ 0 off-scale | ✅ 0 off-scale |
| **Motion** | every `transition`/`animation` duration is a declared token | ✅ 0 rogue *(after the fix below)* | ✅ 0 rogue |
| **Targets** | every interactive element ≥ 44 × 44 | ✅ 0 violations | ✅ 0 violations |
| **Overflow** | no horizontal page scroll | ✅ 0 px | ✅ 0 px |
| **Headings** | exactly one `h1` per route | ✅ 3 / 3 | ✅ 3 / 3 |
| **Surfaces** | no pure `#000` / `#fff` | ✅ 0 | ✅ 0 |
| **Line length** | running text stays in the app's column | ✅ 328 px | ✅ **432 px** |
| **Raw values** | none outside `tokens.css` | ✅ `check-tokens`, in the build | — |
| **Strings** | no key path rendered to a user | ✅ `check-i18n`, bidirectional | — |

The three `h1`s are `Piactér`, the post title, and the coach's display name — measured, not assumed.

Line length is the axis Phase 5 was burned by and that **no Bible row covers**. It is clean here
because `col-mobile screen-x` was used from the first commit of these screens rather than
rediscovered afterwards. That is the Phase 5 lesson actually landing, which is worth more than the
row being green.

## The motion row is green because this audit broke it first

**Every audit since Phase 2 reported `0 rogue durations`, and all of them were measuring a state
the app is almost never in.** Sampling 110 ms after navigation instead of after the screen settled
turned up a `2s` that no token declares.

It was Tailwind's `animate-pulse`, and it was not a Phase 6 mistake — **nine feature files** had
reached for it since Phase 4, and the canonical `Skeleton` component spelled its own `1.2s` inline
in two more places. A skeleton is only on screen while data is in flight, so no probe that waited
for the screen to settle could ever have seen one.

Rule 7, a fourth time: *a clean result is a statement about coverage before it is a statement about
the subject.* The subject was fine on every screen the probe looked at. It was never looking at the
loading state.

**The token set had the gap, not the components.** 100 / 150 / 250 / 400 ms are *state-change*
durations — something was one way and is now another, and the number is how long the eye is given
to follow it. A shimmer never arrives anywhere; it repeats until data lands, and running it at
250 ms is a strobe. So the loop got a name:

```css
--duration-ambient: 1200ms; /* skeleton shimmer, breathing emphasis — loops, not transitions */
```

Sixteen hand-rolled `<div className="… animate-pulse bg-surface-2" />` blocks became `<Skeleton>`,
which is the **eighth** instance of this project's second-most-common defect — a second
implementation of a solved problem — and the second by omission. `Skeleton` was already imported in
eighteen places in the same codebase. The two remaining `animate-pulse` uses are deliberate
emphasis on an icon, already gated on `useMotionSafe`; the utility is re-pointed at the token in
one place rather than banned, because a rule enforced by deleting the convenient thing gets worked
around and the next screen would write `2s` inline where no audit greps for it.

**The accessibility half was the worse half, and it is only half fixed.** The hand-rolled blocks
carried no `aria-hidden` and sat under no `role="status"`, so a screen reader was read a list of
decorative boxes and told nothing about what was happening. Every refactored block now reports
`aria-hidden="true"` — measured on a cold load with the API held back 700 ms, three skeletons on
`/m` and two on the post page, all at `1.2s` with the shimmer gradient painted.

**The announcement is still missing**, and this document nearly claimed otherwise. `role="status"`
lives on `ScreenSkeleton`'s own wrapper; the inline loading branches render bare `<Skeleton>`
groups with no wrapper, so `[role="status"], [aria-busy="true"]` measures **0** on all three
marketplace routes. The boxes are no longer read out, and nothing is announced in their place.
Recorded as open (**T6.7.1**) rather than folded into a green row — the first draft of this
paragraph asserted both halves, and only one of them had been measured.

## And the probe was breaking rule 4 while it caught this

The first run of this audit read the **type scale** out of the stylesheet and carried a hardcoded
`[100, 150, 250, 400]` for the **durations** — an audit holding its own copy of what it audits, the
exact defect Phase 2 wrote rule 4 for, in the same file that was busy enforcing it. It is now read
from the cascade, which is how the new `1200` appeared in the token list without anyone editing the
probe.

## A measurement that was my probe lying, not the app

An earlier pass reported `h1: 0` on the post and profile routes. That was **not a defect**: the
probe navigated with `pushState` + a synthetic `popstate`, which React Router does not act on, so
it measured the feed three times and read the absence of a heading that was never rendered. Caught
by navigating for real and clicking the anchors the app itself rendered.

Recorded rather than quietly deleted, because it is the same shape as everything else here: **a
probe that never fails is not evidence**, and a probe whose navigation silently no-ops produces
confident readings about a page it never opened.

## What the marketplace screens are, in Bible terms

- **No follower count, and its absence is the design.** `ORDER BY follower_count DESC` is a ranking
  anybody can buy at one free registration per follower. Following exists privately and ranks
  nothing.
- **The verified tick is a database fact, not a UI flag** — the schema refuses a badge granted by a
  non-admin or with no granter recorded.
- **Unpublished, removed, and never-existed are one answer.** The page tells the same story the API
  does, so it cannot become the oracle the server refused to be.
- **The price note says payment does not go through the app.** Stating the limit is the honest
  version of a price that looks like a checkout and is not one.
- **Links in rendered post bodies get the host appended unconditionally**, `dir="ltr"` and
  `unicode-bidi: isolate`, and `rel="noopener noreferrer nofollow ugc"` — this is the one surface
  where the text is written by someone the reader has no reason to trust.

## Not covered

- **Screenshots.** The pane still does not composite in this session; every row above is a live DOM
  measurement, which is the stronger evidence anyway (rule 2).
- **Composition and hierarchy** — no probe judges these, as in every previous phase.
- **Real iOS/Android hardware.** Chromium in a webview only.
- **The coach-side composer**, which is unwritten. These screens were audited as a *reader* sees
  them; nothing here says anything about the authoring flow.
- **Post media.** No image has been uploaded through the real pipeline yet, so `/public/media/:key`
  is covered by backend assertions only and not by a rendered screen.

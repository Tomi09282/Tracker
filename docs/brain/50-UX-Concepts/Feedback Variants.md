---
type: ux-concept
title: Element feedback variants (E1–E26)
updated: 2026-08-24
tags: [ux, motion, feedback-law]
---

# Element feedback variants

Every interactive element ships **five** variants (A–E). The active one is a GLOBAL,
admin-switchable setting in `element_style_config`, applied to every user with no redeploy
(owner requirement 24). Components never hardcode behaviour — they call
`useElementVariant('EN')` and render accordingly.

## Status — 20 of 20 elements, 100 of 100 variants

| Element | What it is | Where the variants actually differ |
|---|---|---|
| E1 | Button | press-spring · ripple from the press point · sheen · **morph-to-progress** · icon-slide |
| E2 | Copy button | icon morph · tooltip pop · confetti · fill-wipe · repeat counter |
| E3 | Icon button | micro-bounce · ink dot · icon morph (play↔pause) · outgoing ring · ghost→accent |
| E4 | Toggle | squash-and-stretch thumb · icon in thumb · ON/OFF text · glow · saving spinner |
| E5 | Checkbox | stroke draws on · spring bounce · strike-through label · confirm ring · indeterminate |
| E6 | Segmented | sliding thumb (shared layoutId) · underline · lift · icon spin · staggered colourise |
| E7 | Text field | focus glow · shake on a NEW error · success tick · char pop · gradient border |
| E8 | Select | staggered open · sliding check · cursor-trailing highlight · **bottom sheet** · live filter |
| E9 | Date picker | day pop · range paint · today marker · **quick chips** · month swipe |
| E10 | Tabs | travelling pill · underline · lift · badge flush on open · content crossfade |
| E11 | Nav item | accent pill · dot · stroke thickens · badge pop · centre FAB |
| E12 | Card | lift/flatten · pointer tilt (fine pointers only) · border beam · press scale · select badge |
| E13 | Swipe row | reveal actions · complete-swipe · long press · reorder · ripple |
| E14 | Sheet | spring sheet · centred dialog · morph from trigger · stacked · success flash |
| E15 | Toast | slide stack · timer hairline (pauses on hover) · **typed icon** · undo morph · coin |
| E16 | Progress | spring fill · flowing stripe · milestone ticks · **ring + count** · accent→success ramp |
| E17 | Slider | thumb grows on grab · tick marks · gradient fill · dual range · end icons |
| E18 | Skeleton | **shimmer sweep** · slow pulse · staggered reveal · shape morph · exact ghost |
| E19 | Pull to refresh | indicator grows · logo flip · **rubber band** · word status · surprise |
| E20 | FAB | speed dial · morph to sheet · hide on scroll · drag dock · progress halo |

E21–E26 are catalogued and seeded in the database but belong to later phases (set-check row and
rest timer in Phase 2, coins and streaks in Phase 5, likes and follows in Phase 6). The
playground lists them as not-yet-built rather than showing an empty demo.

## Rules every variant obeys

- `prefers-reduced-motion` ⇒ the state change still HAPPENS and is visible, it just does not
  travel. A global CSS backstop collapses durations; components also branch on `useMotionSafe`
  so JS-driven springs do not move either.
- Spring presets: stiffness 300–400, damping 17–28, scaled to element size. Small controls get
  the tight spring; sheets get the soft one, because a large surface that snaps looks weightless.
- **State that carries information is never animation-dependent.** A highlight or a count must be
  correct even when no animation frame ever runs — see the gotchas in SHARED_MEMORY.
- Every control keeps its accessible name, its 44×44 floor and its focus ring regardless of
  variant: the variant changes how it FEELS, never whether it works.

## A variant nobody can reach is a variant nobody can judge

Found on 2026-08-24, while making all five variants of every element genuinely distinct rather than
one-or-two striking and three defaulted.

**`E20` FAB — A and B were structurally mute.** `press()` short-circuits to opening the menu
whenever a variant is expandable, and only A (speed-dial) and B (morph-sheet) are. So `run()` — the
whole busy → tick / busy → warning machine — was unreachable for exactly the two variants whose
purpose is to LAUNCH one of several actions. `onSelect` was typed `() => void` and called
fire-and-forget. It now returns `unknown` and is routed through the same `run()`, which is also the
honest shape: after tapping `Exercise`, what the user is waiting on is the exercise being added,
not the menu closing.

**`E14` sheet — the demo showed half of each variant.** The playground opened the sheet and passed
no `status`, so five variants could be compared on their ENTRANCE and on nothing else. The demo now
drives the panel through busy → success and busy → error, one tap apart.

**`E1` button — the same defect, reported in the same pass.** Its demo action could only resolve, so
the five ways this element says NO — a shake, a red flood from the contact point, a red sweep, a bar
that completes in danger, a badge that slides in — could not be seen at all. Presses now alternate.

**The rule this leaves behind.** *A variant's demo has to reach every state the variant can express,
or the studio is comparing entrances.* Three elements failed it at once, and all three failures were
invisible: the components were correct, the gates were green, and the page looked finished.

## Where to look

- Catalog and labels: `frontend/src/ui/feedback/catalog.ts`
- Registry and override: `frontend/src/ui/feedback/ElementStyleProvider.tsx`
- Implementations: `frontend/src/ui/feedback/variants/`
- QA matrix: the `/playground` route — every element against all five variants at once
- Parity with the database is a smoke check, so the UI cannot offer a variant the DB rejects.

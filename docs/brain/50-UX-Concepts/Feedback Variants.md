---
type: ux-concept
title: Element feedback variants (E1–E26)
updated: 2026-08-04
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

## Where to look

- Catalog and labels: `frontend/src/ui/feedback/catalog.ts`
- Registry and override: `frontend/src/ui/feedback/ElementStyleProvider.tsx`
- Implementations: `frontend/src/ui/feedback/variants/`
- QA matrix: the `/playground` route — every element against all five variants at once
- Parity with the database is a smoke check, so the UI cannot offer a variant the DB rejects.

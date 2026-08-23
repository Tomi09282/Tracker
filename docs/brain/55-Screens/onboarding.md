---
type: screen-spec
title: Bevezetés — Onboarding
route: /onboarding
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Bevezetés — Onboarding

Five short question sets a brand-new member answers so the app can size their training plan, ending on `Kész` and the home screen. The user did not come here — they were put here — so every step has to justify the question it is asking and make the end of the flow visible from anywhere inside it. The mockup shows step two.

## Anchor

A large step gauge: a wide ring whose accent arc sweeps a little under half the circle, the numeral `2` filling its middle in the heaviest figures on the screen, and the caption `5 lépésből` beneath it *inside* the ring. Position and remaining in one glyph. A ring for a countable goal — five steps is exactly that — where the hairline bar it replaces stated a proportion nobody reads and the small counter caption stated a position nobody saw.

> [!important]
> The bar it replaces carried `role="progressbar"` with `aria-valuemin` / `max` / `now` and an `aria-valuetext` reading the same sentence the sighted user sees (`2 / 5. lépés`). The ring inherits all of it. Drop it and the flow loses its only announced sense of position — a screen reader user gets five identical unlabelled pages.

## Blocks

1. **Step ring** — see Anchor. Same shared radial component as the coin balance ring; different referent.
2. **Step title** — `Mennyit tudsz edzeni?`, the display face, centred under the ring.
3. **Step subtitle** — one short line, centred: `Az őszinte szám a jó szám.`
4. **Group heading** — a stopwatch icon in a tinted holder, the question in bold, and an accent `*` marking it required: `Mennyi edzéstapasztalatod van? *`
5. **Option cards** — full-width, stacked, single choice. Each: an icon holder on the left, a single-line label, and a radio circle on the right. `Kezdő — kevesebb mint egy éve` · `Haladó — 1–3 év` (selected) · `Rutinos — 3 év felett`. The selected card inverts to the light surface with dark ink and fills its radio circle with an accent check.
6. **Group heading** — a calendar icon holder, `Hetente hány edzés? *`
7. **Numeric field** — the value `4`, a green validity check inside the field's trailing slot, and `−` / `+` stepper buttons at its right edge. Hint beneath: `Ebből számoljuk a terv terjedelmét.`
8. **Footer row** — outlined `‹ Vissza` on the left, filled accent `Tovább ›` on the right. `Vissza` is always rendered and only disabled on step one, so the footer never reflows and the primary action never moves under the thumb. On step five the right button reads `Kész`.

The other four bodies keep their existing shape under this chrome: seven goal cards with hints on step one; location cards plus the equipment chip field on step three; the optional note, unit chips, three numeric fields and the `Nem` chips on step four; the body-area chips, a severity card per ticked area and the free-text `Bármi más, amit tudnunk kell` on step five.

## What was merged away, and why

The thin progress bar and the `2 / 5. lépés` caption collapsed into the ring — two weak signals for one strong one. Every group heading and every option card gained a large icon in a tinted holder, which is what turned five screens of identical text rows into something scannable, and the `*` marker now separates required from optional without spending a sentence on it. The subtitle lost its second clause. The focus ring on the input is missing from the image; that is a static-render artefact, not a decision.

Three cuts have consequences, and each needs paying for:

> [!warning]
> **`Még nem edzettem` was dropped**, taking experience from four options to three. This is a product change disguised as a layout change: `onboarding.exp.none` is a real answer that sizes an untrained person's first plan, and without it that person must claim to be `Kezdő`, which is a different plan. Either the option comes back, or `Kezdő`'s copy is rewritten to absorb it. Three cards in the mockup is a demonstration of the card shape, not permission to delete an answer.

> [!warning]
> **`Egy edzés hossza (perc)` was removed entirely**, with its bounds and its hint — and that hint's wording was then reused on `Hetente hány edzés?`. But `session_minutes` is what the generator uses to size volume. If the field stays gone, the value must come from a stated default per experience level, written down here and in the generator. A silently-defaulted number that shapes somebody's plan is worse than one more field.

> [!important]
> **The autosave line is gone from the layout** — `Mentés…` / `Elmentve` / `A mentés nem sikerült — a válasz megmarad, újrapróbáljuk`. Auto-save with no feedback is indistinguishable from not saving; people close the tab believing they lost the form. The two quiet states may live on the ring as an edge treatment, but the **error must still render as a line** — it is the one of the three the user has to act on, and a form that says nothing while failing to save is the exact defect the indicator was built for.

## States

- **Loading** — the full-page `ScreenSkeleton`, not a bare `Skeleton`. `Skeleton` carries no size of its own; a lone one rendered a zero-height nothing and the first paint of onboarding was a blank page.
- **Empty** — none. The option lists arrive with the profile; an empty `options` payload is an error, not an empty state.
- **Error (rejected finish)** — the flow jumps to the first step holding a missing required answer, paints that field's error `Ez a mező kell a befejezéshez`, and renders `Hiányzik még: cél, tapasztalat, heti edzésszám, helyszín` under the footer. A raw list of server field names is not an instruction, which is why the jump exists. Answering a complained-about field clears its complaint immediately.
- **Offline** — debounced saves fail; the save-error line is the only truthful signal and must therefore survive (above). The server's resume `step` must not advance while saves are failing, or a returning user lands past answers that never persisted.
- **In flight** — `Kész` shows busy while the final answer is flushed and the completion posts. `Vissza` stays live throughout.
- **Role-gated** — none. Onboarding is the member entry path; finishing replaces the history entry and routes home.

## Components

Reuses `Pressable` with explicit `role="radio"` / `role="checkbox"` semantics and its `field` / `chip` shapes (option cards and chips are Pressables so they inherit the tap-target floor and all five interaction states), `Field`, `ScreenSkeleton`, the `control` recipe, `BottomNav`, and the `useOnboarding` / `useDraftSave` / `useCompleteOnboarding` hooks — including the synchronous draft ref, which is what stops three chips ticked in one tick from collapsing into one saved row.

Genuinely new: the **step ring** (share one radial component with `05-coins`); the icon holder on headings and option cards; the required `*` marker; and the **numeric stepper** — `Field` has a `trailing` slot but no `−`/`+` buttons and no valid-state icon, and both need to become part of a numeric variant rather than being hand-built here. The radio circle on the right of an option card is also new; today selection is signalled only by the fill.

## Navigation

Member bar, five tabs, `Kezdőlap` shown active — the shell's bar is rendered and its height reserved during onboarding.

> [!warning]
> A brand-new member can therefore walk out of the flow through the bar before finishing. Either the tabs are inert for the duration, or leaving is explicitly allowed and the saved resume point brings them back to the step they left. Silently letting them out into a half-configured app is the one outcome to rule out.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/10-onboarding.webp]]
![[_mockups/vilagos/10-onboarding.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]

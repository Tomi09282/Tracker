---
type: screen-spec
title: Belépés — Sign in
route: /login
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Belépés — Sign in

An existing user signs in with e-mail and password and lands on the home screen. It is also the first screen most people ever see of the product, so it carries a second job the form itself does not: saying what this is. One vertically centred column, capped narrow, nothing else on the page — no nav, no header, no marketing.

## Anchor

An oversized circle filled with a soft accent tint, holding one large line-art dumbbell glyph, with a slim ring echoing it just outside the edge. Not a ring in the progress sense and not a chart: there is no data yet and nothing to count. The anchor's job here is identity. It grew from a small rounded brand tile to fill the top third because everything below it is four controls, and a bare form floating in the middle of a dark page reads as a dialog, not as a product.

## Blocks

1. **Brand circle** — the anchor, centred, with its outer ring.
2. **App name** in Display type, centred. Drawn as `Tracker` in the mockup, but the value comes from `useAppName()` — server config, never a literal in the bundle. It renders empty and fills in rather than flashing a placeholder, so the layout must not jump when it arrives.
3. **Subtitle**, muted, centred: `Jelentkezz be a fiókodba`. (The dark mockup shows a trailing full stop the string does not have; the string wins.)
4. **Form card** — bordered, raised, holding, in order:
   - **`E-mail` field** — visible label above the input, envelope glyph leading, placeholder `te@pelda.hu`, e-mail keyboard, autofill on. A green success tick appears trailing once the address parses (this is catalog E7's `Success-tick` variant, already defined).
   - **`Jelszó` field** — visible label, lock glyph leading, placeholder `A jelszavad`, masked once typed, autofill `current-password`, and an eye / eye-off reveal toggle trailing.
   - **`Elfelejtetted a jelszavad?`** — a text link, right-aligned under the password field.
   - **Error banner**, only after a failed submit: a full-width strip inside the card, red-tinted, `role="alert"`.
   - **`Belépek`** — the one primary action, full width, accent-filled. Busy state keeps the button's size, swaps the label for a spinner and makes the whole form inert.
5. **Switch line** under the card, centred: muted `Még nincs fiókod?` followed by the accent link `Regisztráció` → `/register`.
6. **Language toggle** — a bordered pill container holding three chips: `Magyar` (active, with a check glyph), `English`, `Deutsch`. Native names, deliberately never translated, each chip carrying its own `lang` so a screen reader switches voice.
7. **Legal footer** — `Adatvédelem · Felhasználási feltételek`, centred at the bottom.

## What was merged away, and why

- **The small brand tile became the oversized circle composition.** The old header was tile + name + subtitle stacked tightly, three small things doing one job. Now one large thing does it, and the top third is the product rather than the start of a form.
- **The password helper caption is dropped on this screen.** `Legalább 12 karakter, kis- és nagybetűvel és számmal.` is a rule you need when you are *choosing* a password; on login it is noise under the field, and the same component still renders it on `/register`.
- **Both fields gained a leading glyph and lost their descriptions.** The visible label stays — it is rendered structurally by `Field`, not left to the caller, because a placeholder disappears the moment the user types and a placeholder-only label is the defect that rule exists to prevent.
- **What that bought:** the column is now three groups — mark, form, way out — with wide breathing room between them, instead of eight stacked rows of roughly equal weight. On the screen where the product introduces itself, that difference is the whole first impression.

> [!warning]
> Three controls in the mockup have nothing behind them. `Elfelejtetted a jelszavad?` has no route (the router has `/login` and `/register` and nothing else) and no endpoint. The reveal toggle does not exist on `Field` — the component takes a `trailing` slot so the button fits, but the button itself, its `aria-pressed` and its label are new. The two legal links have no destinations. A dead link on the login screen is worse than no link at all: ship the flow, or cut the row until it exists.

> [!important]
> The e-mail tick is a client-side format check and must never mean more than that. If it only appeared for addresses that already have accounts it would be a user-enumeration oracle — which is exactly why the failure copy is deliberately generic and identical for both fields: `Hibás e-mail vagy jelszó.` never says which one was wrong. The same rule governs response timing; do not add a fast path that answers "unknown e-mail" sooner than "wrong password".

## States

- **Loading** — none, and that is deliberate: there is no skeleton and no empty state, the form is always drawn immediately. The only late-arriving value is the app name.
- **Busy** — `Belépek` carries `busy`: it keeps its size (no layout shift), blocks input, and announces itself through `aria-busy`. The whole form is inert for the duration.
- **Submit error** — the banner inside the card, one of `Hibás e-mail vagy jelszó.` / `Túl sok próbálkozás. Várj egy kicsit, aztán próbáld újra.` / `Nem sikerült a művelet. Próbáld újra.` Mapped from the server's stable error code, never from the server's own prose, which is English and written for a log reader.
- **Inline field error** — under the offending input: colour **and** icon **and** message, all three at once, wired through `aria-describedby` so it is heard when it appears rather than on the next focus. Both fields currently map any validation failure to the generic string.
- **Offline** — none. `OfflineIndicator` is mounted in `AppLayout` and `/login` renders outside it, so a submit with no connection falls through to the generic error banner. That is survivable but wrong: "no connection" and "something went wrong" are different problems with different next actions.
- **Role-gated** — none, but a visitor who already holds a valid session should never reach this screen; the redirect belongs upstream of the form.

## Components

Reuses `Field` (label always rendered, minimum target height from the pack token, `trailing` slot, error wiring), `Pressable` with `variant="primary"` and `busy`, `LanguageToggle` (built from the locale registry rather than its own list, native labels, per-chip `lang`), the `control` recipe, `useAppName`, and the `useLogin` mutation. Catalog variants E7 (text input) and E1-family button behaviour apply unchanged.

Genuinely new: the brand circle composition; a **leading** glyph slot on `Field` — only `trailing` exists today; the password reveal toggle; the forgot-password link and the flow behind it; and the legal footer row. Everything else on this screen already exists and should not be re-implemented locally — the `control` recipe exists precisely because the previous build lost the target-height floor in twelve places when components chose their own.

## Navigation

No bottom bar — `/login` renders outside `AppLayout` entirely. Tab count for this screen's role: none. On a successful submit the app navigates to `/` with `replace` (so back does not return to the form), where the member's five-tab bar appears; a coach lands on the same home with six destinations' worth of tabs clamped to five, and admin reaches its area through Settings rather than the bar.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/11-login.webp]]
![[_mockups/vilagos/11-login.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]

---
type: screen-spec
title: Regisztráció — Create account
route: /register
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Regisztráció — Create account

The account-creation half of `AuthPage`, the only screen a visitor sees before they have any data at all. They came to type two things and get in: `AuthPage` fires register and then login as one act, so there is no confirmation form, no verification wall and no second step between the button and the app.

## Anchor

A brand circle holding the dumbbell mark, with the wordmark and one subtitle line under it. It is the anchor by elimination and by intent: a ring needs a countable goal, a chart needs a trend, the body map needs anatomy — a first-run visitor has none of the three. The one question this screen actually has to answer is *am I in the right place*, so the anchor is identity. Dark draws the circle as a pale disc with a thin halo ring outside it; light drops the halo and uses the accent-subtle tile fill with an accent glyph.

> [!important]
> The wordmark is the server-configured app name (`useAppName`), never a literal in the bundle. `Tracker` in the mockup is example content. A white-labelled instance must render its own name here without a rebuild.

## Blocks

1. **Back control** — dark mockup only: a circular ghost icon button in the top-left, above the hero. Returns to `/login`. There is no equivalent in the current code and none in the light mockup.
2. **Brand hero** — the circle, the wordmark, then the subtitle `Hozz létre egy fiókot`. Centred, own vertical group.
3. **Form card** — one bordered surface holding everything that is typed:
   - `E-mail`, placeholder `te@pelda.hu`, e-mail keyboard and autocomplete. Shown in the mockups in its invalid state: danger border plus a trailing alert glyph inside the input.
   - **Inline error strip** directly under that input — tinted danger surface, alert glyph, `Ezzel az e-mail címmel már van fiók.` It belongs to the e-mail field, not to the form.
   - `Jelszó`, placeholder `A jelszavad`, autocomplete `new-password`, with a crossed-out-eye reveal toggle in the field's trailing slot.
   - **Strength meter** — four segments across the card width under the password field, filling left to right as the password improves. No numeric score, no word label.
   - **Requirement rows** — two, each a status glyph plus its rule: `Legalább 12 karakter` (green filled check when met) and `kis- és nagybetűvel és számmal` (hollow ring when not yet met). These are live, not static text.
4. **Primary action** — full-width accent button, `Létrehozom a fiókom`, single line. It is the only filled control on the screen.
5. **Switch line** — `Van már fiókod?` plus the accent link `Belépés`, which navigates and does not submit. Dark renders it inside a full-width outlined row; light renders it as a plain centred line. Spec the link; the outlined container is dark-mode framing, not a requirement.
6. **Language chip** — one ghost pill at the bottom: globe glyph, the current language `Magyar`, a chevron. Tapping it opens the picker.

## What was merged away, and why

**The three-chip language switcher became one chip.** `LanguageToggle` renders every locale as a segmented pill row — `Magyar` / `English` / `Deutsch` — which put a second multi-option control on a screen whose entire job is one button. Collapsed to a single chip showing the current language, opening a `Sheet` with the full list. What it bought: the bottom of the screen stops competing with `Létrehozom a fiókom`, and the control scales past three locales instead of wrapping.

**The static password rule sentence became a meter plus two live rows.** Today `auth.passwordRules` renders once as one grey sentence under the input — read before typing, invisible during it, and the field only says whether the whole thing failed. Splitting it into two checkable rows plus a strength meter turns a rule into feedback: the user sees which half is missing at the moment it is missing. This is the one structural difference between `/register` and `/login`, and it is now visible instead of textual.

**Everything else that a signup form usually grows was never added and stays out**: no display name, no password confirmation, no terms checkbox, no marketing copy. The account is created and signed in as one call, so a second form would be a second chance to abandon.

**The brand tile became the hero circle** — the same mark, given the top third instead of a small square, because there is nothing else in the top third to give it to.

> [!warning]
> The mockups show the taken-address error twice — as a red field border *and* as a strip below it. `AuthPage` currently has two separate mechanisms: per-field `error` on `Field` (with its own `role="alert"`) and a form-level alert paragraph. Wire the server's `conflict` code to the **e-mail field's** error only. Two alert regions for one failure is two announcements to a screen-reader user.

## States

- **Pristine** — meter empty, both requirement rows hollow, no errors. The submit button stays enabled; validation speaks on submit, not by disabling.
- **Typing** — meter and requirement rows update live from the password value. Purely client-side; nothing is sent.
- **Busy** — `Pressable` `busy` on the submit button; the whole flow (register then login) sits behind that one spinner. Fields stay readable and are not cleared.
- **Error — address taken** — `Ezzel az e-mail címmel már van fiók.` on the e-mail field. The `Belépés` link is the recovery path and is already on screen.
- **Error — rate limited** — `Túl sok próbálkozás. Várj egy kicsit, aztán próbáld újra.` at form level.
- **Error — anything else** — `Nem sikerült a művelet. Próbáld újra.` The server's own prose is never rendered: it is unlocalised and written for a log reader.
- **Offline** — the shell's `OfflineIndicator` covers it; the submit failure falls through to the generic message.
- **No loading skeleton and no empty state.** Nothing is fetched to draw this screen.
- **Role-gated** — an already-authenticated visitor should be redirected away rather than shown a signup form; the route is outside `AppLayout`.

## Components

Reused: `Field` (label, placeholder, `error`, and the `trailing` slot the reveal toggle drops into), `Pressable` (`variant="primary"` with `busy`, and `shape="chip"` for the language pill), `Sheet` from the E14 variant module for the language picker, the `control` recipe for the target-height floor and focus ring, `useAppName` for the wordmark.

Genuinely new:
- **Password strength meter** — a segmented bar. No component in `src/ui/` draws one; the existing ring lives in the E16 progress variants and is the wrong shape.
- **Requirement row** — glyph plus rule, two states. Small, but it must be a component: the same list has to appear on any future password-change screen, and a second copy is a second place for the rules to drift from the server's policy.
- **Reveal toggle** — an icon button inside `Field`'s trailing slot. `Field` already accepts it; the toggle itself does not exist.
- **Single-chip language control** — a reshape of `LanguageToggle`, not a new file. Keep its rule that locale names are never passed through `t()`: the person using this control is exactly the person who cannot read the current UI language.

> [!warning]
> The meter and the rows must be derived from the same predicate the server validates with. Two copies of "what counts as a strong password" is the ninth thing that can disagree — and here it disagrees in the worst direction: green checks on a password the API then rejects.

## Navigation

None. `/register` sits outside `AppLayout`, so there is no bottom bar, no tab is active, and no role applies yet. The only ways off the screen are `Belépés`, the dark mockup's back control, and a successful submit, which lands on `/`.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/12-register.webp]]
![[_mockups/vilagos/12-register.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]

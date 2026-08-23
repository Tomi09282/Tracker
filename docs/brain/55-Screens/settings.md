---
type: screen-spec
title: Beállítások — Settings
route: /settings
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Beállítások — Settings

The account and device screen: who you are signed in as, how to stop being signed in, how the app looks, which cues it may emit on this phone, and what language it speaks. Almost every visit here is one of three errands — sign out, silence the voice, change the theme — and the screen is ordered so all three are reachable without a decision.

## Anchor

An oversized circular account avatar carrying the monogram `T`, wrapped in a bold accent status ring with a small check badge on its lower right, centred across the top third with the email and role chip beneath it. A person, because this screen is about a person and their device — not a chart, not a ring of numbers. The identity is also the one thing on the screen that has to be unambiguous before anything below it is touched: signing out of the wrong account is the only irreversible act here.

> [!warning]
> The check badge must mean something — a verified email, or an active healthy session — and be absent when that is not true. A permanently drawn approval badge is a claim the product is making about the account with nothing behind it.

## Blocks

1. **Header row** — back control on the left, h1 `Beállítások` centred.
2. **Identity block** — the avatar anchor, then the account email `tomi09282@gmail.com` in body text, then a small pill chip holding the role: `Tag`.
3. **`Kijelentkezés`** — a full-width outlined button with a log-out arrow, sitting directly under the identity block with no section card around it. One tap, no confirmation, busy state while the request runs.
4. **`MEGJELENÉS`** — a section header: a palette icon in a tinted holder, then the uppercase label.
5. **Appearance card** — the theme studio, reduced to one card with three parts:
   - a preview tile: a flame icon holder, the title `Élő előnézet`, and one line, `Az egész app átszíneződik, amint választasz.`
   - a hairline, then a row of theme pack chips: `Éjfél` selected (accent border, tinted fill, a green check badge on its corner), `Aurora`, `Ember`.
   - a full-width filled `Téma mentése`.
6. **`HANGOK ÉS REZGÉS`** — section header with a speaker icon holder, then a card of three rows divided by hairlines. Each row: an icon holder, the title, one short hint line, and a pill switch on the right. `Beszédhang` / `Bemondja a kört és a pihenőt.` (on) · `Sípszó` / `Rövid hang a visszaszámláláshoz.` (on) · `Rezgés` / `Rezgés a sorozat pipálásakor.` (off).
7. **`NYELV`** — a globe icon holder and the uppercase label, beginning right at the fold. The chips `Magyar` / `English` / `Deutsch` sit just below it, reached by scrolling.
8. **`ADMIN`** — admin only, same section shape, holding the accent link `Admin felület megnyitása`.

## What was merged away, and why

This screen carried the heaviest cut in the redesign. Removed whole: the gradient builder (preview bar, `Lineáris` / `Sugaras` chips, the `Szög` slider and its readout, two to six colour-stop rows each with a colour well, a position slider and a trash button, plus `Új színpont`, `Alapértelmezett` and `Gradiens mentése`) and the accent block (eight preset swatches, the `Egyedi szín` colour well, the hex field, its `Mentés`, and the contrast caption). Theme packs went from five to three; the cue hints went from two lines to one; the live preview card lost its demo `Mentés` / `Mégse` buttons and its second body line and became a tile.

What that bought: the three errands people actually come here for now all sit above the fold, where before the sign-out button was the only one and the rest of the screen was a colour laboratory. The gradient builder alone was more controls than the entire workout player.

What it costs, and how each cost is paid:

> [!warning]
> The contrast gate went out with the accent field. `settings.contrastRatioPass` / `contrastRatioFail` / `contrastInvalid` and the disabled `Mentés` were the only thing standing between a user and an unreadable app. With no free colour input there is nothing left to fail — which is why the removal is safe *now*. The moment a custom accent returns anywhere in the product, the caption and the gated save button return with it. Do not reintroduce the colour well without them.

> [!important]
> The shortened `Sípszó` hint drops the sentence that mattered most: on iOS Safari `navigator.vibrate` does not exist, so the beep is the only non-visual cue an iPhone user has. That fact cannot live nowhere. It moves onto the `Rezgés` row: when `hapticsAvailable()` is false the row renders dimmed and non-tappable — never hidden — and its hint becomes the explanation of why.

Three packs, not five, and not an arbitrary three: `Aurora` and `Ember` are purchasable items in the coin store, so the chip row is **entitlement-driven** — the packs this account owns, plus the free default. A fixed list of three would show a member a theme they cannot select and hide one they have paid for.

> [!warning]
> `Téma mentése` contradicts today's `ThemeStudio`, which commits and persists on tap with no save step. Under this design the chips *preview* (the existing `theme.preview` / `cancelPreview` pair, which already backs hover-to-compare) and the button commits. Pick one and make it true everywhere: a save button that saves something already saved is the ninth thing that can disagree.

The role is now rendered in Hungarian — `Tag` / `Edző` / `Admin` — where `SettingsPage` prints the raw `user.role` string. And the admin entry stays a Settings row rather than a nav tab, for the measured reason recorded in `AppLayout`: a staff account already fills the bar, and the sixth tab was silently clamped away.

## States

- **Loading** — skeletons in the shape of the avatar, the email line and the role chip; card-shaped skeletons for the two sections. The sign-out button renders immediately: it depends on the session, not on the session's contents.
- **Empty** — none. Every block on this screen always has content.
- **Error** — a failed session read shows the identity block with the email slot empty rather than a placeholder account; a failed theme save leaves the chip selection where the user put it and surfaces the failure inline, because silently reverting a colour choice reads as the tap not registering.
- **Offline** — the banner above the content (`Nincs internetkapcsolat`). A theme change may queue; **sign-out must not** — a queued sign-out that appears to succeed leaves an authenticated session on a device the user believes they have left.
- **Device-gated** — a cue channel the device cannot produce (no speech voice installed, no vibration motor) renders dimmed and inert with its hint explaining the absence.
- **Role-gated** — admin gains the `ADMIN` section and the `Admin felület megnyitása` link. Coach sees the identical screen with the chip reading `Edző`. The link is a convenience; the route and every endpoint behind it re-check the role server-side.

## Components

Reuses `Pressable`, `Switch`, `CueSettings` (kept whole — its three-channel split and its `useSyncExternalStore` wiring are unchanged), `LanguageToggle`, `useSession` / `useLogout`, the `control` recipe, `Skeleton`, `OfflineIndicator`, `BottomNav`. `ThemeStudio` survives in reduced form: the preview tile and the pack chips stay, the accent and gradient sections leave.

Deleted from this screen: `AccentPicker` and `GradientBuilder`. Keep the files — the accent picker's contrast maths (`ui/theme/contrast.ts`) is the gate any future colour input will need.

Genuinely new: the avatar anchor with its status ring and badge, the role chip, the section header icon holder (repeated on every screen in this redesign), and the reduced preview tile.

## Navigation

Member bar, five tabs, `Profil` active. Coach six, admin seven — and the admin's seventh is not this screen's business: `ADMIN` here is a section, deliberately not a tab.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/06-settings.webp]]
![[_mockups/vilagos/06-settings.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]

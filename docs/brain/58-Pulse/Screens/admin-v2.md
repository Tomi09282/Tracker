---
type: screen-inventory
title: Admin v2 — accounts, marketplace posts, the Moderáció panel and Statistics
updated: 2026-11-08
route: "/admin, /admin/stats, /admin/accounts, /admin/accounts/:id, /admin/accounts/:id/coins, /admin/marketplace, /admin/marketplace/posts/:publicId"
tags: [ux, screen, inventory, pulse, admin]
---

# Admin v2 — what the admin area is now

Built from the owner's decisions of 2026-11-03 and recorded in [[0026-admin-v2-inspect-and-correct]].
It replaces the user search and the footer sentence of the old overview ([[admin]], an inventory
written on 2026-10-11 against the earlier code). Design round A had already turned **Fiókok** and
**Piactér** into routes of the admin bar (a lit tab, a URL, a way in from the bar); Admin v2 filled
them and added the account page, the coin ledger, the marketplace post page and the Statistics page.
Admin only: a member or coach reaching any of them gets the forbidden page, and the server answers
403 whatever the client does. The admin bar has three tabs — **Moderáció**, **Fiókok**, **Piactér**;
*Részletek* and *Szabályok* are door rows, not tabs, so Moderáció stays lit on `/admin/stats` and
`/admin/rules`.

**Evidence.** Sources: `pkg/B-admin-*/api.md`, `pkg/S-admin-*/handoff.*`, `frontend/src/features/admin/**`,
`frontend/src/app/router.tsx`. Marked **✔** below = opened in a browser on 2026-11-08 against a
throwaway backend (seeded with `seed:dev-users`, `seed:demo`, the marketplace seed and one pending
exercise) and compared with the API's own answer where it prints a number; **◦** = taken from the
hand-in and not re-walked.

## The routes

| Route | What it shows | Reads | Writes |
|---|---|---|---|
| `/admin` — Moderáció | **STATISZTIKA** panel: six figures (*Felhasználó összesen, Új 7 napban, Aktív edző, Edzés ma / 7 nap, Várakozó moderáció, Nyitott jelentés*), the 30-day curve *Aktív naplózók · 30 nap* with "N ma", two door rows (*Részletek*, *Szabályok*); then **MODERÁCIÓS SOR** "N várakozik" with the submitted exercises ✔ | `GET /admin/stats` (additive `panel`), `GET /admin/moderation` (at most 50 rows, no cursor — DEV-099) | the exercise decisions (approve / reject with a reason) ◦ |
| `/admin/stats` — Statisztika | back door *< Moderáció*, window switch **7 / 30 / 90 nap** in `?days=`, six blocks — FELHASZNÁLÓK (with the Tagok / Edzők / Adminok split), AKTIVITÁS, ÉRME (with *Integritás ellenőrzés*), PIACTÉR (with the post-state split), EDZŐK, RENDSZER ✔ | `GET /admin/statistics?days=` | — |
| `/admin/accounts` — Fiókok | search *Keresés névben vagy e-mailben* (accent- and case-insensitive: `kovacs` finds `Kovács`), SZEREP / ÁLLAPOT / RENDEZÉS lines, "28 fiók", rows with the badges **LETILTVA** and **JELSZÓCSERE**, paging "Továbbiak 24 / 28" ✔. The whole state is in the URL (`q`, `role`, `state`, `sort`, `dir`), so list → account → back restores it | `GET /admin/users` (24 per page, keyset cursor) | — |
| `/admin/accounts/:id` | the account page: FIÓK, EDZŐI OLDAL (clients 0 / 3, package, subscription), PIACTÉR, ÉRME, TEVÉKENYSÉG (**counts only**, with "A tartalom privát: az admin csak a darabszámot látja."), NAPLÓ (last five account events, in words), MŰVELETEK ✔ | `GET /admin/users/:id` — one request | name, role, disable / enable (reason), coin correction, sign out everywhere, lift the lock-out, force a password change |
| `/admin/accounts/:id/coins` | the whole coin ledger of one account, with reasons and notes; a missing account draws **"Ez a fiók nem található"** ✔ | `GET /admin/coins/ledger?user_id=` | — |
| `/admin/marketplace` — Piactér | two views. **JELENTÉSEK** lists *cases* (reports of one reason on one subject, with the number of distinct reporters), filtered *Nyitott / Vizsgált / Helybenhagyott / Elutasított*. **POSZTOK** lists every post, search *Cím vagy @szerző*, state *Mind / Piszkozat / Élő / Visszavonva / Levéve*, a "N jelentés" mark on the rows ✔. `?view=posts&q=<handle>` is how the account page's *Nyitott bejelentés* door lands here | `GET /admin/marketplace/posts`, `GET /admin/marketplace/reports` | — |
| `/admin/marketplace/posts/:publicId` | the post: state, the *Indok* of a take-down, **Visszaállítás**, ADATOK (read-only), SZERZŐ, the ÁLLAPOT timeline, SZÖVEG (an excerpt and *Teljes szöveg*), MÉDIA, JELENTÉSEK, KEZELÉS ✔ | `GET /admin/marketplace/posts/:publicId`, `GET /admin/marketplace/media/:key` | take-down (`POST /admin/marketplace/remove`, reason required), **restore** (`POST …/restore`), resolve a report, take down the author's profile |

## Rules the screens depend on

- **Counts, never content.** TEVÉKENYSÉG is four numbers. A draft's SZÖVEG and MÉDIA are withheld
  ("Nem nyilvános · csak a szerző látja."); a post that *was* published stays readable in every later
  state, because that content was public and is what a report is about.
- **The page says why a post is not public.** `publicVisibility.hiddenBy` carries any of `draft`,
  `withdrawn`, `removed`, `author_disabled`, `author_not_coach`, `profile_unpublished`, `profile_removed`.
  A post of a **disabled author is not visible** — anonymous visitors get 404 and the public feed
  omits it ✔ — and after a restore the page must say so when something else still hides it instead of
  claiming the post is public again.
- **Your own account is read-only where it would lock you out.** The own-account page hides
  *Szerepkör*, the disable row and *Érme-korrekció* and says "A saját fiókodat itt nem módosíthatod."
  ✔ (the server refuses all three: `cannot_change_own_role`, `cannot_disable_self`,
  `cannot_adjust_own_coins`).
- **Step-up.** Choosing *Admin* in the role sheet, and **enabling a disabled admin**, ask for the
  admin's own password in the sheet; a wrong password is one request, the error stands under the field
  and clears on edit ✔ (API) ◦ (sheet).
- **A late action is told.** If a second admin already did it, the server answers `replayed: true`,
  and a second restore answers 409 `not_removed` and writes no audit row ✔ (restore, in the API); the
  sheet's "already disabled / enabled" wording is from the hand-in ◦.
- **Writes never queue offline.** The admin mutations run with `networkMode: 'always'`; a sheet's save
  is inert while the shell says offline and a failed request says so at once ◦.
- **Statistics are honest.** *Nincs valódi napi aktív felhasználó: a termék nem tárol utolsó belépést.*
  is printed under AKTIVITÁS ✔; every figure on the page equalled the API's ✔. The panel reports
  **9** open reports where **JELENTÉSEK** shows **8** — the panel counts reports, the tab counts cases.

## States

Loading is a skeleton; a failed read is one line with **Újra** (never a false empty state); the
statistics page has a full-page error with the same pill; the queue's empty state is the graphite shield
and the display title; *forbidden* is its own page ◦. An unknown account draws "Ez a fiók nem
található" rather than an empty ledger ✔; a malformed `:id` (`0x10`, ` 5`, `05`, `5e0`) is a 400 from
the API and can never address a different account ◦.

## Where the app knowingly differs from the frames

`docs/pipeline/pulse/deviations.md` **DEV-094 … DEV-100**: the account NAPLÓ shows the actor's e-mail
and the action only (094); the sheets carry the kit's close X (095); a taken-down **author profile**
cannot be restored (096); three post frames are older than the product (097); figures above 9 999 read
"12k" (098); the queue lists its first 50 only (099); and what stays of the screen reviews (100:
markup in a display name, the text of a hidden-then-edited post, the undrawn moderation history).
All are waiting for the owner.

## Not covered here

`/admin/rules` (the point rules, part of LifeOS), the style studio ([[admin-elem-stilus-studio]]), the
exercise review body inside a queue row, and the coin audit page.

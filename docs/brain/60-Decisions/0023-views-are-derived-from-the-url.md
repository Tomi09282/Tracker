---
type: adr
title: ADR-0023 The view (member / trainer / admin) is derived from the URL, never stored or sent
status: accepted
date: 2026-11-03
tags: [decision, adr, lifeos, navigation, roles, frontend]
---

# ADR-0023 — The view is derived from the URL

**Context.** LifeOS made roles stackable (B-roles: `roles[]`, one account can be member, trainer and
admin at once) and gave each role its own bottom bar (design round A `nezetek/bars`): member
`Ma · Edzés · Étkezés · Naptár · Haladás · Profil`, trainer `Tag · Kliensek · Tervek · Pult`, admin
`Tag · Edző · Moderáció · Fiókok · Piactér`. Something has to decide which bar a screen shows. A
stored "current mode" (a server field, a localStorage flag) can disagree with the page on screen,
survives a reload into the wrong place, and invites the question "does the mode grant anything".

## Decision

1. **The URL decides** (`frontend/src/app/navTabs.ts` `viewForPath`, `useView.ts`): a path under
   `/coach` or `/compose` is the trainer view, under `/admin` the admin view, everything else the
   member view. A view the account cannot hold is never drawn: a member who opens `/coach` gets the
   member bar and the page's own refusal ("Ez a felület edzőknek szól"), with no tab lit.
2. **One shared screen**, `/notifications`, keeps the view the user came from; that last view is
   remembered in this tab's `sessionStorage` (`tracker.lastView`) and nowhere else.
3. **A view grants nothing.** It is never sent to the server; every route and endpoint re-checks the
   role (403 on a role gate, 404 on an object miss). The nav is a convenience, not a permission.
4. **Entering and leaving**: Profil's "NÉZETEK" rows (`Edzői nézet` -> `/coach`, `Admin nézet` ->
   `/admin`) enter a view; the switch cells first in the trainer / admin bar (`Tag`, `Edző`) leave
   it. A switch cell is never lit; each route lights exactly one tab of its view (gate
   `check:nav-active`).
5. The admin's `Szabályok` page (`/admin/rules`) is reached from Moderáció's door row and lights
   Moderáció (S-admin-rules) — the admin bar keeps five cells.

## Consequences

- A deep link always opens in the right bar; a reload never changes the view.
- Checked in the LifeOS closing sweep (2026-11-03) for all three dev accounts at 360 / 402 / 430.
- A new trainer- or admin-only route must be added under the view's prefix (or to `VIEW_ROUTES`),
  or it renders in the member bar.

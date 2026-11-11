---
type: screen-inventory
title: Edzői kezdőlap — screen inventory
updated: 2026-10-11
route: "/coach"
tags: [ux, screen, inventory, pulse]
---

# Edzői kezdőlap — `/coach` · coach + admin (a member gets a forbidden page) · reached by the bottom tab "Edző", and by the back link of client detail and of the chat screen · lit tab: **Edző**

"Edzői kezdőlap" is a working name with no string behind it. On screen the page is `coaching.eyebrow` = "Edzői felület" over the h1 `coaching.title` = "Klienseim". Sources read: `frontend/src/features/coaching/CoachDashboard.tsx`, `useCoaching.ts`, `Monogram.tsx`, `features/chat/NotificationBell.tsx`, `lib/person.ts`, `app/navTabs.ts`, `backend/src/coaching/routes.js`, `backend/scripts/seed-demo.mjs`, brain spec `55-Screens/coach-dashboard.md` (intent only; its look is discarded). Status words: **live** = in code and reachable · **planned** = spec / API only · **cut** = decided against.

| Fact | Value |
|---|---|
| Roles | coach = 6 tabs, admin = 7 tabs; content identical. Tab `nav.coach` = "Edző" is lit (it owns every `/coach/…` path). |
| Doors out | roster row → `/coach/clients/:linkId` · link `nav.plans` = "Tervek" → `/coach/plans` (the only DIRECT door to the plan library on a phone; the one other way in is the back link inside the plan editor, which is reached from a client's plan row) · bell → `/notifications` |
| Bell | Lives on exactly two screens: Home and this one. |

## Purpose

The coach's home base: read who the clients are and which of them stopped training (completed sessions in the last 28 days, a count, never a percentage), open one client, and hand out or take back access (join code, pre-made accounts, archive).

**The ONE primary action (the only filled control at rest in the code): `coaching.mintCode` = "Új kód"** — mint a join code. Note the tension: the most frequent act is not the primary one, it is tapping a roster row.

## Elements

### MUST

| Element | Data shown + action | Exact copy | Sample |
|---|---|---|---|
| Page title | live. Static eyebrow + h1. | `coaching.eyebrow` = "Edzői felület" · `coaching.title` = "Klienseim" | — |
| Plan-library link | live. Text link with a small glyph, directly under the title → `/coach/plans`. | `nav.plans` = "Tervek" | — |
| Notification bell | live. Unread badge: hidden at 0 · the number · "99+" when the server caps it. Tap → `/notifications`. | accessible name `notifications.withUnread` = "Értesítések, {{count}} olvasatlan" / at zero `notifications.title` = "Értesítések" | badge 1 |
| Client total (the anchor) | live. Number of non-archived links; counts up on mount. (The query would also count a link in the "invited" state, but no live flow creates one — both live flows write an active link; only the demo seed has two invited rows.) | `coaching.clients` = "Kliensek" | 6 |
| Team split + legend | live. One segment per team, largest first, at most 3 named teams; further teams fold into one "other" segment; clients without a team come last. Only teams that have a client appear. Legend item = name + count. Read-only. On an account built through the UI alone the whole split is one "Csapat nélkül" segment (see Notes: nothing in the UI puts a client into a team). | team names are the coach's own free text (no key) · `coaching.otherTeams` = "Egyéb csapatok" · `coaching.unassigned` = "Csapat nélkül" | Erőemelő csapat 2 · Reggeli csoport 2 · Online kliensek 1 · Csapat nélkül 1 |
| Teams count | live. Number of teams; the WHOLE figure is a button that opens the Teams sheet. | `coaching.teams` = "Csapatok" | 3 |
| Live codes count | live. Codes not revoked and not used up. Not tappable. | `coaching.activeCodes` = "Élő kódok" | 2 |
| Join-codes section + primary | live. Heading + the primary. Tap = a code is created at once (always multi-use, 20 uses, valid 30 days, no team; nothing is asked) and the "code ready" sheet opens. The other half is missing: no member screen has a field to type a code into (nothing in the frontend calls the redeem endpoint), so a code handed out today can only be redeemed through the API. | `coaching.joinCodes` = "Csatlakozási kódok" · `coaching.mintCode` = "Új kód" (with a plus glyph) | — |
| Live code row | live. One row per live code: usage only (the code text can never be shown again). Action: revoke, immediate, no confirmation. | `coaching.codeUses` = "{{used}} / {{max}} felhasználva" · `coaching.revoke` = "Visszavonás" | "3 / 20 felhasználva" · "0 / 20 felhasználva" |
| Roster heading | live. Heading + the client total again, right-aligned. | `coaching.roster` = "Névsor" | 6 |
| Roster row | live. Monogram (2 letters) · name (display name; e-mail local part when the person never set one) · 28-day session count. The whole text column is the link to the client. A count of 0 is drawn in the warning tone. | `coaching.sessions28d` = "{{count}} edzés / 28 nap" | table below |
| Archive control (per row) | live. Icon-only trailing button → confirmation sheet. Never fires directly. | accessible name `coaching.archive` = "Archiválás" | — |
| Tab bar | live. Coach: 6 equal cells. | `nav.home` = "Kezdőlap" · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.coach` = "Edző" · `nav.profile` = "Profil" | Edző lit |

### SHOULD

| Element | Data shown + action | Exact copy | Sample |
|---|---|---|---|
| Handover notice | live. Only when ≥ 1 client still holds the coach-made temporary password. Headline with the count + one consequence line. Not tappable. | `coaching.handoverTitle` = "{{count}} fiók átadásra vár" · `coaching.handoverShort` = "Amíg nem állítanak be saját jelszót, nem tudnak belépni" | "1 fiók átadásra vár" |
| Pending tag on a roster row | live. Small upper-case warning tag after the session count of such a client. | `coaching.pending` = "átadásra vár" | on `horvath.gabor` |
| Pre-made accounts door | live. Quiet text button closing the join-codes section → sheet. | `coaching.pregenTitle` = "Előre létrehozott fiókok" | — |
| Sheet "code ready" | live. Title + close · explanation · the code, shown exactly once · copy control (after a successful copy it shows a check and the word for about 2 s; when the clipboard refuses, a warning glyph in the danger tone and `common.retry` = "Újra" for about 3 s). | `coaching.codeReady` = "A kód elkészült" · `coaching.codeOnce` = "Másold ki most. Ez az egyetlen alkalom, amikor látod — a szerver csak a hashét tárolja." · `common.copy` = "Másolás" · close: `common.close` = "Bezárás" | K7MPX-R4TQ2-HB9WD-6NJEV |
| Sheet "teams" | live. One text field + one button (disabled while empty). Creates a team. After submit the field empties and the sheet stays open, with no success message (only the "Csapatok" count behind the scrim changes). Nothing else: no list of teams, no members. | title `coaching.teams` = "Csapatok" · `coaching.teamName` = "Csapat neve" · `coaching.createTeam` = "Létrehozás" | typed: Kezdő tábor |
| Sheet "pre-made accounts" | live. Field + hint + button. After success a warning panel lists each new account: name (e-mail local part) · temporary password (12 characters) · copy (puts "full e-mail / password" on the clipboard, although the screen shows only the local part); its only exit is a danger button. While the panel is up, scrim tap, Esc, a drag-down and the sheet's own close glyph all do NOTHING — the close glyph is drawn but dead. | `coaching.pregenEmails` = "E-mail címek" · `coaching.pregenHint` = "Vesszővel vagy szóközzel elválasztva." · `coaching.pregenCreate` = "Fiókok létrehozása" · `coaching.tempOnce` = "Az ideiglenes jelszavakat most írd fel — nincsenek nyílt szövegben tárolva." · `common.copy` = "Másolás" · `common.dismiss` = "Bezárás" | horvath.gabor · Q7RM2XKD9WHT |
| Sheet "archive?" | live. Monogram + sentence with the client's name · danger confirm · cancel. | `coaching.archiveConfirmTitle` = "Biztosan archiválod?" · `coaching.archiveConfirmBody` = "{{email}} ezután nem lesz a klienseid között, és nem látod a jövőbeli adatait. Ez visszafordítható, de a hozzáférés azonnal megszűnik." · `coaching.archive` = "Archiválás" · `common.cancel` = "Mégse" | "Kiss Anna ezután nem lesz…" |

### Sample roster (signed-in coach: Kovács Péter, monogram KP, role `settings.role.coach` = "Edző")

Row order is what the code produces: by team name, then by name, clients without a team last — but the row itself shows NO team, so the list does not look alphabetical.

| # | Monogram | Name on the row | Line under it | Tone | Team (legend only) | Joined how (client detail only) |
|---|---|---|---|---|---|---|
| 1 | SB | Szabó Bence | 11 edzés / 28 nap | normal | Erőemelő csapat | csapatkóddal |
| 2 | TD | Takács Dániel | 15 edzés / 28 nap | normal | Erőemelő csapat | meghívóval |
| 3 | KA | Kiss Anna | 0 edzés / 28 nap | warning | Online kliensek | csapatkóddal |
| 4 | NE | Nagy Eszter | 9 edzés / 28 nap | normal | Reggeli csoport | meghívóval |
| 5 | TL | Tóth Lilla | 6 edzés / 28 nap | normal | Reggeli csoport | csapatkóddal |
| 6 | VM | Varga Márk | 4 edzés / 28 nap | normal | — | kézzel |

Where the numbers come from: the six names are the shared sample set. Team names (Erőemelő csapat, Reggeli csoport, Online kliensek), the spread of join origins, the code usage shape and the nameless pre-made account are taken from the demo seed (`seed-demo.mjs`: 4 teams, 14 roster rows; of its 7 codes the screen lists four as live — 7/10, 3/20, 0/25 and an already expired 0/10). "0 / 20" is what a code minted on this screen reads. Seed-only shapes, kept because the running demo shows them: team membership, and the origins "meghívóval" (Dániel's own seeded link) and "kézzel". The live flows write only two origins — "csapatkóddal" for EVERY join by code, with or without a team, and "általad létrehozva" for a pre-made account — and never a team. Dániel's 15 is derived, not invented: 16 of his planned sessions fall in the 28-day window (11 Sept – 8 Oct), the seed skips Wed 16 Sept, and Friday 9 Oct's session has not happened yet at the reference moment. Kiss Anna at 0 matches the chat inventory, where she is a new client with an empty thread.

## States

| State | What shows (copy) |
|---|---|
| Loading | Never a spinner. Placeholders in the final geometry: the anchor numeral + legend line · the two counts · one roster block. Title, link, bell, both section headings, the "Új kód" control and the pre-made accounts door are already real. One wrong figure while it loads: the count beside "Névsor" reads 0 until the list lands. |
| Default | Frame 1. |
| Quiet client | A row whose count is 0 → the count line in the warning tone (text colour only). The only signal on the list. |
| Handover pending | Notice between the counts and the join-codes section + the tag on each affected row (Frame 3). |
| No live codes | Heading and "Új kód" stay; no rows and no empty-state copy. Count shows 0. |
| Empty roster (new coach) | No anchor at all (a total of 0 is not drawn) · the two counts keep their real numbers ("0" and "0" for a brand-new coach) · join-codes section as usual · under "Névsor 0": `coaching.emptyTitle` = "Még nincs kliensed" + `coaching.emptyBody` = "Adj ki egy csatlakozási kódot, vagy hozz létre fiókokat nekik." — no button inside the empty state; "Új kód" above it is the way forward. |
| Roster failed | Only the list fails: `auth.errors.generic` = "Nem sikerült a művelet. Próbáld újra." + button `common.retry` = "Újra". Header, counts and codes still render from what did load. |
| Offline | Shell strip above everything: `offline.title` = "Nincs internetkapcsolat". Disabled: "Új kód", every "Visszavonás", every archive icon, "Archiválás" inside the sheet, "Létrehozás", "Fiókok létrehozása". Rows, "Tervek" and the bell stay live. |
| Busy | Each control shows its own busy state in place (three dots in Pulse). All "Visszavonás" buttons go busy together while one revoke runs. |
| Forbidden (member opens the URL) | Whole page replaced by one empty state, as the h1: `coaching.forbiddenTitle` = "Ez a felület edzőknek szól" + `coaching.forbiddenBody` = "Ha edzőként szeretnél belépni, kérj meghívót." No action. 5-tab bar, no tab lit. |
| Admin | Same content, 7-tab bar (`nav.admin` = "Admin" between Edző and Profil). |
| Sheets (4) | code ready · teams · pre-made accounts (form → form + secrets panel) · archive confirmation. All bottom sheets with title + close; scrim tap and Esc close them, except the secrets panel. |
| Not handled in code | A failed mint, team create, account creation, revoke or archive shows nothing (the busy state just ends). Account creation also drops the server's "skipped" and "seat limit reached" answers silently. No copy exists for any of these. |

## Frames to draw

Words in CAPS below are the same hu.json strings set in the display face (upper-case by style, like "HETI EDZÉS" on Home) — never retype the source. Canvas 402 × 874; Frame 1 is taller than one screen, draw it as one tall frame and mark the fold.

### Frame 1 — "Edző · Klienseim (alap)" — returning coach, nothing pending

1. Status bar 9:41.
2. Header, same grammar as the approved Home header: title "Klienseim" · secondary line "Edzői felület" · right: bare bell glyph with the lime badge "1".
3. Link line: "Tervek" with a trailing chevron.
4. Anchor: label "KLIENSEK" · giant numeral "6".
5. Team split under the numeral: four segments in the proportion 2 : 2 : 1 : 1, then the legend "Erőemelő csapat 2" · "Reggeli csoport 2" · "Online kliensek 1" · "Csapat nélkül 1".
6. Hairline. Two figures on one line: "CSAPATOK" 3 with a chevron (it is a button) · "ÉLŐ KÓDOK" 2 (no chevron).
7. Hairline. Section line: "CSATLAKOZÁSI KÓDOK" · right: the one lime pill "+ Új kód" (compact, not full width).
8. Row: "3 / 20 felhasználva" · right "Visszavonás". Row: "0 / 20 felhasználva" · right "Visszavonás".
9. Quiet text button: "Előre létrehozott fiókok".
10. Hairline. Section line: "NÉVSOR" · right "6".
11. Six rows, each: monogram · name · count line · trailing archive glyph — SB "Szabó Bence" "11 edzés / 28 nap" · TD "Takács Dániel" "15 edzés / 28 nap" · KA "Kiss Anna" "0 edzés / 28 nap" (warning tone) · NE "Nagy Eszter" "9 edzés / 28 nap" · TL "Tóth Lilla" "6 edzés / 28 nap" · VM "Varga Márk" "4 edzés / 28 nap".
12. Bottom fade + tab bar, 6 cells: Kezdőlap · Edzés · Étkezés · Haladás · **Edző** (lit) · Profil.

### Frame 2 — "Edző · A kód elkészült (lap)" — right after tapping "Új kód"

1. Frame 1 underneath, dimmed by the scrim (behind it the count already reads "ÉLŐ KÓDOK 3" and the new code is the FIRST row — the list is newest first: "0 / 20 felhasználva", "3 / 20 felhasználva", "0 / 20 felhasználva").
2. Bottom sheet. Title "A kód elkészült" · close glyph on the right.
3. Body: "Másold ki most. Ez az egyetlen alkalom, amikor látod — a szerver csak a hashét tárolja."
4. The code on one line, tabular: "K7MPX-R4TQ2-HB9WD-6NJEV" · right: copy glyph (state after a tap: check + "Másolás").
5. No other button. No tab bar change.

### Frame 3 — "Edző · Átadásra váró fiók" — one pre-made account not yet taken over

Same as Frame 1 with these differences (7 clients now):
1. Anchor "7"; legend "Erőemelő csapat 2" · "Reggeli csoport 2" · "Online kliensek 1" · "Csapat nélkül 2".
2. Between the two counts and the join-codes section, the notice in the warning tone: alert glyph · "1 fiók átadásra vár" · "Amíg nem állítanak be saját jelszót, nem tudnak belépni".
3. "NÉVSOR" · "7". Rows 1–5 as Frame 1, then the new row 6: monogram HG · "horvath.gabor" · "0 edzés / 28 nap" (warning tone) + tag "ÁTADÁSRA VÁR" · archive glyph; then row 7: VM "Varga Márk" "4 edzés / 28 nap".

## Images

| Idea | Note |
|---|---|
| "Edző" tab icon | REQUIRED, and now made: `assets/pulse/app/tab2-coach.png` + `tab2-coach-active.png` (a steel whistle seen from the side, the same family as the five `tab2-*` icons; the active file is the same pixels in lime). The admin bar's seventh exists too: `tab2-admin.png` + `-active` (a plain shield). All four are in `assets/pulse/manifest-app.json` (rebuilt 10 Oct, 49 slots) with image hash and shelf node; this file was written a few minutes before they existed. |
| One still beside the anchor numeral | Optional, in the slot the fist holds on Home (right of the giant numeral, edgeless, glowing out of black). It exists: manifest slot `hero-stopwatch` (`assets/pulse/app/hero-stopwatch.png`) — a low-key black-and-white photograph of a coach's hand holding a steel stopwatch (945 × 837, feathered true-black edges, the same family as `hero-grip`; a photograph, not tab-icon steel). Its manifest entry names this screen's header as its first use, then client detail and the forbidden state. `hero-grip` itself stays reserved for Home. |
| Empty roster | The same still (`hero-stopwatch`), larger and dim, above "Még nincs kliensed". No new art. |
| Monograms | Type only (two letters). In OPEN FIELD no disc, no tile behind them. |

Must NOT be shown as if it existed: client photos or avatars (monograms everywhere) · a coach portrait · team logos, crests or colour dots chosen by the coach · a QR code for the join code · per-client sparklines or progress thumbnails · exercise media.

## Do not invent

- **Roster tools**: search, filter, sort control, A–Z index, team filter chips, team headings, pagination, pull-to-refresh, swipe actions. The list is flat with one fixed order.
- **Team management**: a list of teams, renaming or deleting a team, team descriptions, team member lists, moving a client into a team, choosing a team when minting a code or creating accounts. The UI can only CREATE a team name. No route moves an existing client into a team; the only way into one is server-side — the API accepts a team on a code and on a pre-made batch, and a client who redeems a team code lands in that team — but this screen never sends a team with either.
- **Per-client extras on the row**: the team name, an "invited / active" status tag, adherence percent, rings, streaks, trend arrows, "last trained 3 days ago" (the API returns the last session date; nothing draws it), goal, plan name, unread-message badge, last-message preview, e-mail address or phone (the address is deliberately never shown on coach screens).
- **A messages inbox** or conversation list, a "message all" action. Chat is reached only through a client.
- **Code details**: the code text after the sheet closes, a label, the team, an expiry date, a share / QR / link action, choosing uses or validity.
- **Undo for archive**, an "archived clients" list, restore. The confirmation copy says it is reversible; the coach has no route or screen for it (the one thing that revives an archived link is the client redeeming one of this coach's codes again, server-side).
- **Adding a client by e-mail invitation**, resend invite, bulk import. The only two flows are the join code and pre-made accounts.
- **A member-side "enter your coach's code" field** (on register, onboarding, Home or Profil) and a **"set your own password" screen** for a pre-made account: neither exists in the frontend. Both belong to other screens; do not draw them as existing there because this screen hands out codes and passwords.
- **Money and limits**: revenue, payments, subscription tier, a seat-usage meter, "upgrade".
- **Coach analytics**: charts over time, today's schedule, "who trains today", a calendar, tasks, an activity feed.
- **A door to the marketplace desk** (`/compose`): none exists on a phone. The string `nav.compose` = "Publikálás" exists; a link here would be new wiring — flag it, do not draw it as live.
- A global top bar, a floating action button, badges on tabs.

## Notes for the designer

- **Everything here was a box**: three "tiles", an alert card, code rows and the roster were all bordered surfaces, and the anchor was a 208 pt donut. In OPEN FIELD the roster, code rows and counts are hairline rows; the notice needs a no-box form (warning-toned glyph and headline between two hairlines works with the palette). Sheets are overlays — the one place a surface is allowed.
- **The team split is a category, not a status.** Do not light team segments in lime-as-achieved and never use warning or danger hues for them: on this screen warning already means "cannot log in" and "trained zero times". The old code used three different hues; with one accent the split needs tone steps or pattern, plus the legend text, which carries the meaning anyway. With 0 teams the whole anchor is one "Csapat nélkül" segment.
- **The lime pill is small here.** "Új kód" is a compact pill at the end of a section line, used a few times a year; do not turn it into Home's full-width glowing bar. Nothing else on the page is filled.
- **"CSAPATOK 3" is a button with no visible affordance in the code** — give it a chevron; "ÉLŐ KÓDOK 2" is not a button and must not look like one.
- **Code rows are indistinguishable**: two codes with the same usage read the same; there is no name, team or date to tell them apart. Revoke has no confirmation. Codes past their expiry date still count and list as live (the screen never checks expiry).
- **Long strings**: the code is 23 characters ("K7MPX-R4TQ2-HB9WD-6NJEV") and must stay on one line, tabular, never truncated · `coaching.codeOnce` is 87 characters (3 lines) · the archive sentence is 125 characters plus the name (134 with "Kiss Anna"; 4–5 lines) · `coaching.handoverShort` is 55 characters (2 lines at 354 pt) and is plural even for one account · a nameless account shows a lower-case e-mail local part ("horvath.gabor", in the seed "demo.lukacs.adam") · display names go up to 120 characters and team names up to 80: one line with ellipsis on the row, wrap in the legend.
- **A 0-session row has three meanings and one look**: a client who stopped training, a brand-new client, or a pre-made account nobody has logged into (that one also carries the tag). An "invited, not yet accepted" client would be counted and listed too with nothing marking it, but only the demo seed contains such rows.
- **Both ways onto the roster are half-built in the UI today** (checked by searching the frontend for the two endpoints): a join code can be minted here but no member screen can redeem it, and a pre-made account's owner has no screen to set their own password — so "átadásra vár" never clears through the app, and the notice plus tag of Frame 3 is the permanent look of every pre-made account until that screen exists. Draw both flows as the code has them; flag the gap to the owner instead of designing around it.
- **The team split is seed data on a real account.** Codes and pre-made accounts are created here without a team and no control moves a client into one, so a coach who only uses the app sees "Csapatok N" with every client under "Csapat nélkül" — one grey segment. Frames 1 and 3 show the seeded split; make sure the one-segment case does not look broken, and do not let the split carry the anchor on its own.
- **Roster order** follows teams that the row does not show (see the sample table). Either accept it or ask the owner; do not add team headings on your own.
- **Legend overflow**: 4+ teams → the three largest teams by head count, then "Egyéb csapatok N", then "Csapat nélkül N" (at most 5 legend items).
- **The coach's bell** really fires for one event only: a client sent a chat message — and the member has no chat screen yet (the only chat route is the coach's), so today that event can only come through the API or the demo seed. The badge "1" is the intended state. Draw the badge small (1–3).
- **Counts animate** from 0 on mount (anchor and both figures) — matches the brief's count-up motion; under reduced motion they just appear.
- **Fold**: header + anchor + counts + codes take roughly one screen; the roster — the thing the coach comes for — starts near the fold. Keep the blocks above it tight so at least two roster rows are visible at 402 × 874.

---
type: screen-inventory
title: Piactéri pult — screen inventory
updated: 2026-10-11
route: "/compose"
tags: [ux, screen, inventory, pulse]
---

# Piactéri pult — route `/compose` · reached by coach and admin (server gate `requireCoach`; a member who types the URL gets the error state) · you get there ONLY through the desktop command palette (Ctrl/Cmd+K, ≥ 1024 px) entry `nav.compose` = "Publikálás", by typed URL, or back from the two editors via `compose.backToDesk` = "Vissza a pulthoz" — there is NO door on a phone (nothing on the coach dashboard or in Profil links here) · bottom tab lit: `nav.coach` = "Edző" (6-tab coach bar, 7-tab admin bar; `navTabs.ts` makes "Edző" own `/compose`)

Sources read: `features/compose/ComposePage.tsx`, `useCompose.ts`, `kindIcons.ts`, `app/router.tsx`, `app/navTabs.ts`, `ui/shell/CommandPalette.tsx`, `backend/src/public/compose.js` (context + list routes), `visibility.js`, migration `021_public_marketplace.sql`, `backend/scripts/seed-demo.mjs` §12, `55-Screens/piacteri-pult.md`. Status words: live = in code and reachable · planned = spec / API only · cut = decided against.

## Purpose

The coach's own side of the public marketplace. They come to answer "is my stuff out there?" (is my profile public, what state is each post in, how many publishes do I have left today) or to start writing.
**ONE primary action:** `compose.newPost` = "Új bejegyzés" → `/compose/posts/new`. Exception coded in the screen: while a gate with its own button is showing (guidelines, no profile), THAT button is the primary and "Új bejegyzés" drops to a secondary. On the takedown and account-age gates there is no primary at all.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Identity row | live | Small monogram (initials of the PUBLIC PROFILE's display name), display name, `@handle`. Not tappable itself. The whole row is absent when the coach has no profile or the profile was taken down. | no key (data); the `@` is hard-coded | KP · Kovács Péter · @kovacs-peter |
| Profile status control (right end of the identity row) | live | Two states: public / hidden. It is a real control: opens the profile sheet (see SHOULD). Code tints the public state with the success colour and a globe glyph; hidden = plain + eye-off glyph. | `compose.live` = "Élő"<br>`compose.hidden` = "Rejtve" | Élő |
| Screen title (the only h1) | live | Static. | `compose.title` = "Piactéri pult" | Piactéri pult |
| Inventory total | live | Count of the coach's posts in ALL states + its unit, counting up on load. Always describes the whole desk, never the filtered list. Counts only the first page the API returns (max 12 — see Notes). Shows 0, never disappears. | `compose.postsUnit` = "bejegyzés" (accessible name of the figure: `compose.posts` = "Bejegyzések") | 5 bejegyzés |
| Inventory split | live | One count per state, ALL FOUR always named, zeros included (the old mockup's unlabelled fourth arc was a recorded defect). Not tappable. | `compose.state.live` = "Élő"<br>`compose.state.draft` = "Piszkozat"<br>`compose.state.withdrawn` = "Levett"<br>`compose.state.removed` = "Eltávolított" | Élő 4 · Piszkozat 1 · Levett 0 · Eltávolított 0 |
| Daily publish quota | live | One sentence + a thin meter (used / max, rolling 24 h, server numbers). Meter turns to the warning colour when nothing is left. Informational only — nothing is pre-disabled; the refusal happens in the post editor. | `compose.slots` = "Ma még {{left}} publikálás a {{max}}-ból." | Ma még 9 publikálás a 10-ból. · meter 1/10 |
| Posts section label | live | Static h2. | `compose.posts` = "Bejegyzések" | Bejegyzések |
| New-post action | live | Link with a plus glyph → `/compose/posts/new`. Primary unless a gate button is on screen. | `compose.newPost` = "Új bejegyzés" | Új bejegyzés |
| State filter | live | Single choice, re-queries the list. Three options + an overflow that reveals the two rare states (once expanded it stays expanded; "Több" disappears). Selected option carries a TRAILING check glyph. No count badges (the split above already has them). | `compose.state.all` = "Mind"<br>`compose.state.draft` = "Piszkozat"<br>`compose.state.live` = "Élő"<br>`common.more` = "Több"<br>behind it: `compose.state.withdrawn` = "Levett", `compose.state.removed` = "Eltávolított" | Mind (selected) · Piszkozat · Élő · Több |
| Post row | live | Whole row → `/compose/posts/:id`. Two lines only: title (1 line, ellipsis) and "kind · state". A live row is marked so "Élő" reads before the caption (code: success tint + small check). No date, no excerpt, no thumbnail, no price. Order: newest created first. | `marketplace.kind.program` = "Program"<br>`marketplace.kind.event` = "Esemény"<br>`marketplace.kind.announcement` = "Közlemény"<br>+ the four `compose.state.*` labels above; the " · " is hard-coded | 5 rows, see Frame 1 |
| Bottom bar | live | Coach: 6 tabs, "Edző" lit. | `nav.home` = "Kezdőlap" · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.coach` = "Edző" · `nav.profile` = "Profil" | Edző active |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Profile sheet | live | Opens from the status control. Title + close. Two actions: go to the profile editor (`/compose/profile`); publish / unpublish the profile (code: this second one is the sheet's primary button, busy state while pending; no confirmation step). The sheet stays open after the toggle. | title `nav.profile` = "Profil"<br>`compose.editProfile` = "Profil szerkesztése"<br>`compose.unpublishProfile` = "Profil levétele"<br>`compose.publishProfile` = "Profil közzététele"<br>close: `common.close` = "Bezárás" (accessible name) | Profil · Profil szerkesztése · Profil levétele |
| "Went dark" line (in the sheet) | live | After an unpublish the server reports how many live posts left the marketplace with the profile; shown under the buttons when > 0. | `compose.wentDark` = "{{count}} poszt lekerült a piactérről." | 4 poszt lekerült a piactérről. |
| Refusal line (in the sheet) | live (copy bug in the running app — see next cell) | Danger-coloured caption when "Profil közzététele" is refused with a NAMED reason. Only two reasons can reach it: guidelines not accepted, and account younger than 24 h. LIVE BUG (checked against the shipped i18next): the sheet passes no values to these two strings, so the running app prints the placeholders raw — "… ({{version}})." / "… {{when}} után tudsz.". Draw the sentence with its value filled in; never draw a raw placeholder. Every other failure (disabled account, wrong role, no network) shows NOTHING in the sheet — those answers carry no reason, the button just stops being busy. | `compose.reason.needs_guidelines` = "Előbb fogadd el a jelenlegi irányelveket ({{version}})."<br>`compose.reason.too_new` = "A fiók még túl új. Publikálni {{when}} után tudsz."<br>code fallback for a reason without a string: `compose.reason.generic` = "A művelet nem hajtható végre." (no profile-publish reason lacks one today) | Előbb fogadd el a jelenlegi irányelveket (1.0). |
| Gate (at most one, between the title and the inventory) | live | The FIRST unmet publishing precondition, in the server's order: guidelines → account age → profile. Rendered from server flags, never re-derived. See States for each. Code puts a small line glyph before each gate title (shield-check / clock / user-plus) — old-look decoration, safe to drop. | see States | — |
| Kind glyph on a row | live | Today a line icon per kind (calendar = Program, microphone = Esemény, megaphone = Közlemény; unknown kind = document). Decorative; the caption carries the kind in words. | — | — |
| Section glyph next to "Bejegyzések" | live (old look) | A document glyph tile. Pure decoration of the old design — safe to drop. | — | — |

## States

| State | When | What shows (copy) |
|---|---|---|
| Loading — whole screen | context request pending | Skeleton in the final geometry: identity row, title line, inventory block, two rows. No spinner. |
| Loading — list only | list request pending (also after changing the filter) | Three row skeletons under the filter; header and inventory stay. |
| Error | context request failed — also what a MEMBER sees (403) | `compose.unavailableTitle` = "A pult most nem érhető el" · `compose.unavailableBody` = "Próbáld újra egy pillanat múlva." Document glyph. NO retry button, no back link. |
| Default — profile public | all preconditions met | Identity row with "Élő"; no gate; "Új bejegyzés" is the primary. |
| Profile hidden | profile exists, not published | Status control reads "Rejtve". No gate, no hint. "Új bejegyzés" stays primary; publishing a post is refused later, in the editor (`compose.reason.profile_not_published` = "Előbb tedd közzé a profilodat."). |
| Gate 1 — guidelines | current guidelines version not accepted | `compose.guidelinesTitle` = "Fogadd el a közösségi irányelveket" · `compose.guidelinesBody` = "Publikálás előtt el kell fogadnod a jelenleg érvényes irányelveket." · button `compose.guidelinesAccept` = "Elfogadom ({{version}})" → "Elfogadom (1.0)" (busy while saving). The guidelines TEXT itself has no Hungarian string and no screen (server key `public.guidelines.v1` is missing from hu.json; the body above is the fallback). |
| Gate 2 — account too new | account younger than 24 h | `compose.tooNewTitle` = "A fiók még túl új" · `compose.tooNewBody` = "Publikálni {{when}} után tudsz." → "Publikálni 2026. 10. 10. 10:12:00 után tudsz." (locale timestamp WITH seconds). No button. |
| Gate 3 — no profile | no public profile yet | `compose.noProfileTitle` = "Még nincs nyilvános profilod" · `compose.noProfileBody` = "A posztjaid egy profilon ülnek. Ez az első lépés." · button `compose.createProfile` = "Profil létrehozása" → `/compose/profile`. Identity row absent. "Új bejegyzés" stays on screen as a secondary, but the server refuses to create a post without a profile (`compose.reason.profile_required` = "Előbb hozz létre egy nyilvános profilt."), so the profile really is the first step. |
| Takedown | a moderator removed the profile | Danger notice, NO button: `compose.removedTitle` = "A profilodat levették" · `compose.removedBody` = "Egy moderátor eltávolította a nyilvános profilodat. A posztjaid nem látszanak a piactéren." Identity row absent; "Új bejegyzés" is a secondary. Replaces any other gate. |
| Empty desk | filter "Mind", no posts | Total reads 0, all four counts 0. `compose.noPostsTitle` = "Még nincs bejegyzésed" · `compose.noPostsBody` = "Írj egy piszkozatot — publikálni csak akkor fog, ha te mondod." No button in the empty state (the action is "Új bejegyzés" above). |
| Filter matches nothing | any filter except "Mind" returns 0 rows | `compose.noPostsInFilterTitle` = "Ebben a nézetben nincs bejegyzés" · `compose.noPostsInFilterBody` = "A többi bejegyzésed megvan — csak ez a szűrő nem mutatja őket." · secondary button `compose.showAllPosts` = "Összes mutatása" (resets to "Mind"). The inventory above keeps the real total. |
| Filter expanded | after "Több" | Five options: Mind · Piszkozat · Élő · Levett · Eltávolított. |
| Quota used up | 10 of 10 published in the last 24 h | "Ma még 0 publikálás a 10-ból." Meter full, warning colour. Nothing else changes. |
| Sheet — after unpublish | toggle succeeded | Button flips to "Profil közzététele"; "4 poszt lekerült a piactérről."; the control behind reads "Rejtve"; the four live rows keep their "Élő" state (the posts are still published — they are only dark while the profile is hidden). |
| Offline | no connection | Shell strip above everything: `offline.title` = "Nincs internetkapcsolat". Cached content stays. An action tried offline (accept guidelines, publish / unpublish the profile) fails SILENTLY — the busy state ends and this screen draws no line and no toast for it. Nothing queues here. |
| Role variants | coach vs admin | Identical screen; admin has a 7-tab bar (… Edző · `nav.admin` = "Admin" · Profil). |

## Frames to draw

**Frame 1 — "Pult · alap" (returning coach, profile public; Friday 9 October 2026).** Top to bottom:
1. Status bar 9:41. No offline strip.
2. Identity row: small monogram "KP" · "Kovács Péter" · "@kovacs-peter" · at the right edge the status control "Élő" (must read as tappable: it opens Frame 2).
3. Title: "Piactéri pult".
4. Inventory: the figure "5" with the unit "bejegyzés"; the split "Élő 4" · "Piszkozat 1" · "Levett 0" · "Eltávolított 0" (four entries, zeros shown).
5. Quota: "Ma még 9 publikálás a 10-ból." + meter, one tenth filled.
6. Section label "Bejegyzések" with the action "Új bejegyzés" (plus glyph) — the screen's one lime pill.
7. Filter: "Mind" (selected, trailing check) · "Piszkozat" · "Élő" · "Több".
8. Rows, newest first (title / caption):
   - Online edzésterv – 12 hét, heti visszajelzéssel / Program · Élő
   - Téli tömegelő – piszkozat / Program · Piszkozat
   - Novembertől két új időpont / Közlemény · Élő
   - Guggolás-technika műhely – október 30. / Esemény · Élő
   - Őszi erőblokk – 8 hetes csoportos program / Program · Élő
   The fold falls inside the list; the bottom fade cuts a row, never a lone label.
9. Tab bar, six tabs: Kezdőlap · Edzés · Étkezés · Haladás · **Edző** (lit) · Profil.

**Frame 2 — "Pult · profil lap" (the sheet opened from "Élő").** Frame 1 under the scrim. Sheet, top to bottom: title "Profil" + close glyph · "Profil szerkesztése" · "Profil levétele". Optional second artboard of the same sheet after the tap: "Profil szerkesztése" · "Profil közzététele" · status line "4 poszt lekerült a piactérről." (and the control behind now reads "Rejtve").

**Frame 3 — "Pult · első lépés" (a coach who has never published; first gate).** Top to bottom:
1. Status bar. NO identity row (there is no profile yet).
2. Title: "Piactéri pult".
3. Gate: "Fogadd el a közösségi irányelveket" / "Publikálás előtt el kell fogadnod a jelenleg érvényes irányelveket." / button "Elfogadom (1.0)" — here THIS is the lime pill.
4. Inventory: "0" "bejegyzés" · "Élő 0" · "Piszkozat 0" · "Levett 0" · "Eltávolított 0".
5. Quota: "Ma még 10 publikálás a 10-ból." + empty meter.
6. "Bejegyzések" with "Új bejegyzés" as a quiet secondary (not filled).
7. Filter: "Mind" (selected) · "Piszkozat" · "Élő" · "Több".
8. Empty state: "Még nincs bejegyzésed" / "Írj egy piszkozatot — publikálni csak akkor fog, ha te mondod."
9. Tab bar as Frame 1.
The other two rungs reuse this frame with the gate swapped: account age ("A fiók még túl új" / "Publikálni 2026. 10. 10. 10:12:00 után tudsz.", no button, no lime pill on the screen) and no profile ("Még nincs nyilvános profilod" / "A posztjaid egy profilon ülnek. Ez az első lépés." / "Profil létrehozása").

## Images

| Could help | Why / constraint |
|---|---|
| One edgeless graphite render or low-key B/W still beside the inventory figure (the Home "2/4 + fist" recipe): e.g. a megaphone, a stack of printed cards, a pin-board clip — an object that says "noticeboard" | Pure atmosphere; the figure "5" stays the subject. Same Pulse Studio family as the tab icons; no lime inside the image. None of these objects is on the asset shelf (checked `assets/pulse/manifest-app.json` on 2026-10-10: its heroes are assigned elsewhere — `hero-stopwatch` to the coach dashboard, `hero-plates` to the plan screens, `hero-grip` to Home; no hero is assigned to `/compose`) — the screen must also work with no image at all. |
| The sixth tab icon for "Edző" in the 3D tab-icon family: a whistle, steel + lime-lit pair | Needed for every coach screen. It now EXISTS and is uploaded: manifest slots `tab2-coach` (idle) and `tab2-coach-active` (lit — the manifest names `/compose` among its screens) in `assets/pulse/manifest-app.json`, files `assets/pulse/app/tab2-coach.png` / `tab2-coach-active.png`; the admin's seventh, a shield: `tab2-admin` / `tab2-admin-active`. Paint by the recorded hash; never substitute a line icon. |
| Small monogram "KP" | Coaches and members have no photo — a monogram is the only identity mark. The textured fill of the Profile monogram (`monogram-light`) can be reused small. |

Must NOT be shown as if it existed: a coach avatar / profile photo (the shelf has a generated `portrait-coach` — do NOT use it as Kovács Péter's avatar on this screen: the product stores no coach picture anywhere, even the public pages draw initials); cover thumbnails on the post rows (the list API returns no image for a post — covers exist, but only inside the editor and on the public pages; the manifest's `use` line for the `cover-gym` / `cover-bar` / `cover-track` stills mentions the desk — ignore that here, a desk row carries no picture); view, reach, click, like or follower numbers; a verified badge on this screen (it exists only on the PUBLIC pages — feed rows, post page, coach profile).

## Do not invent

- Statistics of any kind: views, impressions, reach, applicants, bookings, revenue, follower count, trend chart — none exist.
- Delete / archive / duplicate a post, bulk select, swipe actions on rows (the old mockup drew a mid-swipe card; not in code). Removing a post from public view is "Levétel", and it lives in the post editor.
- A date, an excerpt, a price, a city or a cover thumbnail on a row; a sort control; a search field for own posts; pinning or reordering posts.
- "Load more" / pagination / a "show all 18" link — the screen shows one page and ignores the cursor.
- Count badges on the filter options; a retry button or pull-to-refresh on the error state.
- A "view my public profile" or "open on the marketplace" link, share sheet, copy-link or QR — no link from here to `/m/c/:handle` exists.
- A guidelines reader (document, scroll-to-accept, checkbox), an appeal / contact-moderator button on the takedown notice, a countdown on the account-age gate.
- A confirmation dialog before "Profil levétele"; a toast on this screen (publish / unpublish answer inside the sheet).
- Scheduled publishing, a quota upgrade, a paywall, a subscription or billing prompt.
- A "Publikálás" or "Piactér" tab, a floating + button, a top app bar with actions.
- An entry row to this screen on the coach dashboard or in Profil — it would be a sensible fix, but it is not built and is the owner's decision.

## Notes for the designer

- **The donut is the old look, not the requirement.** What must survive: one total + four named counts (zeros included) + the quota line with its meter, all above the list. In Pulse this is naturally the screen's hero numeral ("5") with a four-part segment bar or a ledger of four figures — never an enclosed card.
- **"Élő" and colour.** Code uses the success family for the status control and the live rows, and the accent for the live arc. The Pulse grammar says live / selected = lit (accent) and success = saved / done. Pick one treatment for "Élő" and use it in all three places; no state may rest on hue alone (the row also needs the word, which it has).
- **The status control must look tappable without a capsule** (Open Field): it is the only path to the profile editor and to publish / unpublish. Word + small trailing glyph on the right edge, 44 pt target.
- **Filter in Open Field:** five short words at most; selection = text-1 + underline (the brief's neutral selection) with the trailing check the code already draws. It is not the screen's subject — keep it quiet.
- **Two filled buttons can meet:** with Frame 2 open the sheet's publish / unpublish button is a primary in code while "Új bejegyzés" sits under the scrim. Consider drawing "Profil levétele" as a secondary — it hides every live post at once (4 here) and has no confirmation; it is fully reversible with "Profil közzététele".
- **12-post ceiling (product gap):** the list request returns at most 12 posts, the screen never asks for the next page, and the total is counted from that page — a coach with 18 posts would see "12". Keep sample totals ≤ 12 and do not design a number larger than that.
- **Strings that will not fit one line at 354 pt:** "Online edzésterv – 12 hét, heti visszajelzéssel" (47 characters; titles can be up to 140) — code truncates to one line with an ellipsis; "A többi bejegyzésed megvan — csak ez a szűrő nem mutatja őket." and the takedown body wrap to two or three lines; "Fogadd el a közösségi irányelveket" is long for a display-face heading (set it in the UI face or allow two lines). "Eltávolított" is the longest of the four split labels — four entries do not fit one row with their counts at 13 pt + generous gaps; plan two rows or a 2 × 2 ledger.
- The quota suffix "-ból" is written into the string and only reads correctly for 10; do not change the max in mockups.
- The sheet's title is the word "Profil" — the same word as the last tab. It means the PUBLIC profile here.
- `compose.noPostsBody` contains an awkward phrase ("publikálni csak akkor fog"); quote it verbatim, do not fix it in the mockup.
- Sample data: profile, handle, post titles, kinds and states are the demo seed's (coach account `coach@tracker.local`, display name "Kovács Péter", handle `kovacs-peter`, 4 live posts + 1 draft). Two seed titles are adapted to the reference moment exactly as the public-feed inventory (`marketplace.md`) does: seed "Guggolás-technika műhely – szeptember 14." → "… – október 30.", seed "Szeptembertől két új időpont" → "Novembertől két új időpont". "9 of 10 left" assumes "Online edzésterv…" went live on Thursday evening (the seed publishes it exactly one day back, which is already outside the rolling window — the untouched running demo reads "Ma még 10 publikálás a 10-ból." with an empty meter; the 9 is an illustration chosen so the meter has a fill).
- Overlays, errors and skeletons follow the brief's rules (sheet = surface-2 with a line edge over a 50 % scrim; error = one danger text line where it was raised; skeleton blocks, never a spinner).

---
type: screen-inventory
title: Admin áttekintés — screen inventory
updated: 2026-10-11
route: "/admin"
tags: [ux, screen, inventory, pulse]
---

# Admin áttekintés — `/admin` · admin only (member and coach get a forbidden page) · "Admin" bottom tab, Profil → `settings.openAdmin` = "Admin felület megnyitása", desktop command palette · lit tab: Admin (6th of 7)

Sources read: `frontend/src/features/admin/AdminPage.tsx`, `AdminShell.tsx`, `ModerationQueue.tsx`, `UserSearch.tsx`, `MarketplaceQueue.tsx`, `AdminMetrics.tsx`, `app/navTabs.ts`, `app/router.tsx`, `backend/src/admin/routes.js`, `backend/src/public/moderation.js`, `backend/scripts/seed-demo.mjs`, brain spec `55-Screens/admin-attekintes.md`. Copy is quoted in the form key = "value", every pair taken from `frontend/src/i18n/hu.json` and machine-checked against it. Status: **live** = rendered on the route · **planned** = spec / API only · **cut**.

## Purpose

The admin lands here for two things: a ten-second look at who is on the platform (users by role, exercise and media counts), then clearing one of three work areas shown one at a time — exercise submissions (opens by default), the account list, marketplace reports. The page is convenience only; every endpoint re-checks the role in the database.

**The ONE primary action:** `admin.approve` = "Jóváhagyás" — and it exists only inside an opened submission. With nothing open, the screen has no primary action at all (that is deliberate: approving publishes an exercise to every user, so it cannot be done from a list row).

## Elements

### MUST (all live)

| # | Element | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| 1 | Screen header | Eyebrow + h1. No back control, no bell, no signed-in identity anywhere on this screen | `admin.eyebrow` = "Adminisztráció" (rendered upper-case) · `admin.title` = "Áttekintés" | — |
| 2 | Link to the style studio | Palette glyph + text link on the h1's line; a real link to `/admin/styles` | `admin.styleStudio` = "Stílus stúdió" | — |
| 3 | User figure (the screen's anchor) | Total user count (counts up from 0) with a singular unit caption; the total is split into three disjoint role groups that sum to it exactly; a legend names each group with its count. Not tappable. (Today's code draws it as a three-arc ring with the numeral and caption in the hole and the legend under it — the shape is free, the three parts and the total are not) | `admin.unit.user` = "Felhasználó" · `admin.legend.members` = "Tagok" · `admin.legend.coaches` = "Edzők" · `admin.legend.admins` = "Adminok" (screen-reader name only: `admin.users` = "Felhasználók") | **19** Felhasználó · Tagok **15** · Edzők **3** · Adminok **1** |
| 4 | Two summary figures | Exercise count and media-file count, each a number + singular caption. Not tappable | `admin.unit.exercise` = "Gyakorlat" · `admin.unit.media` = "Médiafájl" | **1656** Gyakorlat · **3** Médiafájl |
| 5 | Section switch (3 options, single choice, swaps the panel below in place) | Fiókok · Moderáció · Piactér. Only "Moderáció" can carry a count, and only when it is above 0. Default: Moderáció | `admin.section.accounts` = "Fiókok" · `admin.section.moderation` = "Moderáció" · `admin.section.marketplace` = "Piactér" (group name, not visible: `admin.sections` = "Szakaszok") | Moderáció **3** |
| 6 | Moderation panel header | Heading, waiting count on the line under it (hidden at 0), refresh icon button (spins while refetching) | `admin.moderation` = "Moderációs sor" · `admin.pendingCount` = "{{count}} várakozik" · button name `admin.refreshQueue` = "Sor frissítése" | "3 várakozik" |
| 7 | Queue row (oldest first, max 50, no paging) | Exercise name · age · submitter's e-mail · media line (count, or the no-media line). Tap opens the review inside the row; tap again closes it. No thumbnail in the row | `admin.mediaCount` = "{{count}} média" · `admin.noMedia` = "Nincs feltöltött média" · age has no key (browser `Intl`, e.g. "3 nappal ezelőtt") | see Frame 1 |
| 8 | "Open one first" hint (under the list while nothing is open) | Explains why rows have no approve button | `admin.reviewPickTitle` = "Válassz egy beküldést" · `admin.reviewPickBody` = "A jóváhagyás megosztja a gyakorlatot a teljes könyvtárban, ezért előbb nyisd meg és nézd át." | — |
| 9 | Review (the opened row) | Name + submitter e-mail (repeated) · submitted images at judging size · description · numbered steps, or a warning line when there are none · target-muscle chips (primary vs secondary) · equipment chips · the decision | `library.howTo` = "Végrehajtás" · `library.muscle` = "Izomcsoport" · `library.equipment` = "Eszköz" · `admin.noInstructions` = "Nincs megadva végrehajtási leírás" · image alt `admin.mediaAlt` = "{{name}} — beküldött média" | see Frame 2 |
| 10 | Decision | Approve (primary, check glyph) and Reject (quiet, x glyph). Approve acts at once — no confirmation. Reject first asks for a reason | `admin.approve` = "Jóváhagyás" · `admin.reject` = "Elutasítás" | — |
| 11 | Reject form (replaces the two buttons) | One text field + hint; the destructive button is disabled until the reason has text (server max 500 characters); cancel returns to the two buttons | `admin.reason` = "Indoklás" · `admin.reasonHint` = "A beküldő elolvassa, a saját gyakorlatánál jelenik meg." · `admin.reject` = "Elutasítás" · `common.cancel` = "Mégse" | "A leírás nem elég részletes, és nincs kép a kiindulási helyzetről." (seed's real rejection text) |
| 12 | Liveness footer (last line of the page, below the fold) | Active sessions and audit events of the last 24 h | `admin.footer` = "{{sessions}} aktív munkamenet · {{events}} naplóesemény az elmúlt 24 órában" | "3 aktív munkamenet · 14 naplóesemény az elmúlt 24 órában" (illustrative) |
| 13 | Bottom bar, 7 tabs | Kezdőlap · Edzés · Étkezés · Haladás · Edző · Admin · Profil; Admin lit | `nav.home` = "Kezdőlap" · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.coach` = "Edző" · `nav.admin` = "Admin" · `nav.profile` = "Profil" | — |

### SHOULD (live, behind the other two sections)

| # | Element | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| A1 | Fiókok: heading + search | Search by part of an e-mail (300 ms debounce; the server accepts only unaccented letters, digits, space and `@ . - + _`, max 80 — an accented letter such as "á" is refused and lands in the no-match state) | `adminUsers.title` = "Fiókok" · `adminUsers.search` = "Keresés e-mailben" | empty field |
| A2 | Fiókok: account list — READ-ONLY, rows are not tappable | Four values per account: e-mail (+ flags) · role · active-client count (a dash for members) · registration date. Sortable by e-mail, role and date (tap flips direction; default date, newest first). An admin's role carries a small user-cog glyph | `adminUsers.col.email` = "E-mail" · `adminUsers.col.role` = "Szerepkör" · `adminUsers.col.clients` = "Kliensek" · `adminUsers.col.created` = "Regisztrált" · `adminUsers.role.user` = "Felhasználó" · `adminUsers.role.coach` = "Edző" · `adminUsers.role.admin` = "Admin" | see Frame 3 |
| A3 | Fiókok: account flags | Beside the e-mail: disabled account (danger) · must change credentials (warning; a coach-created account not yet handed over) | `adminUsers.disabled` = "letiltva" · `adminUsers.mustChange` = "jelszócsere" (both rendered upper-case) | lukacs.adam@pelda.hu · JELSZÓCSERE |
| A4 | Fiókok: page-cap note | Shown under the list when more than 24 accounts match; there is no "next page" | `adminUsers.moreMatches` = "Több találat van, mint amennyi elfér egy oldalon — szűkíts a kereséssel." | not shown at 19 users |
| P1 | Piactér: heading + status filter (4, single choice) | Default "Nyitott" | `admin.marketplace.title` = "Piactéri bejelentések" · `admin.marketplace.status.open` = "Nyitott" · `admin.marketplace.status.triaged` = "Vizsgált" · `admin.marketplace.status.upheld` = "Helybenhagyott" · `admin.marketplace.status.rejected` = "Elutasított" | 4 open · 0 · 1 · 1 (seed) |
| P2 | Piactér: report (most severe first, then oldest; max 25) | Reason tag · number of DIFFERENT reporters (never who) · date-time · subject (post title, or "@handle · name" for a profile) · link to the live post (posts only, new tab) · the reporter's note · the text as it was when reported | `admin.marketplace.reporters` = "{{count}} különböző bejelentő" · `admin.marketplace.openLive` = "Élő oldal megnyitása" · `admin.marketplace.snapshot` = "A szöveg a bejelentés pillanatában" · `admin.marketplace.snapshotTruncated` = "A szöveg hosszabb volt; a másolat le van vágva." | seed order: ① "Megszemélyesítés" · 1 különböző bejelentő · @feher-tamas · Fehér Tamás · "Szerintem más edző fotóit használja." ② "Átverés" · Félmaraton 12 hét alatt – kezdőknek · "Az ár nem szerepel sehol, de fizetést kér üzenetben." ③ "Kéretlen tartalom" · Őszi erőblokk – 8 hetes csoportos program · "Szerintem ez csak reklám, nincs benne konkrétum." |
| P3 | Piactér: reason tags (10) | One per report | `admin.marketplace.reason.illegal` = "Jogellenes" · `admin.marketplace.reason.sexual` = "Szexuális tartalom" · `admin.marketplace.reason.violence` = "Erőszak" · `admin.marketplace.reason.scam` = "Átverés" · `admin.marketplace.reason.impersonation` = "Megszemélyesítés" · `admin.marketplace.reason.dangerous_advice` = "Veszélyes tanács" · `admin.marketplace.reason.abuse` = "Bántalmazás" · `admin.marketplace.reason.ip_infringement` = "Szerzői jog" · `admin.marketplace.reason.spam` = "Kéretlen tartalom" · `admin.marketplace.reason.other` = "Egyéb" | — |
| P4 | Piactér: decide | Open and "Vizsgált" reports carry one button that opens a form in place: removal reason (required for removal, max 2000) + hint, internal note (optional), then three actions: uphold-and-remove (disabled until a reason is typed), reject the report, cancel; one helper line while the reason is empty | `admin.marketplace.decide` = "Döntés" · `admin.marketplace.removalReason` = "Eltávolítás indoka" · `admin.marketplace.removalReasonHint` = "Ez az indok az audit-naplóba kerül. A szerző nem látja." · `admin.marketplace.resolutionNote` = "Belső megjegyzés" · `admin.marketplace.upholdAndRemove` = "Helybenhagyás és eltávolítás" · `admin.marketplace.reject` = "Elutasítás" · `admin.marketplace.cancel` = "Mégse" · `admin.marketplace.reasonRequired` = "Eltávolításhoz indok kell." | seed's closing notes: "Eltávolítva, a szerző értesítve." / "Nem sérti a szabályzatot." |

Not on the route: `AdminMetrics.tsx` ("Mérőszámok": four totals + four 30-day trend charts) is in the folder but nothing imports it — **planned** ("moves behind its own entry", no entry exists). `admin.section.overview`, `admin.exercises`, `admin.media` and all `adminMetrics.*` strings are unused on this screen. The translations figure and "new in 7 days" are **cut** (the API still returns them).

## States

- **Forbidden (member or coach on `/admin`)** — the whole page is one centred message with a shield mark, as the h1, no action: `admin.forbiddenTitle` = "Nincs jogosultságod" · `admin.forbiddenBody` = "Ez az oldal csak adminisztrátoroknak érhető el." Their 5- or 6-tab bar shows with no tab lit.
- **Figures loading** — skeleton for the user figure and for the two summary figures; the section switch is already there (no count on Moderáció); footer absent.
- **Figures failed** — the user figure, the two summary figures, the Moderáció count and the footer are simply absent. No message, no retry (gap).
- **Moderation · loading** — three row-shaped skeletons.
- **Moderation · empty** — check mark + `admin.queueEmptyTitle` = "Nincs mit moderálni" · `admin.queueEmptyBody` = "Minden beküldött gyakorlatot elbíráltál." No count under the heading, no count on the switch. A failed queue request also lands here (gap).
- **Moderation · nothing open** — list + element 8 under it.
- **Moderation · review loading** — the row is open and selected, a block skeleton stands in for the review.
- **Moderation · review** — element 9 + 10. A submission with no steps shows the warning line; with no image, the `admin.noMedia` line; description, muscles and equipment sections are each omitted when empty.
- **Moderation · rejecting** — element 11.
- **Moderation · deciding** — the pressed button is busy (its label gives way to a small spinner, width kept, not pressable); on success the row leaves the list, nothing stays open, counts refresh. On failure nothing is shown (gap).
- **Moderation · stale** (someone else decided it meanwhile) — x mark + `admin.reviewGoneTitle` = "Ez a beküldés már nincs a sorban" · `admin.reviewGoneBody` = "Időközben valaki döntött róla. Frissítsd a listát." The refresh button in the panel header is the way out.
- **Fiókok · loading** one block skeleton · **no match** (also: request failed, or a character the server refuses) search mark + `adminUsers.noneTitle` = "Nincs találat" · `adminUsers.noneBody` = "Próbáld meg az e-mail cím egy részletével." · **capped** element A4.
- **Piactér · loading** two block skeletons · **empty** (per status; also on failure) alert-shield mark + `admin.marketplace.emptyTitle` = "Nincs elintézendő bejelentés" · `admin.marketplace.emptyBody` = "Ha valaki bejelent egy bejegyzést vagy profilt, itt fog megjelenni." · **deciding** form open, buttons busy · **closed reports** (Helybenhagyott / Elutasított) show tag, count, date, subject, the live-post link and the note only — no snapshot, no decide button.
- **Offline** — nothing of its own: the shell strip `offline.title` = "Nincs internetkapcsolat"; lists keep their last data, decisions fail silently.
- **Desktop (≥ 1024 px)** — the switch becomes a left rail and moderation becomes list + review side by side. Not needed for phone frames.

## Frames to draw

Canvas 402 × 874, admin role, 7-tab bar with Admin lit. No person is shown on this screen, so "who is signed in" only decides the tab count.

**1. `Admin · Áttekintés — moderation open, 3 waiting`** (the returning admin on the demo data)
1. Eyebrow "ADMINISZTRÁCIÓ" · h1 "Áttekintés" · on the same line, right: palette glyph + "Stílus stúdió"
2. User figure: **19** · caption "Felhasználó" · the three-part split with legend "Tagok 15" · "Edzők 3" · "Adminok 1"
3. Two figures side by side: **1656** "Gyakorlat" · **3** "Médiafájl"
4. Section switch: "Fiókok" · "Moderáció" + count **3** (selected) · "Piactér"
5. Panel header: "Moderációs sor" / "3 várakozik" · refresh glyph on the right
6. Row — "Demó – Kötélhúzás ülve, széles fogás" · "8 nappal ezelőtt" / "kovacs.peter@pelda.hu" · film glyph "1 média"
7. Row — "Demó – Bolgár kitörés" · "3 nappal ezelőtt" / "kovacs.peter@pelda.hu" · "1 média"
8. Row — "Demó – Csípőemelés egy lábon" · "1 nappal ezelőtt" / "feher.tamas@pelda.hu" · "1 média" (may be cut by the bottom fade)
9. Below the fold: "Válassz egy beküldést" / "A jóváhagyás megosztja a gyakorlatot a teljes könyvtárban, ezért előbb nyisd meg és nézd át." · then the footer "3 aktív munkamenet · 14 naplóesemény az elmúlt 24 órában"
10. Tab bar: Kezdőlap · Edzés · Étkezés · Haladás · Edző · **Admin** · Profil

**2. `Admin · Áttekintés — submission open for review`** (scrolled: the section switch sits just under the status bar; this is the only frame with the lime pill)
1. Section switch (Moderáció + 3 selected) · panel header "Moderációs sor" / "3 várakozik" · refresh
2. Row, closed — "Demó – Kötélhúzás ülve, széles fogás" · "8 nappal ezelőtt" / "kovacs.peter@pelda.hu" · "1 média"
3. Row, OPEN and marked as the selection for its whole height — "Demó – Bolgár kitörés" · "3 nappal ezelőtt" / "kovacs.peter@pelda.hu" · "1 média"; then inside it:
   - "Demó – Bolgár kitörés" / "kovacs.peter@pelda.hu" (the code repeats both; may be dropped on a phone)
   - one submitted image, 16 : 9 (320 × 180 source)
   - "Egylábas guggolás, a hátsó láb padra emelve."
   - "VÉGREHAJTÁS" — 1. "Állj a paddal háttal, egy lépés távolságra, és tedd a hátsó lábfejed a padra." 2. "Ereszkedj le, amíg az első comb nagyjából párhuzamos a talajjal, a törzs maradjon egyenes." 3. "Nyomd magad vissza az első sarkadon keresztül. A térd a lábfej vonalában maradjon."
   - "IZOMCSOPORT" — "Négyfejű combizom" (primary = lit) · "Farizom" (secondary)
   - "ESZKÖZ" — "Kézisúlyzó" · "Pad"
   - a rule, then two equal actions: [✓ Jóváhagyás] (the lime pill) · "✕ Elutasítás" (quiet)
4. Row, closed, cut by the fade — "Demó – Csípőemelés egy lábon" · "1 nappal ezelőtt"
5. Tab bar, Admin lit
- Variant worth a small second artboard: the two actions replaced by "Indoklás" (typed: "A leírás nem elég részletes, és nincs kép a kiindulási helyzetről.") · hint "A beküldő elolvassa, a saját gyakorlatánál jelenik meg." · [Elutasítás] in danger · "Mégse".

**3. `Admin · Áttekintés — Fiókok`** (scrolled like frame 2; no lime pill on this frame)
1. Section switch: "Fiókok" (selected) · "Moderáció" + 3 · "Piactér"
2. Heading "Fiókok" · search field labelled "Keresés e-mailben" (empty)
3. Column labels: "E-MAIL" (sortable) · "SZEREPKÖR" (sortable) · "KLIENSEK" · "REGISZTRÁLT" (sorted, newest first)
4. Rows (e-mail · role · clients · registered):
   - lukacs.adam@pelda.hu + "JELSZÓCSERE" · Felhasználó · — · 2026. 08. 28.
   - kiss.anna@pelda.hu · Felhasználó · — · 2026. 08. 14.
   - takacs.daniel@pelda.hu · Felhasználó · — · 2026. 07. 10.
   - molnar.zsolt@pelda.hu + "LETILTVA" · Felhasználó · — · 2026. 06. 22. (flag illustrative — the seed has no disabled account)
   - feher.tamas@pelda.hu · Edző · 0 · 2026. 06. 03.
   - toth.lilla@pelda.hu · Felhasználó · — · 2026. 05. 17.
   - szilagyi.reka@pelda.hu · Edző · 0 · 2026. 03. 12.
   - kovacs.peter@pelda.hu · user-cog glyph "Admin" · 6 · 2026. 01. 15. (cut by the fade)
5. Tab bar, Admin lit

## Images

- **Could help:** one graphite 3D object beside the user numeral, in the same role the fist photograph plays beside "2/4" on Home (a shield, i.e. the Admin tab's object at hero size, glowing out of the black). The role split reads naturally in the approved week-bar grammar (three proportional segments + legend) — no chart imagery needed.
- **Needed and missing:** the 7-tab bar needs two more lime-lit 3D tab icons in the existing family — "Edző" and "Admin". Only five exist (home, training, nutrition, progress, profile).
- **Submitted media in the review is user content**, not app art: a coach's own photo of the movement. One low-key black-and-white still (rear-foot-elevated split squat with dumbbells, bench visible) is honest for Frame 2 — framed as an upload inside the review, never edgeless hero art. The seed's actual file is a blank 320 × 180 placeholder.
- **Must NOT be shown as if it existed:** thumbnails in queue rows (rows carry a count only) · video playback (the review renders still images only, although the row glyph is a film strip) · profile photos or monograms in the account list (e-mail only — display names are not even returned) · cover images or avatars on marketplace reports (text only) · any exercise picture outside a submission (the 1652-exercise catalogue has zero media; in the demo data the "3" in "Médiafájl" is exactly the three submission uploads).

## Do not invent

- Role change, disable / enable account, coin adjustment, the platform coin ledger and coin audit views, "remove without a report" — **API only**, no control anywhere. No "restore removed content" control either. The account list has no row action, no detail page, no role / state filter, no pagination.
- DAU / MAU, trend charts, deltas, "new this week", translation counts, storage size — metrics view is **planned** (unmounted), the rest **cut**.
- Approve / reject from the list row, bulk approve, approve-with-edits, an "approved" or "rejected" history tab, undo after a decision, a confirmation dialog before approving.
- Reporter names or avatars, a severity badge, a "mark as triaged" action (the "Vizsgált" filter exists but nothing in the UI puts a report there), a count on the "Piactér" or "Fiókok" switch options.
- A queue for reported chat messages (reporting itself is live — `chat.report` = "Jelentés" in the coach chat — and the reports are stored, but no admin endpoint or screen lists them), an audit-log viewer, backups, server health, feature flags, announcements, a notification bell on this screen, CSV export.
- A coach-side "submit exercise" screen or a public "report" button as existing features: both queues are fed by API only today (see notes).
- Success toasts or celebrations after a decision — the row just leaves the list.

## Notes for the designer

- **Reality check on "most often":** no screen in the product can submit an exercise or file a marketplace report yet (both are API-only), so on a real install both queues are empty and the default view is the empty state "Nincs mit moderálni". Frame 1 shows the demo seed (3 submissions, 4 open reports) because that is what the owner's demo database shows and what exercises the design.
- **Sample provenance.** Preferred over the brain spec's invented numbers (1 248 / 37 / 862 / 391 / 7): 19 users = `seed-dev-users` (3) + `seed-demo` (16) → 15 members, 3 coaches, 1 admin; 1656 exercises = the 1652 catalogue + 4 demo custom rows; 3 media = one upload per pending submission; the three queue rows, their steps, muscles, equipment and the report notes are the seed's own Hungarian text. E-mails are moved to the shared fictional `@pelda.hu` set (seed: `coach@tracker.local` — whose seeded display name is "Kovács Péter" — and `demo.coach.feher.tamas@tracker.local`). In the seed the admin is a separate account (`admin@tracker.local`, 0 clients) and the coach has 12 active clients; the shared sample set folds the two into Kovács Péter (admin role, 6 clients), so two of the three waiting submissions are the signed-in admin's own. That is a legal state (any account can submit through the API, and nothing stops an admin deciding their own submission) and no identity is shown on this screen; if it reads oddly on the frame, give those two rows szilagyi.reka@pelda.hu instead. Footer numbers and registration dates are illustrative. Counts derived from the seed scripts, not measured on a live database.
- **Number format.** Hungarian does not group four digits: "1656", not "1 656". Grouping starts at five digits with a non-breaking space ("12 480"). The user numeral must survive 2 to 6 digits; legend counts sit beside it in the same format.
- **One lime pill.** Only "Jóváhagyás" qualifies. The selected section, the selected row, the count on "Moderáció" and a primary-muscle chip are "lit" states, not filled actions; in the Piactér form "Helybenhagyás és eltávolítás" is that section's primary. The code today also paints the active status filter as a primary button — a selection, not an action.
- **Semantic colours** (keep the app's four, accent is never success): `letiltva` = danger · `jelszócsere` and the "no steps" line = warning · reject-confirm button = danger.
- **Long strings:** "Demó – Kötélhúzás ülve, széles fogás" shares its line with "8 nappal ezelőtt" (the name truncates) · `admin.reviewPickBody` is 92 characters (2 to 3 lines at 354 pt) · the footer wraps to two lines once the numbers grow · "Helybenhagyás és eltávolítás" (28 characters) sits beside two more buttons — stack them · `adminUsers.moreMatches` (2 lines) · seed e-mails reach 38 characters ("demo.coach.szilagyi.reka@tracker.local") · report date-times print with seconds ("2026. 10. 05. 14:05:00", raw locale string).
- **Ages** are browser-generated: "3 nappal ezelőtt", "20 órával ezelőtt", "5 perccel ezelőtt" — longer than the "3 napja" a designer would guess.
- **Registration dates** use the BROWSER's locale, not the app language ("2026. 10. 07." on a Hungarian phone, "10/7/2026" on an English one).
- **The account list is a 640 px, four-column table that scrolls sideways inside its own box on a phone.** A phone-shaped answer (two-line rows: e-mail + flags, then role · clients · date) is welcome as long as the three sort keys stay reachable.
- **7 tabs at 402 pt:** brief §9.2 arithmetic — side inset 8, equal cells of 55.1 pt, icon box 28, labels always shown; the widest label is "Kezdőlap".
- **No back control and no header chrome** on this screen: it is a tab root. The style-studio link is the only way from here to `/admin/styles`.
- **Glyphs in today's code that the tables do not list** (all decoration, none is content — keep, replace or drop): a people / shield-check / globe glyph on the three section options · a shield-check tile before "Moderációs sor" · a dumbbell and an image puck beside the two summary figures · a short vertical bar on the leading edge of every queue row (accent on the open one) · image-off before "Nincs feltöltött média" · shield-off inside the "letiltva" flag · external-link before "Élő oldal megnyitása".
- **Skeletons, never spinners, for loading content**, shaped like what they replace (user figure, two figures, three rows). The only spinners in today's code sit inside a pressed control while its request runs: "Jóváhagyás", the danger "Elutasítás", the Piactér form's "Helybenhagyás és eltávolítás" and "Elutasítás" (both at once), and the refresh button — the label or glyph is swapped for a small spinner and the control keeps its width.
- The section switch does not change the URL; a refresh always returns to "Moderáció".
- The waiting count comes from a different query than the list (it also counts submissions whose author deleted their account, which the list hides), so "3 várakozik" over two rows is possible.

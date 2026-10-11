---
type: screen-inventory
title: Edzői profil szerkesztő — screen inventory
updated: 2026-10-11
route: "/compose/profile"
tags: [ux, screen, inventory, pulse]
---

# Edzői profil szerkesztő — route `/compose/profile` · reached by coach and admin (server gate `requireCoach`) · you get there from the desk (`/compose`): status control → sheet "Profil" → `compose.editProfile` = "Profil szerkesztése", or the no-profile gate's `compose.createProfile` = "Profil létrehozása"; also the desktop command palette entry `nav.composeProfile` = "Nyilvános profil" · bottom tab lit: `nav.coach` = "Edző" (6-tab coach bar, 7-tab admin bar)

Sources read: `features/compose/ProfileEditorPage.tsx`, `HandleField.tsx`, `useCompose.ts`, `useComposeFlow.ts`, `lib/person.ts`, `features/marketplace/usePublic.ts`, `backend/src/public/compose.js`, migrations `021_public_marketplace.sql` / `023_handle_squatting.sql`, `backend/scripts/seed-demo.mjs` §12, `55-Screens/compose-profile.md`. Status words: live = in code and reachable · planned = spec / API only · cut = decided against. "Edzői profil szerkesztő" is this document's name for the screen — it is NOT a UI string; the screen has no static title (see the h1 row).

## Purpose

Create (once) and later correct the public profile every marketplace post hangs off: the name strangers see, a one-line pitch, up to six specialties, a longer bio, the city, the public handle, and whether the profile is public at all. The screen shows the coach as a stranger will see them — the top of it is the person, not a form.
**ONE primary action:** `compose.save` = "Mentés" (edit) / `compose.createProfile` = "Profil létrehozása" (create). A successful save returns to the desk (`/compose`); there is no toast.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Back link | live | → `/compose`. Leaves without asking, even with unsaved edits. | `compose.backToDesk` = "Vissza a pulthoz" | Vissza a pulthoz |
| Monogram (the anchor) | live | Large initials of whatever is in the display-name field, updating as the coach types (two words → two initials; one word → its first two letters; empty → "·"). Not a control: there is no photo and no upload. | no key | KP |
| Heading = the display name (the only h1) | live | Mirrors the name field live. While the field is empty it reads the create label. | fallback `compose.createProfile` = "Profil létrehozása" | Kovács Péter |
| Identity line (edit only) | live | "@handle · city", as the marketplace card shows it. Tapping it opens / closes the identity panel (rename + city). City shows the "no city" label when unset. Plain text when the profile is taken down. Absent on create. | "@" and " · " hard-coded; no city: `marketplace.everywhere` = "Bárhol" | @kovacs-peter · Budapest |
| Display name field | live | Required, 2–120 characters. Marker on the label row. | `compose.displayName` = "Megjelenített név" · marker `compose.required` = "Kötelező" | Kovács Péter |
| Headline field | live | Optional, max 120 characters, one line (once it is not empty the server wants at least 2 characters; a 1-character headline is refused silently). Marker on the label row, persistent hint below. | `compose.headline` = "Egysoros bemutatkozás" · marker `compose.optional` = "Nem kötelező" · hint `compose.headlineHint` = "Ez jelenik meg a neved alatt a piactéren." | Erőnléti edző · 12 év tapasztalat · Budapest és online |
| Specialties | live | Multi-select toggles, max 6 (at 6, further taps silently do nothing). Heading + counter on one line. Options come from the server's fixed list of 14; the coach's own come first, the first six are visible, an overflow reveals the rest (no way to collapse again). Selected = marked + check glyph (in code: a FILLED accent chip with the check LEADING the word — the other side from the desk filter's trailing check; the "✓" after the words below is notation only, not a position). | `compose.specialties` = "Szakterületek" · `compose.specialtiesCount` = "{{n}} / {{max}} kiválasztva" · overflow `common.more` = "Több" · options: see the list below | 4 / 6 kiválasztva · Erő ✓ · Izomtömeg ✓ · Rehabilitáció ✓ · Táplálkozás ✓ · Erőemelés · Súlyemelés · Több |
| Bio | live | Plain multi-line text box holding MARKDOWN SOURCE (no formatting toolbar). Counter under its trailing edge: characters left of 8000; calm → warning colour above 90 % → danger past the cap (it then reads 0). | `compose.bio` = "Bemutatkozás" · `compose.charsLeft` = "{{n}} karakter maradt" | seed bio (below) · 7552 karakter maradt |
| Public switch (edit only) | live | On / off, saved immediately (independent of "Mentés"). The same fact as the desk's "Élő" / "Rejtve". Disabled while saving. Absent on create. | `compose.publicProfile` = "Nyilvános profil" · `compose.publicProfileHint` = "A piactéren bárki megtalál." | on |
| Save | live | Sends every field (an emptied optional field is cleared). Busy state; then back to the desk. Sits at the END of the form, not docked. | `compose.save` = "Mentés" (edit) · `compose.createProfile` = "Profil létrehozása" (create) | Mentés |
| Preview toggle | live | Secondary, next to Save, eye glyph. Shows / hides the rendered bio under the buttons. | `compose.showPreview` = "Előnézet" · `compose.hidePreview` = "Előnézet elrejtése" | Előnézet |
| Bottom bar | live | Coach: 6 tabs, "Edző" lit. | `nav.coach` = "Edző" | Edző active |

Specialty options (server order): `public.specialty.strength` = "Erő" · `public.specialty.hypertrophy` = "Izomtömeg" · `public.specialty.powerlifting` = "Erőemelés" · `public.specialty.olympic_lifting` = "Súlyemelés" · `public.specialty.endurance` = "Állóképesség" · `public.specialty.running` = "Futás" · `public.specialty.mobility` = "Mobilitás" · `public.specialty.rehabilitation` = "Rehabilitáció" · `public.specialty.nutrition` = "Táplálkozás" · `public.specialty.weight_loss` = "Fogyás" · `public.specialty.prenatal` = "Kismama" · `public.specialty.senior` = "Szenior" · `public.specialty.youth` = "Ifjúsági" · `public.specialty.calisthenics` = "Saját testsúlyos".

City options (fixed server list, names without keys): Budapest · Debrecen · Szeged · Miskolc · Pécs · Győr · Nyíregyháza · Kecskemét · Székesfehérvár · Online; first option = no city, `marketplace.everywhere` = "Bárhol".

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Identity panel (edit; opens under the anchor) | live | Folded away on purpose. Contains the rename form and the city picker. Rename is its OWN action with its own button (not part of "Mentés"); confirm is disabled until the handle differs and is not empty. The city picked here is saved by "Mentés". | `compose.handleChangeTitle` = "Nyilvános név módosítása" · `compose.handle` = "Felhasználónév" · `compose.handleHint` = "3–32 karakter, kisbetű, szám és kötőjel. Később csak külön kérésre változtatható." · `compose.handleChangeConfirm` = "Név módosítása" · `common.cancel` = "Mégse" · `compose.city` = "Város" | field: kovacs-peter-edzo · Város: Budapest |
| Handle availability line | live | Always reserves its row under the handle field. Advisory only — never disables a button. Capitals are lower-cased and spaces become hyphens as the coach types. | `compose.handleChecking` = "Ellenőrzés…" · `compose.handleFree` = "Szabad" · `compose.handleTaken` = "Ez a név foglalt" · `compose.handleMalformed` = "Csak kisbetű, szám és kötőjel, 3–32 karakter." · `compose.handleIsYours` = "Ez a jelenlegi neved." · `compose.handleUnknown` = "Most nem sikerült ellenőrizni — a mentésnél kiderül." | Szabad |
| Rename warning | live | Only when the profile has ever been public. Both numbers come from the server (365 and 30 today). | `compose.handleCooldownWarning` = "A(z) {{handle}} nevet ezzel elengeded, és {{retireDays}} napig senki más nem veheti fel. Új módosításra {{days}} nap múlva lesz újra lehetőséged." | A(z) kovacs-peter nevet ezzel elengeded, és 365 napig senki más nem veheti fel. Új módosításra 30 nap múlva lesz újra lehetőséged. |
| Rename refusal | live | Danger line inside the panel. | `compose.reason.handle_unavailable` = "Ez a felhasználónév nem elérhető." · `compose.reason.rename_too_soon` = "A nevet nemrég módosítottad. A következő módosítás {{date}} után lehetséges." · `compose.reason.handle_changed` = "A profilod neve időközben megváltozott — most {{handle}}. Frissítsd az oldalt, mielőtt újra megpróbálod." | … 2026. 11. 08. után lehetséges. |
| Handle + city on CREATE | live | On create both sit in the form, directly under the anchor (handle field with the same hint and availability line, then the city picker). The handle is asked for once. | same keys as above | empty · Bárhol |
| Preview block | live | Heading + the bio rendered exactly as the public page will (headings, bold, lists, quote). Re-renders 0.4 s after typing stops. | `compose.preview` = "Előnézet" · empty / not yet rendered: `compose.previewEmpty` = "Írj valamit, és itt megjelenik úgy, ahogy mások látni fogják." | rendered seed bio |
| "Went dark" line under the switch | live | After switching the profile off, how many live posts left the marketplace with it. | `compose.wentDark` = "{{count}} poszt lekerült a piactérről." | 4 poszt lekerült a piactérről. |
| Save refusal box | live | Warning-toned line under the buttons when the server refuses with a named reason. | `compose.reason.handle_unavailable` = "Ez a felhasználónév nem elérhető." · `compose.reason.profile_exists` = "Már van profilod." · `compose.reason.city_unknown` = "Ismeretlen város: {{key}}" · `compose.reason.specialty_unknown` = "Ismeretlen szakterület: {{key}}" · fallback `compose.reason.generic` = "A művelet nem hajtható végre." | Ez a felhasználónév nem elérhető. |
| Bio refusal line | planned (copy exists, code path unreachable — see Notes) | Intended: one danger line naming what is wrong with the text. | `compose.markdown.too_long` = "A szöveg hosszabb a megengedettnél." · `compose.markdown.too_many_links` = "Túl sok link van a szövegben." · `compose.markdown.generic` = "A szöveg nem dolgozható fel." | — |
| Takedown line | live | One danger-toned line under the back link when a moderator removed the profile. | `compose.removedTitle` = "A profilodat levették" | — |
| Avatar photo, camera badge, "Kép cseréje" | cut (no backend) | The old spec drew them; no upload endpoint exists for a coach picture. | no key | — |

## States

| State | When | What shows (copy) |
|---|---|---|
| Loading | profile request pending | Skeleton: round monogram block, two short lines, one tall field block. No spinner. |
| Edit | a profile exists | Everything in MUST; identity line under the name; primary "Mentés". |
| Create | no profile yet | Monogram "·", heading "Profil létrehozása" until a name is typed; NO identity line; handle field + city picker in the form; NO public switch; primary "Profil létrehozása"; counter "0 / 6 kiválasztva"; first six specialties in server order. |
| Identity panel open | tap on "@handle · city" (edit, not taken down) | Panel between the anchor and the name field; handle field pre-filled with the current handle and focused → status "Ez a jelenlegi neved."; confirm disabled. |
| Handle status | while typing in the handle field | nothing (empty) · "Ellenőrzés…" · "Szabad" (success) · "Ez a név foglalt" (danger) · "Csak kisbetű, szám és kötőjel, 3–32 karakter." (danger) · "Ez a jelenlegi neved." · "Most nem sikerült ellenőrizni — a mentésnél kiderül." |
| Never-public profile, panel open | profile was never published | Same panel WITHOUT the warning (a rename costs nothing then). |
| Renaming | confirm tapped | Confirm busy → panel closes on success; refusal → danger line stays in the panel. |
| Specialties at the cap | 6 selected | Counter "6 / 6 kiválasztva"; unselected options stay looking tappable but do nothing (no message). |
| Specialties expanded | after "Több" | All 14 options; "Több" gone. |
| Bio counter | length vs 8000 | calm (text-3) · above 7200 warning colour · past 8000 danger colour and "0 karakter maradt" (typing is not blocked; the save is refused). |
| Preview open | "Előnézet" tapped | Button reads "Előnézet elrejtése"; block "Előnézet" under the buttons; with an empty bio or before the first render: "Írj valamit, és itt megjelenik úgy, ahogy mások látni fogják." |
| Switch saving / refused | public switch toggled | Switch disabled while pending; after switching off: "4 poszt lekerült a piactérről."; switching ON can be refused with a named reason — only guidelines not accepted or account younger than 24 h — as a danger caption under the row: `compose.reason.needs_guidelines` = "Előbb fogadd el a jelenlegi irányelveket ({{version}})." / `compose.reason.too_new` = "A fiók még túl új. Publikálni {{when}} után tudsz." LIVE BUG (same as the desk's sheet): no values are passed, so the running app prints "{{version}}" / "{{when}}" raw — draw the sentence with the value filled in ("… (1.0).") or not at all. Any other failure (disabled account, no network) shows nothing; the switch simply stays off. |
| Saving | "Mentés" / "Profil létrehozása" tapped | Primary busy → navigates to `/compose`. Named refusal → warning box under the buttons. A failure WITHOUT a named reason (network down, validation such as an empty or 1-letter name, or — on create — an empty or malformed handle) shows nothing at all (gap — see Notes). |
| Taken down (read-only) | a moderator removed the profile | Line "A profilodat levették" under the back link; every field, option and the switch disabled; identity line is plain text; "Mentés" disabled; "Előnézet" still works. There is NO door from the desk in this state (the desk hides the identity row and its sheet after a takedown, and its notice has no button) — only the desktop command palette or a typed URL gets here. |
| Load failed / wrong role | profile request fails (also a member typing the URL) | No error state exists: the screen falls through to the empty CREATE form (gap). |
| Offline | no connection | Shell strip `offline.title` = "Nincs internetkapcsolat"; availability falls to "Most nem sikerült ellenőrizni — a mentésnél kiderül."; saving fails silently. |

## Frames to draw

**Frame 1 — "Profil · szerkesztés" (returning coach, public profile; a long screen — draw the first 874 pt and, if possible, the full scroll).** Top to bottom:
1. Status bar 9:41.
2. Back link: "Vissza a pulthoz" (leading arrow glyph).
3. Anchor: large monogram "KP" · heading "Kovács Péter" · identity line "@kovacs-peter · Budapest" (tappable; closed).
4. Field "Megjelenített név" with the marker "Kötelező" on the label row; value "Kovács Péter".
5. Field "Egysoros bemutatkozás" with the marker "Nem kötelező"; value "Erőnléti edző · 12 év tapasztalat · Budapest és online"; hint "Ez jelenik meg a neved alatt a piactéren."
6. "Szakterületek" with the counter "4 / 6 kiválasztva" at the right edge; options: "Erő" ✓ · "Izomtömeg" ✓ · "Rehabilitáció" ✓ · "Táplálkozás" ✓ · "Erőemelés" · "Súlyemelés" · "Több".
7. "Bemutatkozás": text box showing markdown source, first lines: "## Kinek szól" / (blank) / "Olyan felnőtteknek, akik **komolyan** akarnak erősödni, de a hetük nem edzőterem köré épül." / (blank) / "- heti 3-4 edzés, 60-75 perc" …; counter at the trailing edge "7552 karakter maradt".
8. Row "Nyilvános profil" / "A piactéren bárki megtalál." with the switch ON.
9. Buttons: "Mentés" (the one lime pill) and "Előnézet" (secondary, eye glyph).
10. Tab bar, six tabs: Kezdőlap · Edzés · Étkezés · Haladás · **Edző** (lit) · Profil.

**Frame 2 — "Profil · név és város" (identity panel open, a new handle typed).** Top to bottom: status bar · "Vissza a pulthoz" · monogram "KP" · "Kovács Péter" · identity line "@kovacs-peter · Budapest" (open state) · panel: heading "Nyilvános név módosítása" · field "Felhasználónév" with the value "kovacs-peter-edzo" · hint "3–32 karakter, kisbetű, szám és kötőjel. Később csak külön kérésre változtatható." · status line (check glyph) "Szabad" · warning "A(z) kovacs-peter nevet ezzel elengeded, és 365 napig senki más nem veheti fel. Új módosításra 30 nap múlva lesz újra lehetőséged." · actions "Név módosítása" and "Mégse" · picker "Város" showing "Budapest" · then the form continues ("Megjelenített név" is cut by the fold) · tab bar.

**Frame 3 — "Profil · létrehozás" (first visit, nothing typed).** Top to bottom: status bar · "Vissza a pulthoz" · monogram "·" · heading "Profil létrehozása" · NO identity line · field "Felhasználónév" (empty) with the hint "3–32 karakter, kisbetű, szám és kötőjel. Később csak külön kérésre változtatható." and an empty status row · picker "Város" showing "Bárhol" · field "Megjelenített név" ("Kötelező", empty) · field "Egysoros bemutatkozás" ("Nem kötelező", empty, hint "Ez jelenik meg a neved alatt a piactéren.") · "Szakterületek" "0 / 6 kiválasztva": "Erő" · "Izomtömeg" · "Erőemelés" · "Súlyemelés" · "Állóképesség" · "Futás" · "Több" · "Bemutatkozás" empty, counter "8000 karakter maradt" · NO public switch · buttons "Profil létrehozása" (lime pill) and "Előnézet" · tab bar. One-line variant worth a second artboard: name typed "Kovács Péter" → monogram "KP", heading "Kovács Péter", handle "kovacs-peter" with the status "Szabad".

## Images

| Could help | Why / constraint |
|---|---|
| The giant textured monogram from the approved Profile screen ("TD." there, "KP" here) as the anchor | This screen's subject is a person and the product has NO coach photo; the approved monogram treatment is the honest hero. It must take any two characters and the "·" placeholder. |
| A quiet edgeless graphite render next to the preview block or the public switch (e.g. a lit sign / a spotlight on a plinth) | Optional atmosphere only; the form must stay very clean. |
| Sixth tab icon "Edző" (3D family, steel + lime-lit whistle) | Required by the coach bar. It now EXISTS and is uploaded: manifest slots `tab2-coach` (idle) / `tab2-coach-active` (lit) in `assets/pulse/manifest-app.json` (files `assets/pulse/app/tab2-coach.png` / `tab2-coach-active.png`); admin's seventh: `tab2-admin` / `tab2-admin-active`. Paint by the recorded hash. |

Must NOT be shown as if it existed: a profile photo, avatar upload, camera badge or "Kép cseréje" link (the asset shelf has a generated `portrait-coach`, and its manifest `use` line names "the profile preview in /compose/profile" — that does not match the product: no coach picture is stored or uploaded anywhere, the public pages draw initials too, and this screen's preview renders the bio text only. Do NOT put the portrait in the anchor or the preview of this screen; the monogram is the truth. Whether coaches should get a photo is an owner decision, not a mockup detail); a cover / banner image for the profile; a verified badge here (verification is granted by an admin and shown only on the PUBLIC pages — feed rows, post page, coach profile: `marketplace.verified` = "Ellenőrzött edző"); a map or photo of a gym; certificates or gallery images.

## Do not invent

- Avatar / photo upload, banner image, image cropping.
- Contact fields: phone, e-mail, website, Instagram / social links, address, map, opening hours.
- Price list, packages, "book a session", availability calendar, languages spoken, years-of-experience or certificate fields (experience is just free text in the headline).
- Ratings, reviews, testimonials, follower or client counts, profile-view statistics.
- A "request verification" button or a verified badge on this screen.
- Free-text city or custom specialties — both are fixed server lists (10 cities, 14 specialties); more than six specialties.
- A formatting toolbar (bold / list / link buttons) on the bio; a full "public page" preview — the preview renders the bio only.
- "View public profile", share, copy-link, QR.
- Delete profile; a confirmation dialog on the public switch or on rename; a toast after saving; an "unsaved changes" dialog when leaving (none exists on this screen).
- A separate static screen title such as "Profil szerkesztése" above the name — the name is the heading.
- An inline "required" error under the name field — no such copy exists (only the "Kötelező" marker).

## Notes for the designer

- **One lime pill:** "Mentés" / "Profil létrehozása". Code also styles "Név módosítása" (inside the panel) as a primary; in Pulse draw it as a strong secondary — it is a rare, costly action (365-day retirement of the old name, 30-day wait) and must not compete with Save.
- **Save sits at the end of a long form** (not sticky). If it is docked above the tab bar instead, it needs the states idle · busy · refused; "Előnézet" stays next to it.
- **Two things save on their own:** the public switch (immediately) and the rename (its own button). Only name, headline, specialties, bio and city wait for "Mentés".
- **Open Field and forms:** fields are underlines, not boxes; label row = label left + marker right ("Kötelező" / "Nem kötelező"); hint under the line. The bio is a multi-line box by nature — give it a hairline frame or a left rule, at least three visible lines, and remember it shows raw markdown ("## ", "**", "- ", "> "), so a monospaced or code look is NOT wanted; plain UI face.
- **Specialty options without capsules:** selected = lit word + check; unselected = text-2. Fourteen short words; "Saját testsúlyos" and "Rehabilitáció" are the widest.
- **The city picker is a native select today** (10 cities + "Bárhol"); a bottom sheet list is the natural Pulse form of it.
- **Strings that will not fit one line at 354 pt:** the handle hint (81 characters, two lines); the rename warning (three to four lines); `compose.handleUnknown` (52 characters, may wrap); the seed headline (54 characters — it overflows a single-line field and scrolls inside it); `compose.reason.handle_changed` (three lines). A display name can be 120 characters — the heading must wrap or shrink (test it with a three- or four-word name). On create the heading and the primary button both read "Profil létrehozása" until a name is typed.
- **Counters print raw numbers** ("7552 karakter maradt", "8000 karakter maradt") — no thousands separator.
- **Gaps in the live screen (do not design around them as features):** (1) no error state — a failed load shows the create form; (2) a save that fails without a named reason shows nothing; (3) the specific bio refusal lines (`compose.markdown.*`) cannot appear as coded — every refusal with a reason is routed to the warning box, where a markdown reason has no string and falls back to "A művelet nem hajtható végre."; (4) leaving with unsaved edits is silent; (5) read from the code, not run: flipping the public switch or confirming a rename reloads the profile and silently puts name, headline, specialties, bio and city back to their SAVED values — unsaved typing (and a city just picked in the identity panel) is lost. So the switch and the rename are not safe to use mid-edit; do not draw a flow that edits fields, flips the switch and then saves. A designed error line and a designed "could not load" state would both be new work plus new copy.
- **Decorative glyphs in code, safe to drop:** medal before "Szakterületek", pencil before "Bemutatkozás", globe on the "Nyilvános profil" row, eye on "Előnézet", arrow on the back link; the handle status line uses a spinner ("Ellenőrzés…"), a check ("Szabad") and an x ("Ez a név foglalt").
- Rename dates print in the browser's own locale ("2026. 11. 08." on a Hungarian phone).
- Sample data is the demo seed's public profile of the coach account: display name "Kovács Péter", handle `kovacs-peter`, city Budapest, the headline above, specialties strength / hypertrophy / nutrition / rehabilitation, verified, public for about 240 days, and the 448-character bio beginning "## Kinek szól". The typed handle "kovacs-peter-edzo" in Frame 2 is illustrative.

---
type: screen-inventory
title: Poszt szerkesztő — screen inventory
updated: 2026-10-11
route: "/compose/posts/:publicId"
tags: [ux, screen, inventory, pulse]
---

# Poszt szerkesztő — route `/compose/posts/:publicId` (new post: `/compose/posts/new`) · reached by coach and admin (server gate `requireCoach`) · you get there from the desk (`/compose`): tap a post row, or `compose.newPost` = "Új bejegyzés"; no other door · bottom tab lit: `nav.coach` = "Edző" (6-tab coach bar, 7-tab admin bar)

Sources read: `features/compose/PostEditorPage.tsx`, `useAutosave.ts`, `useComposeFlow.ts`, `useCompose.ts`, `kindIcons.ts`, `ui/feedback/ToastHost.tsx`, `backend/src/public/compose.js` (post routes + schemas), `db/worker.js` (create / update / lifecycle), migration `021_public_marketplace.sql`, `backend/scripts/seed-demo.mjs` §12, `55-Screens/compose-post-editor.md`. Status words: live = in code and reachable · planned = spec / API only · cut = decided against. "Poszt szerkesztő" is this document's name — the screen's own titles are the two h1 strings below.

## Purpose

Where a coach writes ONE marketplace item — a programme, an event or an announcement: a title, a text, one cover picture — and decides whether it is public. The screen saves by itself; the coach's job is to write and then publish.
**ONE primary action:** `compose.publish` = "Közzététel" (an existing draft). On a NEW post the primary is `compose.createDraft` = "Piszkozat létrehozása". A post that is already public or taken down has no primary at all (only secondary actions) — a screen without the lime pill is correct there.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Back link | live | → `/compose`. No in-app "discard?" question. | `compose.backToDesk` = "Vissza a pulthoz" | Vissza a pulthoz |
| Title (the only h1) | live | Says which mode the screen is in. | new: `compose.newPost` = "Új bejegyzés" · existing: `compose.editPost` = "Bejegyzés szerkesztése" | Bejegyzés szerkesztése |
| Save control (beside the h1) | live | New post: creates the draft (primary, busy state). Existing post: secondary; label follows the state — something to save / nothing to save (disabled). Also Ctrl/Cmd+S on desktop. Kept because autosave only starts once there is a title. | `compose.createDraft` = "Piszkozat létrehozása" · `compose.save` = "Mentés" · `compose.saved` = "Mentve" | Mentve (disabled) |
| Cover picture + caption row | live (existing, not moderator-removed posts) | The picture at full content width, 16:9, cropped to fill — it IS the preview. Under it one row: the word for the slot, the picture's own description on one line (ellipsis) or the "none" label, and the remove action (busy state). There is no replace: changing a cover = remove, then choose again. | `compose.cover` = "Borítókép" · no description: `compose.coverAltMissing` = "Nincs képleírás" · `compose.removeCover` = "Kép eltávolítása" | picture (shelf still `cover-gym`) · Súlyzós terem lámpafényben · Kép eltávolítása |
| Cover upload block (no cover yet) | live | Takes the place of the picture: an optional description field (max 200 characters) with a hint, then the file-choice button (JPEG / PNG / WebP / AVIF, one file). Label changes while uploading. | `compose.coverAlt` = "Képleírás" · `compose.coverAltHint` = "Mit ábrázol a kép? Aki nem látja, ezt fogja hallani." · `compose.chooseCover` = "Kép választása" · `compose.uploading` = "Feltöltés…" | empty field · Kép választása |
| Type | live | NEW post: a three-way single choice (first one preselected), each with its kind glyph. EXISTING post: not a control — the kind as plain text with its glyph, and a caption saying it is frozen. | label `compose.kind` = "Típus" · `marketplace.kind.program` = "Program" · `marketplace.kind.event` = "Esemény" · `marketplace.kind.announcement` = "Közlemény" · `compose.kindFrozen` = "A típus a létrehozás után már nem változtatható." | Program |
| Title field | live | Required, 3–140 characters, one line. Marker on the label row; under the field, flush left, the characters left. | `compose.postTitle` = "Cím" · marker `compose.required` = "Kötelező" · `compose.charsLeft` = "{{n}} karakter maradt" | Téli tömegelő – piszkozat · 115 karakter maradt |
| Text | live | Tall plain text box holding MARKDOWN SOURCE, no formatting toolbar. Also required in practice (the server refuses an empty text) but carries no marker. Counter at the trailing edge: left of 20000; calm → warning colour above 90 % → danger past the cap. | `compose.body` = "Szöveg" · `compose.charsLeft` = "{{n}} karakter maradt" | seed text (Frame 1) · 19897 karakter maradt |
| Autosave line | live | One reserved row above the actions; empty until something happens in this visit. Saving → saved with the clock time → or a failure that stays until the next success. Autosave runs 1.5 s after typing stops and when the app goes to the background. | `compose.autosave.saving` = "Mentés…" · `compose.autosave.label` = "Automatikus mentés" + "·" + `compose.autosave.saved` = "Mentve" + HH:MM · `compose.autosave.failed` = "A mentés nem sikerült — a szöveged megvan, próbáld újra." | Automatikus mentés · Mentve 09:40 |
| Lifecycle actions | live (existing, not moderator-removed) | Below a rule. Draft: publish (primary) + take down. Public: take down only. Taken down: restore only. Exactly one caption under the buttons. Each shows a busy state. | `compose.publish` = "Közzététel" · `compose.withdraw` = "Levétel" · `compose.restore` = "Visszaállítás" · captions `compose.withdrawUndoable` = "A levétel bármikor visszavonható." · `compose.restoreKeepsPosition` = "A visszaállítás az eredeti helyére teszi vissza, és nem használ el napi keretet." | Közzététel · Levétel · A levétel bármikor visszavonható. |
| Bottom bar | live | Coach: 6 tabs, "Edző" lit. | `nav.coach` = "Edző" | Edző active |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Success toasts | live | Short confirmations (with a light haptic). The take-down toast carries a one-tap undo that restores the post. NOTE: "Mentve" fires after EVERY save, autosaves included. | `compose.toast.draftCreated` = "Piszkozat létrehozva" · `compose.toast.saved` = "Mentve" · `compose.toast.published` = "Közzétéve" · `compose.toast.withdrawn` = "Levéve" · `compose.toast.restored` = "Visszaállítva" · `compose.toast.coverAdded` = "Borítókép feltöltve" · `compose.toast.coverRemoved` = "Borítókép eltávolítva" · undo `common.undo` = "Visszavonás" → `common.undone` = "Visszavonva" | Levéve · Visszavonás |
| Refusal box (+ an error toast) | live | Warning-toned line between the text and the autosave line when the server refuses a save, publish or restore with a named reason. The BOX fills in the values (count, time, version, field). The error toast raised at the same moment repeats the sentence only for reasons WITHOUT a variable (hidden profile, no profile, taken down); for the quota, guidelines, account-age and kind-shape refusals the running app's toast prints the placeholders raw ("Mára elfogyott a keret ({{used}}/{{max}}). Következő hely: {{next}}.") — a live bug, checked against the shipped i18next. Draw the box as the message; do not draw a toast for these four. | `compose.reason.quota_reached` = "Mára elfogyott a keret ({{used}}/{{max}}). Következő hely: {{next}}." · `compose.reason.profile_not_published` = "Előbb tedd közzé a profilodat." · `compose.reason.profile_required` = "Előbb hozz létre egy nyilvános profilt." · `compose.reason.needs_guidelines` = "Előbb fogadd el a jelenlegi irányelveket ({{version}})." · `compose.reason.too_new` = "A fiók még túl új. Publikálni {{when}} után tudsz." · `compose.reason.withdrawn` = "Ez a bejegyzés le van véve. Előbb állítsd vissza." · `compose.reason.kind_shape` = "A(z) {{field}} mező nem illik ehhez a típushoz." · fallback `compose.reason.generic` = "A művelet nem hajtható végre." | Mára elfogyott a keret (10/10). Következő hely: 2026. 10. 09. 19:20:00. |
| "Changed elsewhere" sheet | live | Opens when a save meets a newer copy on the server. Shows the server's title; one action adopts the server copy (title + text); closing the sheet keeps what is on screen. Nothing is merged silently. | title `compose.reason.stale` = "Ez a bejegyzés közben megváltozott." · `compose.staleServerCopy` = "Közben máshol is mentettél. A szerveren ez van:" · `compose.takeServerCopy` = "A szerveren lévő átvétele" · close `common.close` = "Bezárás" | server title: Téli tömegelő – 6 hetes blokk |
| Moderator-removed banner | live | One danger-toned line under the title row; everything below is read-only. | `compose.postRemoved` = "Ezt a bejegyzést egy moderátor eltávolította. Csak olvasható." | — |
| Cover error line | live | Danger line inside the cover block when upload or removal fails. A failure with no named reason (e.g. no network) prints the generic sentence instead. | `compose.coverFailed` = "A kép feltöltése nem sikerült." · `compose.reason.generic` = "A művelet nem hajtható végre." | — |
| Title over-limit error | live (normally unreachable — the field stops at 140) | Replaces the counter under the field. | `compose.overLimit` = "Hosszabb a megengedettnél." | — |
| Text refusal line | planned (copy exists, code path unreachable — see Notes) | Intended: one danger line under the text naming what is wrong. | `compose.markdown.no_visible_text` = "A szöveg nem tartalmaz látható tartalmat." · `compose.markdown.too_many_links` = "Túl sok link van a szövegben." · `compose.markdown.line_too_long` = "Túl hosszú egy sor." · `compose.markdown.generic` = "A szöveg nem dolgozható fel." | — |
| Tags ("Címkék", "+ Új címke") | planned (old spec only; no API, no copy) | — | no key | — |
| Event date, city, capacity, price fields | cut from this screen (the data exists and the PUBLIC post page shows it; the editor only passes stored values through) | — | no key in `compose.*` | — |
| Rendered preview of the post | cut (the cover is the preview) | — | — | — |

## States

| State | When | What shows (copy) |
|---|---|---|
| Loading | opening an existing post | Skeleton: title line, a 16:9 block, a text block. No spinner. |
| Gone | unknown id, not the coach's post, or the request failed (also a member typing the URL of an existing post; a member typing `/compose/posts/new` gets the bare New form instead — no counters, and its save is refused) | Trash glyph · `compose.postGoneTitle` = "Ez a bejegyzés nem érhető el" · `compose.postGoneBody` = "Lehet, hogy törölted, vagy sosem létezett." · centred back link "Vissza a pulthoz". |
| New | `/compose/posts/new` | h1 "Új bejegyzés"; primary "Piszkozat létrehozása"; type is a live three-way choice; NO cover block, NO lifecycle row. After the first successful save the URL and the screen silently become "existing" (toast "Piszkozat létrehozva"). |
| Existing · draft, no cover | not yet published | Upload block; type frozen; "Közzététel" (primary) + "Levétel"; caption "A levétel bármikor visszavonható." |
| Existing · draft, with cover | cover uploaded | Picture + caption row; rest as above. |
| Existing · public | published | No "Közzététel"; only "Levétel" + "A levétel bármikor visszavonható." No lime pill on the screen. |
| Existing · taken down | coach withdrew it | Only "Visszaállítás" (rotate glyph) + "A visszaállítás az eredeti helyére teszi vissza, és nem használ el napi keretet." Title and text still LOOK editable, but the server does not save a taken-down post (see Notes, gaps) — draw this state with untouched text and the save control "Mentve". |
| Clean / dirty | text equals / differs from the saved copy | Save control "Mentve" (disabled) / "Mentés" (enabled). |
| Autosave | after typing | "Mentés…" → "Automatikus mentés · Mentve 09:40" → on failure (danger, with an alert glyph, does not fade) "A mentés nem sikerült — a szöveged megvan, próbáld újra." |
| Uploading / removing a cover | file chosen / remove tapped | Button reads "Feltöltés…" (file choice disabled) / remove shows busy; then toast "Borítókép feltöltve" / "Borítókép eltávolítva"; failure → "A kép feltöltése nem sikerült." (or "A művelet nem hajtható végre." when the failure has no named reason). |
| Publish refused | quota, hidden profile, guidelines, account age | Refusal box, e.g. "Előbb tedd közzé a profilodat." or "Mára elfogyott a keret (10/10). Következő hely: 2026. 10. 09. 19:20:00." An error toast fires too, but it is only readable for the variable-free reasons ("Előbb tedd közzé a profilodat."); for quota / guidelines / account age it shows raw placeholders in the running app (live bug) — leave the toast out of those frames. |
| Just taken down | "Levétel" tapped | Toast "Levéve" with "Visszavonás" (tapping it restores; the toast then reads "Visszavonva"); the row flips to "Visszaállítás". |
| Changed elsewhere | save refused as stale | The sheet (SHOULD table). |
| Moderator-removed (read-only) | post removed by a moderator | Banner "Ezt a bejegyzést egy moderátor eltávolította. Csak olvasható."; title and text disabled; type as plain text; NO cover block, NO lifecycle row; save control disabled. |
| Offline | no connection | Shell strip `offline.title` = "Nincs internetkapcsolat"; autosave goes to its failed line and stays there; nothing queues. |
| Leaving with unsaved text | closing the tab / window | Browser's own "leave site?" prompt only. In-app navigation is not guarded. |

## Frames to draw

**Frame 1 — "Bejegyzés · piszkozat borítóval" (returning coach finishing a draft; a long screen — draw the first 874 pt and, if possible, the full scroll).** Top to bottom:
1. Status bar 9:41.
2. Back link "Vissza a pulthoz" (leading arrow glyph).
3. Title "Bejegyzés szerkesztése" with the save control "Mentve" (disabled, quiet) on its right.
4. Cover picture, full content width, 16:9 — the shelf still `cover-gym` (an empty rack under one hanging lamp), cropped from its 4:3.
5. Caption row: "Borítókép" · "Súlyzós terem lámpafényben" · action "Kép eltávolítása". (The description is the coach's own text and has to describe the picture drawn; the old spec's "Súlyzós terem reggeli fényben" was replaced because no morning-light picture exists on the shelf.)
6. "Típus": "Program" (plain text, kind glyph) · caption "A típus a létrehozás után már nem változtatható."
7. Field "Cím" with the marker "Kötelező": "Téli tömegelő – piszkozat" · counter "115 karakter maradt".
8. "Szöveg": text box with the markdown source — "Ide jön a téli blokk leírása. Még nincs kész: hiányzik az ár és a létszám." / (blank line) / "- hat hét" / "- heti négy edzés" · counter at the trailing edge "19897 karakter maradt".
9. Autosave line: (check glyph) "Automatikus mentés · Mentve 09:40".
10. Rule, then "Közzététel" (globe glyph — the one lime pill) and "Levétel" (secondary, eye-off glyph); caption "A levétel bármikor visszavonható."
11. Tab bar, six tabs: Kezdőlap · Edzés · Étkezés · Haladás · **Edző** (lit) · Profil.

**Frame 2 — "Új bejegyzés" (just opened, nothing typed).** Top to bottom: status bar · "Vissza a pulthoz" · title "Új bejegyzés" with the primary "Piszkozat létrehozása" (the lime pill of this frame) · "Típus": three-way choice "Program" (selected) · "Esemény" · "Közlemény" · field "Cím" ("Kötelező", empty) with "140 karakter maradt" · "Szöveg" empty box with "20000 karakter maradt" · empty autosave row · NO cover block, NO lifecycle row · tab bar.

**Frame 3 — "Bejegyzés · még nincs borító" (the same draft right after it was created).** Top to bottom: status bar · "Vissza a pulthoz" · "Bejegyzés szerkesztése" + "Mentve" · upload block: field "Képleírás" (empty) with the hint "Mit ábrázol a kép? Aki nem látja, ezt fogja hallani." and the button "Kép választása" (image-plus glyph) · "Típus": "Program" + "A típus a létrehozás után már nem változtatható." · "Cím": "Téli tömegelő – piszkozat" · "115 karakter maradt" · "Szöveg" as Frame 1 · "Automatikus mentés · Mentve 09:40" · rule · "Közzététel" + "Levétel" · "A levétel bármikor visszavonható." · toast "Piszkozat létrehozva" · tab bar.
Cheap variants of Frame 1 (swap the bottom rows only): public post — title "Őszi erőblokk – 8 hetes csoportos program", counter "99 karakter maradt", description "Őszi erőblokk – 8 hetes csoportos program – borítókép" (truncated), only "Levétel"; taken down — only "Visszaállítás" + its caption + toast "Levéve · Visszavonás".

## Images

| Could help | Why / constraint |
|---|---|
| The cover picture itself: a low-key black-and-white gym photograph graded to the Pulse black (a barbell rack, chalk, plates) | It is the screen's anchor and real product content: coaches upload one photo per post. Three cover stills now EXIST and are uploaded (manifest slots in `assets/pulse/manifest-app.json`, checked 2026-10-10): `cover-gym` (an empty power rack with a loaded bar under ONE hanging lamp, at night), `cover-bar` (two chalked hands sliding a plate onto a bar), `cover-track` (a runner's feet on a start line) — all 1200 × 900 (4:3) with feathered black edges, so crop to 16:9 and paint by the recorded hash. The description under the picture is the coach's own free text and must describe the picture actually used: the old spec's sample "Súlyzós terem reggeli fényben" says MORNING light and fits none of the three stills, so Frame 1 uses `cover-gym` with "Súlyzós terem lámpafényben" (illustrative user text, like the original; change it if another still is drawn). |
| A quiet edgeless graphite render inside the empty upload block (a picture frame / a lens) | Makes "no cover yet" look intended instead of broken; must not be mistaken for an uploaded picture. No such render is on the shelf — the block must also work with none. |
| Sixth tab icon "Edző" (3D family, steel + lime-lit whistle) | Required by the coach bar. It now EXISTS and is uploaded: manifest slots `tab2-coach` (idle) / `tab2-coach-active` (lit) in `assets/pulse/manifest-app.json` (files `assets/pulse/app/tab2-coach.png` / `tab2-coach-active.png`); admin's seventh: `tab2-admin` / `tab2-admin-active`. Paint by the recorded hash. |

Must NOT be shown as if it existed: more than one picture per post (gallery, carousel, reorder); a crop / rotate / filter tool; the picture's size or resolution line; video; a coach photo next to the post. Real covers are arbitrary colour photographs with their own rectangular edge — the edgeless "glow out of the black" treatment works for our generated stills, not for uploads, so the frame must also survive a bright, colourful picture (draw the 16:9 rectangle honestly). The demo seed's own covers are blank 320 × 180 placeholders.

## Do not invent

- Tags / hashtags / categories beyond the three kinds; changing the kind after creation.
- Date and time picker, location / city picker, capacity, price or currency fields — none are on this screen (stored values survive a save untouched).
- A formatting toolbar, markdown shortcuts bar, emoji or mention picker, AI writing help, word count, reading time.
- A rendered preview / "see as visitor" toggle, an "open on the marketplace" link, share, copy-link.
- Replace-cover ("Csere"), gallery images, image editing, drag-and-drop ordering.
- Delete forever, duplicate, archive, version history, co-authors, comments, likes, view counts.
- Scheduled publishing ("publish later"), a publish confirmation dialog, a celebration after publishing.
- A quota meter on this screen (it lives on the desk; here the quota only appears as a refusal).
- An in-app "unsaved changes — discard?" dialog; a "saved offline, will sync" promise (nothing queues).
- A marker saying the text is required, or an inline error under it — no such copy exists.

## Notes for the designer

- **The h1 and the save control will not share one line in the Pulse display face** (estimated, measure on the first build): "BEJEGYZÉS SZERKESZTÉSE" (22 characters, upper-case) takes most of the 354 pt column by itself, and "Új bejegyzés" next to a "Piszkozat létrehozása" pill does not fit either. Plan: title on its own line(s); the save control as a quiet trailing word on the back-link row or docked above the tab bar. On a new post "Piszkozat létrehozása" is the lime pill, so it deserves the standard full-width 56 pt position.
- **Three "Mentve" at once.** The save control (`compose.saved`), the autosave line (`compose.autosave.saved`) and the toast (`compose.toast.saved`) all say "Mentve", and the toast fires on every autosave. In the mockup show the line as the receipt and do not draw a standing toast; the disabled control can be very quiet.
- **Autosave line needs a reserved row** (it is empty on arrival — the time appears only after a save in this visit). The failed sentence is 56 characters and wraps to two lines at 13 pt.
- **New-post reality (read from the code, not run):** autosave switches on as soon as the title has a character, but the server needs a title of at least 3 characters AND a non-empty text. Typing the title first therefore produces the red failed line and an error toast until the text has content. Frame 2 is drawn untouched for that reason; do not draw a half-filled "new" frame with a green receipt.
- **"Esemény" cannot actually be created here today:** an event needs a date, the screen has no date field and sends none, and the server refuses ("A(z) event_at mező nem illik ehhez a típushoz." — the raw field name leaks). Draw "Program" selected; do not build a frame around a new event. Events in the demo come from the seed.
- **A new post also needs a profile:** without one the create is refused with "Előbb hozz létre egy nyilvános profilt."
- **Text box in Open Field:** it is the largest element and must stay calm — hairline frame or left rule, UI face (not a code face) although the content is markdown source ("## ", "- ", "**"). Give it at least six lines; it does not auto-grow in code (the box scrolls).
- **Type control:** three short words; on an existing post it must NOT look like a disabled control — it is a statement. Kind glyphs today are line icons (calendar, microphone, megaphone); keep them as small utility glyphs or drop them, they are never the main visual.
- **Counters print raw numbers** ("19897 karakter maradt", "20000 karakter maradt") — no thousands separator; the title counter sits flush left under its field, the text counter at the trailing edge.
- **Other strings that wrap at 354 pt:** `compose.restoreKeepsPosition` (two lines), `compose.postRemoved` (two lines), the quota refusal with its timestamp (two lines), `compose.coverAltHint` (close to the full width at 13 pt). The picture description is truncated to one line in code; titles can be 140 characters.
- **Timestamps** in refusals are full locale strings with seconds ("2026. 10. 09. 19:20:00"); the autosave time is HH:MM ("09:40", one minute before the 9:41 status bar).
- **Gaps in the live screen:** the specific text refusal lines (`compose.markdown.*`) cannot appear as coded — any refusal with a reason goes to the warning box, where a markdown reason has no string and reads "A művelet nem hajtható végre."; a save that fails without a named reason shows only that generic toast; in-app back navigation does not warn about unsaved text; the error toast prints raw placeholders for the four refusals that carry values (see the refusal-box row); and — read from the code, not run — a TAKEN-DOWN post cannot be edited although its fields are enabled: the server refuses the save as "stale", so typing there ends in the "Ez a bejegyzés közben megváltozott." sheet, an error toast and the red autosave line. Restore first, then edit; do not draw a taken-down frame with changed text or a fresh "Automatikus mentés · Mentve" receipt.
- **Decorative glyphs in code, safe to drop:** an image-glyph tile at the start of the cover caption row, a pencil tile before "Szöveg", the kind glyphs, globe / eye-off / rotate on the lifecycle buttons, image-plus on "Kép választása", the arrow on the back link. The autosave line's own marks carry meaning (check = saved, alert = failed; "Mentés…" has a spinner in code — in Pulse the word is the progress).
- Sample data: the draft is the demo seed's "Téli tömegelő – piszkozat" (kind Program, 25-character title, 103-character text, no cover in the seed — the cover and its description in Frame 1 are illustrative, Frame 3 is the seed-true state). The seed text mentions a missing price and head-count; the editor has no such fields — keep the text, do not draw the fields. The server title in the stale sheet is illustrative.
- Overlays, errors and skeletons follow the brief's rules (sheet = surface-2 with a line edge over a 50 % scrim; toast = small surface-2 strip with a semantic dot; skeleton blocks, never a spinner; inline progress is the word itself: "Mentés…", "Feltöltés…").

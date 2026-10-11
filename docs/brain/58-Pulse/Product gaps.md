---
type: product-gaps
title: Product gaps the Pulse screens surfaced
updated: 2026-10-11
tags: [ux, product, pulse]
---

# Product gaps the Pulse screens surfaced (from the builders)

## home
- The live-session banner payload has only log.title: no plan name, start time, exercise count, elapsed time or set progress — so frame 2 cannot show anything about the running session beyond its name.
- Nothing in the UI finishes or abandons a session, so frame 2 is permanent after the first 'Indítás' and frame 1 is seen only once; the 3/4 count includes a session that was merely opened. No Hungarian copy exists for a finish action.
- A null session title falls back to 'Szabad edzés' (what the demo account shows); that variant is not drawn here.
- The empty state is identical for 'no active plan', 'no plan day today' and a failed today query — there is no error copy and no first-run copy (joining a coach, the questionnaire).
- 'Gyakorlatok böngészése' in the empty state is the only phone door to /library; on any day with a plan occurrence (frames 1 and 2) the library cannot be reached from Home.
- The ring and week bar disappear on a day with no plan occurrence even if the week has sessions elsewhere (inventory open decision 1), so frame 3 shows no weekly progress at all.
- The Home payload carries no muscle or category for the session, so the hero image can show a kind of day, never the session itself.

## notifications
- No bell artwork in the Pulse image family: a graphite 3D bell (lit for unread, dark/silent for 0) in the tab-icon render style would be the natural hero object beside the numeral; it does not exist in manifest-app.json.
- `bell-off` (silent bell) and the app's `message-square` glyph are not in icons.json; message-circle was used for chat rows.
- No route owns /notifications in the tab bar, so no tab is lit; the back target depends on which bell was tapped (Home or /coach) and the product has no parent label for it.
- Chat notification rows have a dead link (/chat/<id> is not a route; the member lands on Home) and carry only the sender's e-mail local part — no display name, no body, so a chat row is a single bare word.
- The read state has no visual of its own in this design; if the owner wants an explicit read mark, the system needs a defined 'read' token (a neutral tick does not exist in the light-level grammar).
- The mark-all-read pill is on screen for about one network round trip only (the screen auto-marks on arrival); whether marking read should become a deliberate tap is an open owner decision.
- No load-more / paging UI exists for items beyond the first 30, and the anchor count is capped by that first page while the bell badge counts to 99+.

## coins
- Statement reason labels have no hu.json key: the server sends English ("Administrative debit", "Store purchase", "Achievement reward"). Hungarian labels need new keys.
- A purchase made in the app stores no note, so outside the demo seed a spend row reads "Store purchase" + date with no item name. Showing what was bought needs a backend change.
- No error copy or retry exists for a failed wallet, store, achievements or statement request: the wallet shows no figure, the others fall back to the empty copy.
- When two unowned items are both affordable the code gives each price the primary style, which would mean two lime pills on one screen. Pulse needs a rule (owner decision).
- No deep link to a sub-tab: Profil's "Eredmények" row lands on Bolt, not on the Eredmények view.
- "Ezen a héten" / "Elköltve" readouts and the share-of-lifetime arc have copy or client slots but no server data; they are not drawn.
- Whether the two theme packs (colour themes of the old design) survive inside Pulse is an open owner decision; the store is drawn by name and description only.
- Offline with no cached coin data, the app shows a false zero state ("0", "A bolt üres", "0 / 0 feloldva"), contradicting the never-0 rule. Flagged, not drawn.
- The statement date follows the browser locale, not the app language ("2026. 09. 27." vs "9/27/2026").
- The API returns no progress toward a locked achievement and the UI renders no unlock date, so locked rows can only say what they pay.

## coach-plans
- The current build truncates plan names to one line; the design needs two-line names with balanced wrapping (CSS text-wrap: balance, max 2 lines, ellipsis after) and a non-breaking space before ' – ' / ' — ' in plan names.
- The current build draws the row status as a filled chip and paints 'Aktív' in two colours (accent on the bar, success green in the row); the design needs one lit level: lime tick + word on the mono meta line.
- The empty state in the build puts the button above the message; the design moves 'Új terv' below title + body.
- hero-plates exists only in the design asset run (assets/pulse/app/hero-plates.png); the app needs it as a shipped asset, graded to #0B0D0A and rendered with a lighten blend (or pre-composited on the canvas black).
- A failed 'Új terv' has no error message in the product (inventory gap) — the design has no place for one either; a noticeLine/toast string would be needed.
- No archive/delete control exists anywhere, so abandoned 'Új terv' drafts accumulate in 'Sablonok' (inventory gap, not designed around).
- The client row shows only a monogram; when two clients share initials the copies of the same template are indistinguishable (the client's name is not in the visible payload for this row by design).

## settings
- Érmék row shows the balance (190, 'Egyenleged'): today /settings prints only the label — the screen must also call GET /coins/wallet (and show '—', never 0, when it fails).
- Eredmények 4 / 7 on Profil: needs GET /coins/achievements on this screen; the word 'feloldva' alone is not a key (the key is '{{done}} / {{total}} feloldva').
- Testsúly row with sparkline: the body summary is only 'planned on Profil' — needs GET /measurements here and a link to /progress.
- Theme packs: no client state or copy for locked / owned / price; an unowned pack previews freely and the save fails with the generic error. In Pulse (dark-only, one accent) it is also undecided what the seven packs mean at all (owner decision 6).
- 'Áttetsző felületek' and its hint ('Az üveghatás a kártyákon és a sávokon…') describe glass cards and bars that do not exist in Open Field — the setting needs to be dropped or re-worded for this style (owner decision).
- Display-name save has no success or error copy (failure is silent today).
- The inventory's header (back control + title 'Beállítások') is not drawn: the approved design treats Profil as a root tab with 'Beállítások' as an in-page heading (open decision 1).
- Sign-out has no busy / failed-offline copy; the design shows only the resting row.
- Vibration 'available' state exists only in a native Capacitor build that does not exist yet.

## compose-hub
- No door to /compose on a phone (only the desktop command palette, a typed URL or back from the editors) — the screen is designed, but a coach cannot reach it from the coach dashboard or Profil today. Owner decision.
- No hero image exists for the desk: the inventory suggests a graphite 'noticeboard' object (megaphone, card stack, pin-board clip) beside the numeral; nothing like it is on the asset shelf.
- The post list API returns no cover, date or excerpt, so rows can only be title + 'kind · state'; and it returns at most 12 posts with no next page, so the total can never read above 12.
- No string explains what 'Profil levétele' does before the tap (it hides every live post, with no confirmation); the only feedback is the after-the-fact line '{{count}} poszt lekerült a piactérről.'
- The two refusal strings in the sheet (needs_guidelines, too_new) are rendered with raw placeholders in the running app because no values are passed.
- 'Több' has no affordance or state of its own in the product (it is a fourth word in the filter that reveals two more options); a disclosure cue would need a decision.
- The community guidelines text itself has no Hungarian string and no screen (affects the gate state, not drawn here).

## coach-chat
- Composer docking: as built the page scrolls as a whole and the composer sits in flow after the last message. The design needs the composer docked above the tab bar with the newest message in view.
- Sticky identity header: the design assumes back row + monogram + name + rule stay put while the thread scrolls under the rule. Today the anchor scrolls away with the page.
- Auto-growing field: the build has only a 44 pt floor and a 128 pt ceiling with no grow logic, so long text scrolls inside one row. Frame 2 shows the field growing by whole lines.
- Bubble-less messages: the build uses filled, bordered bubbles with the meta inside. The design needs alignment and tone only, the stamp under the message, and balanced line wrapping.
- Empty-state mark: no message-themed graphite render exists in the asset set. If a mark is wanted, one calm object (for example a steel paper plane) would have to be generated.
- Block fires on one tap with no confirmation; the Pulse system says destructive actions are confirmed in a bottom sheet. A confirm step would be a new feature and is not drawn.
- Report has no touch affordance, yet the unpainted control still takes taps in the build. It is not drawn; this needs a build fix or a designed long-press menu.
- No load-failure state or copy exists: a failed lookup shows 'Ez a beszélgetés már nem elérhető.' and a failed first thread load shows the empty state.
- The member has no chat screen, so outside the demo seed a real thread holds only the coach's messages, all 'Kézbesítve'. The two-sided thread in frame 1 is demo data.

## exercise-detail
- Figure renders exist for only a few muscle combinations (chest, chest + shoulders, lats, quads, neutral front and back). The product needs a way to light any primary/secondary set on the mannequin (per-panel masks or a render per muscle); otherwise most of the 1652 exercises cannot show this hero.
- The other view of both sample exercises has no render: frame 1's Hátul (Tricepsz as secondary on the back) and frame 2's Elöl (Bicepsz as secondary on the front) cannot be drawn today.
- Equipment stills are missing for several equipment keys (Húzódzkodó rúd, TRX, EZ-rúd, Smith-gép and others fall back to another still or to none).
- The other-side caption template produces 'a elöl' on the back view; it needs an article that follows the word (az elöl / a hátul) or a reworded string.
- The h1 needs text-wrap: balance (or equivalent) so long names do not leave one word alone on the last line.
- The substitutes payload carries only id, name and difficulty: no equipment or muscle, so entries cannot get a thumbnail, and the ranking (shared primary muscle, A to Z by English name, cap 8) looks random in Hungarian.
- Step and description text of catalogue exercises exists only in English and nothing marks it; the language mark reacts to the name only.
- No distinct error state with retry (a failed request reads 'Nincs találat'), and a non-numeric id leaves the skeleton up forever; neither was designed.
- No exercise media anywhere in the catalogue, and no upload screen for coach-authored media.

## nutrition
- Date control: the design shows a formatted day name ("Péntek, október 9.") with a chevron in place of the OS-native date input's own text; the app needs a custom trigger over the native picker and the Home date formatter.
- On picking a food the page should scroll the picked block and the pill clear of the tab bar; today nothing moves.
- Log rows are designed with grams and kcal as two separate values; the live row prints one hard-coded caption string. 'kcal', 'g', '/' are still hard-coded, not in hu.json.
- Unit formatting with a space ("128 g", "cél 180 g") differs from this screen's live strings ("128g", "cél 180g").
- No visible label string exists for the macro trio as a section, and 'gramm' / 'Kalória' exist only as accessible names; the design uses the latter two as visible labels.
- Missing states the product does not have (not drawn): search loading, day load error with retry, visible feedback when add or delete fails, failed-versus-empty distinction, undo or confirm for the one-tap delete.

## onboarding
- There is no way into /onboarding for a member (no redirect after register, no Home prompt, no Profil row) — the design can only be reached by URL today.
- Load failed has no copy and no retry (endless skeleton); a Kész that fails for a network reason is silent. No frame was drawn for either because no strings exist.
- Only one still exists for the questionnaire (hero-plates); one image per step would need four more in the same series.
- Goal and sessions-per-week are required but have no visible required mark in the product; only experience and location carry "*". Drawn as is.
- The free-text note is a single-line input in code (max 2000 characters); the design needs a multi-line textarea.
- The footer is not sticky in code; docking it needs bottom padding on the scroll container, and a decision whether the alert line may push the pill up.
- No placeholder string for an empty number field, and no field-level message for an out-of-range height / weight / birth year.
- The number value is drawn at 48pt in Big Shoulders Display; the typed input needs that face and size (the system otherwise fixes input text at 16).
- "5 lépésből" is used as an uppercase eyebrow; "{{current}} / {{total}}. lépés" stays screen-reader-only.
- No per-area note field for the member although the API stores one (not drawn).

## progress
- No copy key for a heading over the 'other recorded metrics' block, and none for the change figure: '−5,3' appears with no label and no unit.
- Other-metric summaries are inert; tapping one to switch the chart is planned only, so the picker inside the form is the only way to change the chart's metric.
- Megosztás: nothing in the live UI creates the first share and no coach screen reads the consent or writes the log, so frame 2 is reachable only from the demo seed. A real member sees 'Nincs edződ, akivel megoszthatnád.' and 'Még senki nem nézte meg.'
- Checkbox vs switch for the two sharing controls is an open owner decision (code keeps checkboxes on purpose).
- A failed load looks like an empty account; every failed save shows the out-of-range sentence; every failed upload shows the JPEG/PNG/WebP sentence; failed deletes and share changes show nothing.
- Entries older than the newest 30 cannot be seen or deleted (no 'more').
- Three date formats on one route (raw ISO, the phone's own format in the date field, device-locale date + time with seconds in the log); drawn as they are.
- A member who chose lb / in in the questionnaire still gets kg / cm here.
- The access log prints the e-mail local part (kovacs.peter) while the coach block prints the display name (Kovács Péter).
- No image asset for the Fotók tab or its empty state (a graphite camera in the object family would be the hook).
- The metric picker and date field are OS-native controls; a Pulse picker sheet for the 15 metrics would be a new component.

## coach-dashboard
- Section order: the app renders counts and join codes above the roster; this design needs the roster moved directly under the anchor.
- No member-side screen redeems a join code (nothing in the frontend calls the redeem endpoint), so a code minted here only works through the API.
- No 'set your own password' screen for a pre-made account, so 'átadásra vár' never clears — the notice and tag of frame 3 are permanent for every such account.
- No UI puts a client into a team (codes and pre-made batches are sent without a team), so on a real account the team split is one 'Csapat nélkül' segment; that case needs a rule (hide the bar or draw it in full ink).
- Live code rows are indistinguishable (no label, team or date), revoke fires with no confirmation, and expired codes still count and list as live.
- No copy exists for a failed mint, revoke, archive, team create or account creation; the 'skipped' and 'seat limit reached' answers are dropped silently.
- Copy feedback has only the string 'Másolás' (shown with a check after copying); there is no 'copied' string.
- Roster order follows teams the row does not show, so the list does not look alphabetical; no decision on showing the team or sorting by name.
- Archive confirmation says the action is reversible but the coach has no restore route or archived list.
- A scrolled page needs a top safe-area mask or fade so rows do not run under the status bar; the Pulse system defines only the bottom fade.
- The handover notice is not tappable and has no action for the coach; the bell fires only for a client chat message, which a member cannot send from the app yet.

## client-detail
- The detail endpoint does not return the 28-day session count, so 'Edzés / 28 nap' reads 0 for every client in the running app; the design shows the intended 15.
- There is no visible string for the account state ('owns the account' / 'handover pending'): the design carries it with the monogram's dot colour alone, so it needs an accessible label, and probably a word.
- No control anywhere sets a training plan's start date, so a plan created or cloned on this tab keeps 'Aktiváláshoz kell egy kezdődátum' for good.
- Locale defects that ship and are drawn as-is: raw ISO dates; decimal point in records, volume, the diet item line and questionnaire weight but a comma in chart headlines; '60g', '8.1g P', '1h 6m'; English exercise names on Haladás; raw English units ('seconds', 'metres') on record rows. Owner decision needed before build.
- The diet editor has no label for the day picker, no day total, and no way to rename or delete a meal, a day or a diet; a meal added in the UI is always called 'Étkezés'.
- The third progress chart of the sample (Barbell Hip Thrust) has no data in the inventory; a series endpoint or sample is needed to draw it.
- Equipment stills exist for only 8 of the 16 equipment kinds, so the chips cannot carry pictures.
- The questionnaire sheet's labels are the member's questions ('Mi a célod?', 'Hol edzel?') — coach-side labels would be new copy.
- Nothing is sticky on this page: once scrolled to a tab there is no back link, name or view switch on screen. A pinned compact header would need a product decision (the inventory forbids a top app bar).

## plan-editor
- The plan name is a single-line input (max 120 chars). At 354 pt it cannot use the display face and long names truncate; a two-line or auto-shrinking title needs a code change.
- No rest-day / training-day render exists in the Pulse icon family (the inventory notes a moon would be a new render), so the strip and day rows are typographic. Empty strip slots would need a decision too (a plus glyph in the numeral's place).
- There is no visible label string for the add-block group or for the day list (only aria strings such as plans.addDay). The three add-block options therefore have no heading and rely on position alone.
- The code defines no selected-row visual beyond revealing the arrows, and no copy for it; a designed selection mark would need a product decision.
- Exercise catalogue has no media, so rows and picker results cannot carry a picture on this screen.
- The picker has no 'no results' text, no loading indicator and no scroll hint; the design has nothing to show for an empty or slow search.
- Rest days and editor-made days always print 'nincs időpont', and editor-made days are named 'N. nap'; with the numeral lead this is tolerable, but the product could omit the caption for rest days.
- The revision counter is a change token (52 after seeding), not a version the coach chose; '52. változat' reads like a milestone. Consider hiding it or renaming it in the product.
- A client plan cannot be given a start date anywhere, yet the screen can show 'Aktiváláshoz kell egy kezdődátum' and silently refuses 'Aktív'. No design can resolve that without a date control and an error string.
- Failed saves, failed edits and offline-disabled controls have no feedback copy (only 'A visszavonás nem sikerült'), so no error state could be designed beyond the kit's generic notice line.
- Delete toasts sit at the bottom above the tab bar in the code, while the system's showToast is a top band; a bottom toast variant is not in the kit.

## library
- List API needs an equipment key per row (e.g. equipment_slug) for the thumbnail; today rows are text-only.
- Stills are missing for 8 of the 16 equipment keys (e.g. Smith-gép, EZ-rúd, Húzódzkodó rúd, TRX, Medicinlabda, Fitneszlabda, Hengerelő, Egyéb), plus a rule for exercises with several equipment keys.
- The hint string muscleMap.filterHint ('Koppints egy izomra a szűréshez') exists as a key but is rendered nowhere today; the default frame needs it switched back on.
- Chips scoped to the visible side is a behaviour change (today: all 20 chips on both views, no auto-flip).
- Selection is in memory only and is lost when a detail is opened; the design assumes the muscle and the view survive Back (brief M-04 proposes URL state).
- When a muscle is selected on the map and its chip is off-screen, the chip strip has to scroll it into view with the first visible chip snapped to the gutter (scroll-padding 24 pt); no such behaviour exists.
- Lit figure stills exist only for Mell, Négyfejű combizom and Széles hátizom; the other 16 mapped muscles need either stills or lime drawn in-app over the neutral base (the brief's vector-region plan).
- No real total is returned by GET /exercises, so no count is shown; if a count is wanted the API must return one.
- The search field's open state (where 'Gyakorlat neve…' and 'Keresés törlése' live) needs a design; the header glyph has no accessible-name key other than library.search = 'Keresés'.
- The screen is reachable on a phone only from Home's empty state; 'Edzés' is lit here but opens /workout (owner decision in the brief).

## workout
- No figure asset for this exercise's FRONT view (Bicepsz + Oldalsó vállizom half-lit), and no back-view asset with a half-lit level; only figure-back-lats exists, so the 'Elöl' state and the secondary level cannot be drawn.
- No neutral stand-in image for the 'Videó' hero state (the catalogue has no media).
- The live player prints English catalogue names (name snapshot); the frames use the Hungarian library names. Needs an owner decision or a frontend fix.
- Title needs two lines reserved in the hero (live truncates to one line); switcher names are untruncated (live caps at 128 px).
- The skip control has only an accessible name in live; the design prints 'Pihenő átugrása'. No printed word says the clock is a rest (workout.restRemaining is screen-reader only). The live draining ring becomes a draining line.
- 'Következik' names the next EXERCISE while sets of the current one remain (live behaviour, drawn faithfully) — misleading beside the rest clock.
- The lime check fails on an untouched row: placeholders are never sent and the server refuses a set without reps; no hint copy exists. Same for a typed kg on a bodyweight movement.
- Tap versus hold-to-confirm is undecided in code; frames draw variant A (tap, no undo).
- Record caption: the live pill is capped at 128 px and cuts the phrase; the design needs two lines for 'Új rekord: ismétléses csúcs'.
- No finish / abandon action exists in the UI (backend only) — a started session cannot be closed; nothing drawn.
- Decimal marks disagree in live (recorded '62,5', previous/placeholder '62.5'); comma drawn everywhere.
- Empty-state body promises a freestyle workout nobody can start; copy quoted as is.
- Seconds / distance sets still get kg + ism. fields; no design for them.

## compose-post
- No placeholder copy exists for "Cím" or "Szöveg", so an untouched new post shows two blank fields.
- "Esemény" is offered in the type choice but cannot be created: the screen has no date field and the server refuses (the raw field name event_at leaks into the message).
- On a new post, autosave starts with the first title character but the server needs a title of 3+ characters and a non-empty text, so typing the title first produces the failed line and an error toast.
- The error toast prints raw placeholders for the quota, guidelines, account-age and kind-shape refusals (live bug noted in the inventory).
- A taken-down post looks editable but cannot be saved (the server answers "stale").
- "Mentve" appears three times at once: the save control, the autosave line and a toast after every autosave.
- Covers are centre-cropped to 16:9 with no focal point or crop control; a picture whose subject is off-centre (even our own 4:3 sample) loses part of it.
- There is no replace-cover action (remove, then choose again) and no in-app warning when leaving with unsaved text.

## compose-profile
- No 'saved' confirmation string exists for the self-saving public switch (the lead asked for an autosave status); only compose.wentDark after switching off.
- The live pitch input is single-line and scrolls; the design assumes an auto-growing field (up to 3 lines at 120 characters).
- The city picker is a native select today; the design assumes a bottom-sheet list (10 cities + 'Bárhol').
- The bio textarea has no scroll affordance; the design shows a fixed window of whole lines. Either auto-grow or a visible cue would be new work.
- Flipping the public switch or confirming a rename reloads the profile and silently drops unsaved edits (inventory gap 5). Moving the switch above the form makes a mid-edit flip less likely but does not fix it.
- No error state for a failed profile load and no message for a save that fails without a named reason (inventory gaps 1-2); nothing was designed for them.
- compose.reason.needs_guidelines / too_new print raw {{version}} / {{when}} placeholders in the running app (live bug, not drawn).
- No selected-chip check glyph and no 'more' overflow item exist in the Pulse kit; if the check from the live UI must stay, the kit needs a variant.

## marketplace
- Feed rows carry no cover image (only the lead fetches one, with an extra request). A visual feed where every post shows its cover — as the lead's note describes — needs the cover in the feed payload.
- The live screen never shows the lead post's title, coach or price (cover only, and the lead is removed from the list). The design shows them; this is a visible change the owner must approve.
- No rule exists for grading an arbitrary coach upload into Pulse (monochrome + fade to black alters coach content — owner decision). Crop ratios also differ per screen (5:2 here, 16:9 on post detail); the design uses uncropped 4:3.
- City is printed as the raw key on the live feed (budapest, szeged, online); the design uses native names, so the feed needs the same mapping as the coach profile.
- City, event date and price have no authoring UI in the post editor, and an 'Esemény' cannot be saved from the app. A post written today renders as kind · publication date / title / coach only.
- The verified flag has no admin screen or endpoint; it exists only via the seed.
- The sample data has no publication date for the lead post.
- No graphite renders exist for the three kinds (Program / Esemény / Közlemény); kind is text only.
- Seed price bug: 6900000 stored for a 69 000 Ft programme.
- The empty-state copy 'Még nincs itt semmi' is also shown when a kind filter yields zero posts; a filter-specific string is missing.
- The placeholder promises 'edzők' but coach names are not indexed by search.
- 'Belépés' is shown to signed-in visitors too; there is no signed-in header variant.
- The feed stops at 12 posts with no paging UI, though the API returns nextCursor.

## coach-profile
- Coach photo: the manifest has portrait-coach with use 'the public coach profile /m/c/kovacs-peter', but the product has no photo field, upload or storage for a coach. Owner decision: add a coach picture (then the hero changes) or keep the monogram.
- Verified flag has no admin screen or endpoint — only the seed sets it. The design shows it on the sample coach; in the running product every coach is unverified.
- Collapsed bio is a height clamp in code (two body lines of whatever comes first, so the demo coach shows only the heading). The design needs a text clamp on the first paragraph with headings skipped.
- Post row title is clamped to one line with ellipsis in code; the design needs a two-line clamp.
- 'Esemény · 2026. 10. 30.' exists only through the seed: the post editor has no event-date field and the server refuses an event without a date.
- No visible label string exists for the specialties block or the bio block (none was invented); if the owner wants an eyebrow such as a section name there, it is new copy in hu / en / de.
- Back always goes to /m, not to the post the reader came from (live behaviour, drawn as an unlabelled chevron).
- No contact, message, follow or booking path exists, so the page has no primary action and no lime pill; a visitor who trusts the coach has nothing to tap except a post.
- 'Listed since' (publishedAt) arrives in the payload but is not rendered — not drawn.

## auth
- App name has no fallback and is never cached: on an offline cold start the wordmark line stays blank, so the brand moment is an image with no name. A cached last-known name or a bundled default would fix it.
- Register does not check the password rule on the client; a rule-breaking password is answered only with the generic 'Nem sikerült a művelet. Próbáld újra.' The hint is the only place the rule is stated. A dedicated error string (or client-side check) is missing.
- No copy exists for separate password-requirement rows or a strength meter (planned in register.md), so none is drawn.
- The 409 'Ezzel az e-mail címmel már van fiók.' is a form-level line today; attaching it to the e-mail field is only planned.
- A signed-in visitor still sees the form (no redirect), and the originally requested path is ignored after sign-in.
- A coach-pre-generated account with a temporary password has no screen for the forced credential change.
- No forgot-password route or endpoint exists; nothing is drawn for it.
- The design needs hero-chalk shipped as an app asset and painted with a lighten blend on #0B0D0A; today it exists only in the Figma file and the asset folder.
- A masked value needs a secure-field rendering with visible discs (about 6 pt); the default bullet of Geist at 16 px is a 3 pt speck.

## style-studio
- No back control on a screen that is pushed from /admin: on a phone the only way back is the Admin tab. In Pulse a pushed screen normally has the back header ('ADMIN' + chevron) — owner decision.
- Toast position: the code renders it at the bottom above the tab bar; the Pulse system defines the toast as a band dropping from the status zone. Implementation must move it (or the system needs a bottom variant).
- Idle primary pills glow and pulse in Pulse; the studio shows six of them at once. The preview stages need a way to render a component without the resting glow/pulse (or only the hero keeps it).
- Element and variant names, the hero label and all specimen copy ('Save', etc.) are hard-coded English with no i18n key; Hungarian names and the one-sentence variant descriptions are planned only.
- Copy conflict for inert elements (not drawn here, raise with the owner): studio.noPreview says the components read the variant, studio.inertExplain says no component reads it.
- Load-failed state still renders five rows with none marked active (misleading) and has no retry control.
- The chooser is a 27-item horizontal text rail on phones: E27 is many swipes away and there is no active-letter hint per element on mobile (desktop S4 has it).
- E11 'Bottom nav item' variants (Active-pill, Center-FAB …) were written for the old capsule tab bar; how they map onto Pulse's capsule-less image-icon bar is undefined.
- Row tag 'aktív' and the disabled button 'Ez az aktív' duplicate each other in the active row; one of them could be dropped.
- The Lucide 'share' glyph is not in the kit's IC set; it was added locally (IC.share) for the specimen.

## post-detail
- No onward action exists on a post: no apply / contact / message / buy, and no string for a button label. If the owner wants a lime pill here, the only honest target today is the coach profile ('see the coach'), which needs new copy in hu / en / de — or a real contact feature.
- No label string for the price (nothing like 'Ár'), so the numeral stands without an eyebrow.
- City is printed as the raw key today (budapest, online, pecs, gyor); the design shows native names (Budapest, Online) and needs a display-name map.
- City, event date, capacity and price have no authoring UI, and an 'Esemény' cannot be created in the app at all (server requires a date the editor cannot set). Both frames are therefore seed-shaped data; the real page today is tag + title + coach + body.
- Cover pipeline: seed covers are blank 320x180 placeholders and real uploads are arbitrary colour photos cropped 16:9. The Pulse look (monochrome grade, feathered true-black edges, 4:3 bleeding from the top) needs an owner decision and an image-processing step, or a fallback treatment for ungraded photos.
- Geist has no italic cut: the document renderer's italic runs need a decision (synthesised oblique, another emphasis, or dropped).
- Title needs CSS text-wrap: balance and a size step for long titles (up to 140 characters, unclamped).
- Seed bugs noted by the inventory still stand: price 1200000 renders as 1 200 000 Ft; the seed title says 'szeptember 14.' (drawn here as 'október 30.').
- 'Belépés' is drawn three ways across the public screens (lime pill on the feed, text link on the coach profile and here) — one rule is needed.
- In the payload but not rendered, and not drawn: coach headline in the coach row, event time of day, report-this-post.

## admin
- No sample 'user upload' for a submission: the seed's media file is a blank 320 x 180 placeholder. The review needs one honest still of the movement (rear-foot-elevated split squat, dumbbells, bench).
- No hero-size admin object: only the 512 px tab icon exists. A dedicated shield render in the hero-photo/graphite grade would lift frame 1.
- No copy that names primary vs secondary muscles in the review (today the chips differ only by style).
- The account list is a 640 px table that scrolls sideways on a phone; the two-line row layout and a sort-key row outside a table header do not exist in the front end. 'Kliensek' is not sortable.
- Queue ages come from the browser's Intl ('3 nappal ezelőtt') and registration dates from the browser locale — no i18n key, so they will not follow the app language.
- Failure states have no UI at all: figures failed, queue request failed, decision failed (all noted as gaps in the inventory) — no message, no retry.
- The waiting count and the list come from different queries, so '3 várakozik' over two rows is possible; the design assumes they agree.
- The section switch does not change the URL — the 'scrolled, Fiókok selected' state of frame 3 cannot be deep-linked or restored after a refresh.

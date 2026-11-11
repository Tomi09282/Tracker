# Deviations — where the app knowingly differs from a frame, or a frame is silent

Every entry is a decision taken so that work never waits, written down so the owner can rule on it
afterwards (PLAN.md Q4 default: behaviour wins, the look follows the frame as far as behaviour allows).
Nothing here is final until its status says `ruled`.

How this file grows:

- the integrator adds the plan's own guesses (below);
- a package lists its deviations in `pkg/<id>/handoff.json`; the integrator copies them here at the merge;
- `pulse-i18n apply` appends every `copyQuestions` entry of a patch (a place where no string is drawn and
  none was invented — R22).

One entry = one `## DEV-<n>` block with the same five lines. Append only; never renumber.

## DEV-001 — Zero insets, and screens wider than 430 pt

- Source: PLAN.md R21 (no frame is wider than 402 pt and none is drawn with zero insets)
- Package: F11 (shell), every screen package
- The frames show: 402 pt wide, insets 62 / 34.
- What the app does: with zero insets the floors are tokens — top 12 px, bottom 8 px. Above 430 pt a
  screen with no desktop layout today is a centred 430 column. The six files that have desktop behaviour
  today (`AdminPage`, `AdminShell`, `StyleStudioPage`, `ChatPanel`, `ClientDetailPage`, `CoachDashboard`,
  plus the bar's desktop dock) keep it, in Pulse skin, proven against a 1280 px baseline. The Cmd+K
  palette is kept and minimally restyled.
- Status: open — a guess of the plan, in force until the owner rules.

## DEV-002 — The player on a small phone (360 x 640, offline line showing)

- Source: PLAN.md Q7, default (a)
- Package: S-workout
- The frames show: `workout-2` at 402 x 874; the drawn content is about 680 pt tall, the room on the
  small phone is about 560 pt.
- What the app does: the figure gives way first, then the secondary meta line. The exercise name, the
  set target, the check control and the rest line never move.
- Status: open — the default of Q7; an answer in `.pulse/owner-answers.md` replaces it.

## DEV-003 — Numbers that change, set in the display face

- Source: the F1.2 glyph check (`pkg/_int/proofs/F1.2/README.md`); PLAN.md 3.3 "If the glyph check
  fails" and section 10, row "Big Shoulders Display ships tabular figures"
- Package: F1 (step F1.4), F10 (`Numeral`, `CountUp`), S-workout (rest and interval clocks), S-coins
- The frames show: numerals in Big Shoulders Display. A frame is a still, so it cannot show what the
  check found: this face has no tabular figures ("1" is 0.237 em wide, "0" is 0.440 em at weight 700,
  and `tabular-nums` changes nothing — the font has no `tnum` feature). The successor family the plan
  names, `@fontsource-variable/big-shoulders`, is the same and a wider cut; it was checked and not
  installed. The letters ő ű Ő Ű are present in all three faces.
- What the app does: keeps Big Shoulders Display (ruling R8, the family of all 59 frames). A number
  that stays as it is reads exactly as drawn. A number that CHANGES on screen in this face — the rest
  and interval countdowns, a rolling count — gets fixed-width digit cells from `Numeral` (the stand-in
  the plan names); until that lands, such a number jumps sideways on a tick once F1.4 has re-pointed
  the family (three ticking sites and eleven still ones pair `tabular-nums` with the display face
  today — listed in the proof).
- Status: ruled by the orchestrator on 2026-10-14 (recorded in `.pulse/owner-answers.md`, row DEV-003),
  not yet by the owner, who is informed and may overrule: Big Shoulders Display stays the display face
  everywhere; a number that changes on screen in it gets fixed-width digit cells from `Numeral`
  (F10); until then a sideways jump of a ticking number on a hybrid screen is accepted; the glyph
  check counts as passed for "F1.4 is made only if the glyph check passed". F1.4 was made on that
  ruling, one commit after F1.5 (whose message still says it was held). Undoing it is one
  `git revert` of the F1.4 commit and an `npm ci`.

## DEV-004 — S-nutrition: every gram figure

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-nutrition/i18n.patch.json`
- Package: S-nutrition
- The frames show: `nutrition-1` — no string is drawn at this place.
- What the app does: the frames write the unit with a space ('60 g', 'cél 180 g'); the live screen wrote '60g'. The frames' spacing is taken, also in the result line ('g P /100 g').
- Status: open — a copy question; nothing was invented.

## DEV-005 — S-nutrition: macro over target

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-nutrition/i18n.patch.json`
- Package: S-nutrition
- The frames show: `nutrition-1` — no string is drawn at this place.
- What the app does: the old per-macro warning glyph is dropped (Pulse: no glyphs on the instrument); the figure and its bar turn warning instead.
- Status: open — a copy question; nothing was invented.

## DEV-006 — S-nutrition: calorie meter without a target

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-nutrition/i18n.patch.json`
- Package: S-nutrition
- The frames show: `nutrition-1` — no string is drawn at this place.
- What the app does: with no target for the date the calorie bar is left out (the kit bar would draw a 1 pt sliver = 0 % of nothing); the figure carries the unit and the no-target sentence stands under the day line.
- Status: open — a copy question; nothing was invented.

## DEV-007 — S-coach-plans: PlanListPage 'Új terv' (POST /plans refused)

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-coach-plans/i18n.patch.json`
- Package: S-coach-plans
- The frames show: no string is drawn at this place.
- What the app does: A failed create shows no message today and none is drawn in coach-plans-1 / coach-plans-2; a message would be new copy. Kept silent until the owner decides.
- Status: open — a copy question; nothing was invented.

## DEV-008 — S-workout: the hero toggle Videó / Izomtérkép when inert (no taxonomy)

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md (PLAN.md Q4: behaviour wins)
- Package: S-workout
- The frames show: the toggle is drawn in the header line as in workout-1 / -2; the inert state is not drawn.
- What the app does: the inert toggle is aria-disabled in the kit's 40 % off ink (the old screen showed it at full ink).
- Status: open — needs a ruling.

## DEV-009 — S-workout: the interval timer toggle on circuit / EMOM / AMRAP members

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md (PLAN.md Q4: behaviour wins)
- Package: S-workout
- The frames show: not drawn.
- What the app does: a second TextLink "Időzítő" left of the hero toggle, 24 apart.
- Status: open — needs a ruling.

## DEV-010 — S-workout: the interval stage (8 sub-states)

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md (PLAN.md Q4: behaviour wins)
- Package: S-workout
- The frames show: not drawn.
- What the app does: in the hero under the title: one 48 pt line (countdown Numeral, phase word in its phase ink, three bare icon buttons), the 4 pt line (lime while working), the round / next line; idle, done and the interruption prompt carry the lime pill.
- Status: open — needs a ruling.

## DEV-011 — S-workout: one lime lamp while the interval stage shows its pill

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md (PLAN.md Q4: behaviour wins)
- Package: S-workout
- The frames show: not drawn.
- What the app does: the active set row then draws its ring instead of the lime check; the ring still checks.
- Status: open — needs a ruling.

## DEV-012 — S-workout: a failed check (offline / server error / 409)

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md (PLAN.md Q4: behaviour wins)
- Package: S-workout
- The frames show: not drawn.
- What the app does: a danger NoticeLine over the fields and the check cell with ONE action: Újra (offline, error) or Visszavonás (409, void); the row keeps its height and its typed values.
- Status: open — needs a ruling.

## DEV-013 — S-workout: a withdrawn (voided) set

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md (PLAN.md Q4: behaviour wins)
- Package: S-workout
- The frames show: not drawn.
- What the app does: numerals in text-3 with no lock, a hairline through the row, no check control, "Visszavonva" right-aligned (in de "Zurückgenommen" lies over the reps figure).
- Status: open — needs a ruling.

## DEV-014 — S-workout: an exercise complete on the switcher

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md (PLAN.md Q4: behaviour wins)
- Package: S-workout
- The frames show: not drawn.
- What the app does: a 16 pt lime tick after the full count.
- Status: open — needs a ruling.

## DEV-015 — S-workout: the undo pill after a normal check (E21 E)

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md (PLAN.md Q4: behaviour wins)
- Package: S-workout
- The frames show: no undo pill is drawn; the set row is tap-to-check (variants.json E21 live:false).
- What the app does: the 6 s Visszavonás pill is gone with hold-to-confirm and swipe-weight: a normal check can be taken back only after a 409, where the void is still reachable. Flag for the owner.
- Status: open — needs a ruling.

## DEV-016 — S-compose-hub: unpublishing the profile has no confirmation

- Source: docs/pipeline/pulse/pkg/S-compose-hub/handoff.json (PLAN.md Q4: behaviour wins)
- Package: S-compose-hub
- The frames show: compose-hub-2 draws the Profil sheet with the danger unpublish row; no confirmation is drawn.
- What the app does: the unpublish row acts at once, as the screen note requires; the kit rule "destructive = ConfirmSheet" is not applied here. The sheet stays open after publish / unpublish so the wentDark / refusal line is read where it was raised.
- Status: open — needs a ruling.

## DEV-017 — S-compose-hub: the gate states (guidelines, too new, no profile, takedown, account blocker)

- Source: docs/pipeline/pulse/pkg/S-compose-hub/handoff.json (PLAN.md Q4: behaviour wins)
- Package: S-compose-hub
- The frames show: not drawn.
- What the app does: one NoticeLine between the title and the hero; a gate with its own action takes the lime pill and Új bejegyzés becomes the trailing text link of the Bejegyzések head (also for the account blocker, which draws no notice). With no profile or after a takedown the identity row is absent and the title stands alone.
- Status: open — needs a ruling.

## DEV-018 — S-compose-hub: withdrawn and removed post rows

- Source: docs/pipeline/pulse/pkg/S-compose-hub/handoff.json (PLAN.md Q4: behaviour wins)
- Package: S-compose-hub
- The frames show: only live and draft rows.
- What the app does: a withdrawn or removed post's caption carries the off dot.
- Status: open — needs a ruling.

## DEV-019 — S-compose-hub: the refusal line fills its version / date

- Source: docs/pipeline/pulse/pkg/S-compose-hub/handoff.json (fix while rewriting)
- Package: S-compose-hub
- The frames show: not drawn.
- What the app does: the sheet's refusal line passes version / when to compose.reason.*, so no raw {{version}} / {{when}} placeholder prints any more.
- Status: open — needs a ruling.

## DEV-020 — S-compose-hub: old decoration dropped

- Source: docs/pipeline/pulse/pkg/S-compose-hub/handoff.json (screen note: safe to drop)
- Package: S-compose-hub
- The frames show: none of it.
- What the app does: the kind glyph tiles, the section glyph tile, the gate glyphs, the globe / eye-off glyphs, the success wash of live rows and the Gauge donut are gone; the filter is ChipRow + Segment with the ink mark (as the frame and kit chipRow({ink:true}) draw), Több is a non-selecting Segment; the four-state split is local to the page.
- Status: open — needs a ruling.

## DEV-021 — S-coins: the way back and the view switch semantics

- Source: docs/pipeline/pulse/pkg/S-coins/deviations.md #1, #3 (PLAN.md Q4: behaviour wins)
- Package: S-coins
- The frames show: the "‹ PROFIL" eyebrow and a three-cell switch; no semantics.
- What the app does: the back control keeps `history.back()` (the page is also opened from the command palette) and its accessible name is now the visible "Profil" instead of "Vissza"; the three views are the kit's Segmented radiogroup (role radio, roving tabindex, arrow keys) instead of tablist / tab.
- Status: open — needs a ruling.

## DEV-022 — S-coins: the balance-change feedback

- Source: docs/pipeline/pulse/pkg/S-coins/deviations.md #2, #9, #10
- Package: S-coins
- The frames show: the EGYENLEGED eyebrow over a still giant figure.
- What the app does: for 2.6 s after a change the signed delta takes the eyebrow slot (lit for an earning, eyebrow ink for a spend, never danger) and the giant rolls from the previous value (instant under reduced motion); a failed wallet read shows an em dash in the pending tone, never 0; loading is a block at the giant's ink box and ListRowSkeletons for the lists.
- Status: open — needs a ruling.

## DEV-023 — S-coins: the affordable price (one-pill rule)

- Source: docs/pipeline/pulse/pkg/S-coins/deviations.md #5, #6
- Package: S-coins
- The frames show: only the quiet price (coin + mono figure) and the owned "Megvan" row.
- What the app does: an unaffordable price stays a live quiet TextLink (it answers 409 with the real numbers); an affordable price is the small lime pill. Two affordable items would show two pills. Unreachable today (after Q2 no purchasable item is listed for any account); proven only on the coins-store-affordable fixture.
- Status: open — needs a ruling.

## DEV-024 — S-coins: Q2 hides the frame's second store row

- Source: docs/pipeline/pulse/pkg/S-coins/deviations.md (Q2 section), owner-answers Q2
- Package: S-coins
- The frames show: coins-1 with two store rows (Aurora owned, Ember at 250 with the quiet price).
- What the app does: theme packs the member does not own are not listed, so user@ sees Aurora alone and the closing rule sits at y 500; coins-1 is "structure" on live data. The Ember row is shown 1:1 only on the coins-store-priced fixture, which gives the second recorded item a hypothetical non-theme sku (feature.ember). Whether R26 accepts that hypothetical catalogue data is open.
- Status: open — needs a ruling.

## DEV-025 — S-coins: old decoration removed

- Source: docs/pipeline/pulse/pkg/S-coins/deviations.md (removed on purpose)
- Package: S-coins
- The frames show: none of it.
- What the app does: the Gauge arc round the balance, the two SummaryTiles (keys coins.weekCaption / coins.spentCaption removed), the per-item store glyphs and the trophy glyph are gone; achievements carry the medal raster (lit = earned, idle at 45 % = locked); E25 B-E and E26 A are retired (variants.json).
- Status: open — needs a ruling.

## DEV-026 — S-coins: Bolt, Eredmények, Kimutatás - a failed GET of the store / achievements / statement

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-coins/i18n.patch.json`
- Package: S-coins
- The frames show: no string is drawn at this place.
- What the app does: Kept as today (Q4): a failed store or statement shows its empty copy, failed achievements show '0 / 0 feloldva' and the footnote. No error copy exists and none is drawn; a message would be new copy.
- Status: open — a copy question; nothing was invented.

## DEV-027 — S-coach-dashboard: the teams sheet (Csapatok row)

- Source: docs/pipeline/pulse/pkg/S-coach-dashboard/deviations.md #1 (PLAN.md Q4: behaviour wins)
- Package: S-coach-dashboard
- The frames show: the CSAPATOK ledger row with a chevron; the sheet behind it is not drawn.
- What the app does: the row opens the Pulse Sheet "Csapatok" with the underline field "Csapat neve" and "Létrehozás"; submitting empties the field and keeps the sheet open (as before). "Létrehozás" is a strong text link, not a lime pill, because the page's Új kód pill stays on screen under the scrim (one lime pill). Disabled while the field is empty or offline.
- Status: open — needs a ruling.

## DEV-028 — S-coach-dashboard: the pre-made accounts sheet

- Source: docs/pipeline/pulse/pkg/S-coach-dashboard/deviations.md #2
- Package: S-coach-dashboard
- The frames show: the "Előre létrehozott fiókok" row with a chevron; the sheet is not drawn.
- What the app does: the row opens the Pulse Sheet with the e-mail field, its hint and "Fiókok létrehozása" (a strong text link, same reason as DEV-027). After success the temporary passwords are listed and the sheet refuses to close by scrim, Escape, drag or the close glyph until "Bezárás" is pressed; the copied text is still "e-mail / password" while the row shows the name.
- Status: open — needs a ruling.

## DEV-029 — S-coach-dashboard: the archive confirmation

- Source: docs/pipeline/pulse/pkg/S-coach-dashboard/deviations.md #3
- Package: S-coach-dashboard
- The frames show: the archive glyph on every roster row; the confirmation is not drawn.
- What the app does: the glyph opens the Pulse Sheet "Biztosan archiválod?" with the 28 pt monogram, the sentence with the name, "Archiválás" as a danger text link (busy in flight, disabled offline) and "Mégse"; never fires from the row. Composed as Sheet + TextLinks, not ConfirmSheet (no disabled state, no monogram). The archive glyph is 24 pt at stroke 1.75 where the frame draws 20 pt at 1.5 (R-S-coach-dashboard-01 open); the German sheet title is cut with an ellipsis by the one-line kit Sheet header.
- Status: open — needs a ruling.

## DEV-030 — S-coach-dashboard: the forbidden page

- Source: docs/pipeline/pulse/pkg/S-coach-dashboard/deviations.md #4
- Package: S-coach-dashboard
- The frames show: not drawn.
- What the app does: a member at /coach gets the kit EmptyState as the page's h1 (left-aligned, no icon, no action) on Screen top="root"; the old Users disc is gone.
- Status: open — needs a ruling.

## DEV-031 — S-coach-dashboard: undrawn data states

- Source: docs/pipeline/pulse/pkg/S-coach-dashboard/deviations.md #5
- Package: S-coach-dashboard
- The frames show: only the filled dashboard and the code-ready sheet.
- What the app does: loading = a block at the numeral's cap height and one for the bar, ledger dashes with aria-busy, three row skeletons; empty roster = no hero, the left-aligned empty state; a failed roster read = auth.errors.generic + Újra; failed teams / codes reads print the dash, never 0 (before: 0); no live code = no code row and no empty copy; offline = Új kód disabled, every Visszavonás and archive glyph disabled, navigation live.
- Status: open — needs a ruling.

## DEV-032 — S-coach-dashboard: kept quirks

- Source: docs/pipeline/pulse/pkg/S-coach-dashboard/deviations.md #6
- Package: S-coach-dashboard
- The frames show: none of it.
- What the app does: unchanged behaviour, listed so nobody reads it as new - the roster is ordered by team then name; expired codes still count as live; revoke is one tap without confirmation and all Visszavonás links go busy together; failed mint / revoke / archive / team create / account creation show nothing (no copy, R22); "átadásra vár" stays until the client changes the password.
- Status: open — needs a ruling.

## DEV-033 — S-exercise-detail: the moderation notice

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-1
- Package: S-exercise-detail
- The frames show: no moderation notice.
- What the app does: a rejected submission shows a danger NoticeLine ("Ezt a beküldést elutasították") with the moderator's reason as its detail line, never cut; a pending one an info NoticeLine ("Beküldve — moderálásra vár."); its own block directly under the pushed header.
- Status: open — needs a ruling.

## DEV-034 — S-exercise-detail: uploaded image or video

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-2
- Package: S-exercise-detail
- The frames show: no uploaded media (the mannequin is the picture).
- What the app does: the first upload is a UserPhoto 16:9 block between the header (or notice) and the stage, full content width, no radius; with an image Eszköz is not rendered; no upload = no block (the old dumbbell glyph is gone). A video keeps the one-way player: the first frame as poster with one bare Play glyph centred (no ring, no scrim), native controls from the first tap. Open owner questions: is a bare play glyph legible over an arbitrary poster, and may the image stay a 16:9 block between the header and the stage.
- Status: open — needs a ruling.

## DEV-035 — S-exercise-detail: the language mark

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-3
- Package: S-exercise-detail
- The frames show: the meta line "Kezdő · Erő" only.
- What the app does: when the exercise text is not in the interface language the language codes ("EN / HU", or "EN") follow as the meta line's last item, mono, in the warning ink - text, no box (was an amber outlined chip).
- Status: open — needs a ruling.

## DEV-036 — S-exercise-detail: description only

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-4
- Package: S-exercise-detail
- The frames show: not drawn.
- What the app does: no steps but a description = one paragraph under a strong rule, no heading (no heading word exists in the copy, R22).
- Status: open — needs a ruling.

## DEV-037 — S-exercise-detail: no muscle tagged

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-5
- Package: S-exercise-detail
- The frames show: not drawn.
- What the app does: no stage, no figure, no switch; Eszköz becomes a ruled section of its own (strong rule, eyebrow, the same rows).
- Status: open — needs a ruling.

## DEV-038 — S-exercise-detail: not found

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-6
- Package: S-exercise-detail
- The frames show: not drawn.
- What the app does: not found / failed read / not allowed = the kit EmptyState h1 "Nincs találat" under the pushed header, whose real "Gyakorlatok" link is the way out; the old secondary button is not repeated. One state for three causes and no retry is the known defect, unchanged.
- Status: open — needs a ruling.

## DEV-039 — S-exercise-detail: loading

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-7
- Package: S-exercise-detail
- The frames show: not drawn.
- What the app does: the real back row, a display-line and a meta-line block, three key-line blocks, then one ruled section of blocks; no figure block. Known defect unchanged: /library/abc stays loading.
- Status: open — needs a ruling.

## DEV-040 — S-exercise-detail: equipment without a still

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-8
- Package: S-exercise-detail
- The frames show: the equipment row with a 48 pt still.
- What the app does: a slug without a still (medicine-ball, stability-ball, foam-roller, other) is the name alone; in a list where another row has a still it keeps the same text edge. EQUIPMENT_STILL is the only source.
- Status: open — needs a ruling.

## DEV-041 — S-exercise-detail: the stage grows with many muscles

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-9
- Package: S-exercise-detail
- The frames show: a 404 pt stage for three labels.
- What the app does: the stage is at least 404 tall and grows; Eszköz stands on the figure's foot line while the key is short and moves down when the key and caption need the room (never overlaps).
- Status: open — needs a ruling.

## DEV-042 — S-exercise-detail: the other-side caption copy

- Source: docs/pipeline/pulse/pkg/S-exercise-detail/deviations.md DEV-10
- Package: S-exercise-detail
- The frames show: "További célizmok a elöl nézetben." (frame 2).
- What the app does: printed exactly as the product prints it (the muscleMap.alsoOnOtherSide key of the mannequin lane); the grammar ("a elöl") is a copy question, not fixed here.
- Status: open — needs a ruling.

## DEV-043 — S-compose-post: the save control and the create pill

- Source: docs/pipeline/pulse/pkg/S-compose-post/handoff.json (PLAN.md Q4: behaviour wins)
- Package: S-compose-post
- The frames show: compose-post-1 a quiet trailing save word on the push row; compose-post-2 the end pill Piszkozat létrehozása, the h1 alone on its line.
- What the app does: the save stays a real control - on an existing post the row's trailing word (Mentés dirty / Mentve disabled, busy while saving), on a new post the end pill Piszkozat létrehozása (the old header pill beside the h1 is gone). Piszkozat létrehozása is enabled on an empty form as today; the server refuses it. Esemény is drawn and selectable with no date field (PLAN 4.3).
- Status: open — needs a ruling.

## DEV-044 — S-compose-post: the cover is feathered

- Source: docs/pipeline/pulse/pkg/S-compose-post/handoff.json (decision; kit gap G-data 11)
- Package: S-compose-post
- The frames show: compose-post-1 draws the 4:3 sample still whole (320 x 240) glowing out of the black inside the 16:9 slot; the body script's note says a real upload fills the slot as a plain rectangle.
- What the app does: the cover is UserPhoto feather, the honest 16:9 crop of the upload with soft edges, as on the post page and the feed (the lamp cap is cut about 33 px at the top of the sample). The slot is masked in the geometry comparison (R2). Without a cover: Field Képleírás + a FilePick TEXT LINK (Kép választása / Feltöltés…), not a pill, so Közzététel stays the one lime pill.
- Status: open — needs a ruling.

## DEV-045 — S-compose-post: the kind choice is a lime-marked radiogroup

- Source: docs/pipeline/pulse/pkg/S-compose-post/handoff.json
- Package: S-compose-post
- The frames show: compose-post-2 three kind words with a lime mark.
- What the app does: ChipRow role=radiogroup with Chip radios, roving tabindex and arrow keys (the old Segmented's keyboard behaviour); Segmented draws only an ink mark, so it is not used. The kind glyphs, the Pencil / image tiles, the Globe / EyeOff / RotateCcw lifecycle glyphs, the gone state's Trash2 icon and its second back link are dropped (kindIcons.ts stays for ComposePage).
- Status: open — needs a ruling.

## DEV-046 — S-compose-post: undrawn states

- Source: docs/pipeline/pulse/pkg/S-compose-post/handoff.json (PLAN.md Q4)
- Package: S-compose-post
- The frames show: not drawn.
- What the app does: the stale Sheet's action is a strong TextLink, not a lime pill (Közzététel stays visible under the scrim); removed = danger NoticeLine under the header + disabled fields, no cover block, no lifecycle; taken down = only the Visszaállítás row; refusals = warn NoticeLine between the text and the autosave row; markdown refusal = compact danger NoticeLine. Loading, the stale sheet, refusals, taken down, removed, cover upload and counter tones are not capturable yet (request R-S-compose-post-01) and are reported as structure.
- Status: open — needs a ruling.

## DEV-047 — S-compose-post: offline autosave reads "Mentés…"

- Source: docs/pipeline/pulse/pkg/S-compose-post/handoff.json (behaviour unchanged from the base build)
- Package: S-compose-post
- The frames show: not drawn; the prep expected the failed line.
- What the app does: TanStack Query holds the PUT while offline (networkMode online), so the autosave row reads Mentés… and the header save word shows busy dots until the network returns, exactly as the base build behaves.
- Status: open — needs a ruling.

## DEV-048 — S-client-detail-b: the Táplálkozás editor's undrawn states

- Source: docs/pipeline/pulse/pkg/S-client-detail-b/handoff.json deviations 1-5 (PLAN.md Q4)
- Package: S-client-detail-b
- The frames show: client-detail-2 one open active diet, seven alike day cells, meals with their items and search lines.
- What the app does: a cycle day not created yet has no tone of its own and shows the Nap hozzáadása link; with several diets the open editor follows its own row and a closed diet's caret points down; search results are rows under the meal's search line (name + kcal / 100 g in mono) and the SearchField brings its own clear button; a picked food is a row with the hidden-label grams field (a plain 64 pt field, not Field unit='g': the content-sized input failed the targets probe) and the Hozzáadás text link; a draft diet is the info notice line + the one pill Aktiválás (code only, no recording holds a draft).
- Status: open — needs a ruling.

## DEV-049 — S-client-detail-b: empty and thin states

- Source: docs/pipeline/pulse/pkg/S-client-detail-b/handoff.json deviations 6, 7, 10
- Package: S-client-detail-b
- The frames show: not drawn.
- What the app does: no diet = a left-aligned EmptyState whose action is the one pill Új étrend (the Apple icon is gone); no history = EmptyState without the calendar icon; a thin series = the exercise name over the not-enough sentence, no box; with sessions only, Edzések keeps its section rule 16 under the switch.
- Status: open — needs a ruling.

## DEV-050 — S-client-detail-b: Haladás charts up to three exercises

- Source: docs/pipeline/pulse/pkg/S-client-detail-b/handoff.json deviations 8, 9 (kept behaviour)
- Package: S-client-detail-b
- The frames show: client-detail-3 two charts (its board note: the third left out for want of sample data); no trophy glyph on the record rows.
- What the app does: the page still charts up to three distinct exercises, so a third chart stands above Rekordok; the per-record trophy glyph is gone as drawn.
- Status: open — needs a ruling.

## DEV-051 — S-client-detail-b: live number formats kept 1:1

- Source: docs/pipeline/pulse/pkg/S-client-detail-b/handoff.json deviation 11, i18n key coaching.nutrition.itemLine (untranslated)
- Package: S-client-detail-b
- The frames show: '60g · 222 kcal · 8.1g P', record and session figures with decimal points and ISO dates (as the live app prints them; both board notes leave it to the owner).
- What the app does: the item line, the record and the session figures keep the live format (decimal point, glued units, ISO dates) in all three languages.
- Status: open — needs a ruling.

## DEV-052 — S-onboarding: Onboarding - GET /onboarding fails

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-onboarding/i18n.patch.json`
- Package: S-onboarding
- The frames show: no string is drawn at this place.
- What the app does: Kept as today (Q4): the skeleton stays, no message (no error copy exists, R22). common.retry with the query refetch would be the only existing string if the owner wants a way out.
- Status: open — a copy question; nothing was invented.

## DEV-053 — S-onboarding: Onboarding - Kész fails for another reason (network, server error)

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-onboarding/i18n.patch.json`
- Package: S-onboarding
- The frames show: no string is drawn at this place.
- What the app does: Kept as today: nothing is said and the pill is usable again. onboarding.saveError in the alert slot would be a reuse with a different meaning; not done without the owner.
- Status: open — a copy question; nothing was invented.

## DEV-054 — S-onboarding: steps 3 and 4 and the undrawn states composed from the kit

- Source: docs/pipeline/pulse/pkg/S-onboarding/deviations.md rows 1, 3-6, 8-10, 13 (PLAN.md Q4)
- Package: S-onboarding
- The frames show: onboarding-1 (step 5/5), onboarding-2 (1/5, saved), onboarding-3 (2/5, after a refused Kész); steps 3 and 4 are not drawn.
- What the app does: steps 3 (place + the 16 server equipment names as a wrapping ChipRow) and 4 (units, three underline Fields, sex) are composed from the same kit; the progress ring becomes the hero stage (eyebrow, static giant Numeral, SegmentBar as the progressbar); option cards become single-choice rows on hairlines without glyphs; field glyphs are gone; the note is the frame's multi-line TextArea (Enter breaks a line, maxLength 2000 kept); Vissza is a TextLink, Tovább / Kész the one lime pill; save states are the 20 pt status slot with compact NoticeLines; the required star is ink; a refused Kész keeps its jump and names the fields in a danger alert line (two lines when all four answers are missing). Loading is a skeleton in the screen's own shape. The route keeps no inbound door.
- Status: open — needs a ruling only where DEV-055..057 say so.

## DEV-055 — S-onboarding: sex options change role checkbox -> radio

- Source: docs/pipeline/pulse/pkg/S-onboarding/deviations.md row 2
- Package: S-onboarding
- The frames show: not drawn (step 4).
- What the app does: units and sex are single-choice rows with the tick / ring; the four sex options were Toggle chips with role checkbox behaving as a single choice and are now role radio (same names); a tap on the chosen one still keeps it.
- Status: open — needs a ruling (accessibility role change only).

## DEV-056 — S-onboarding: NumberStepper on an empty field

- Source: docs/pipeline/pulse/pkg/S-onboarding/deviations.md row 7
- Package: S-onboarding
- The frames show: the kit NumberStepper (48 pt figure, − / + on the line, quiet text-2 tick).
- What the app does: on an empty field + gives min and − now gives max (the kit's rule; before, − gave min); bounds unchanged (1-14, 10-240 step 5); the in-range tick is the frame's quiet tick instead of the green disc.
- Status: open — needs a ruling.

## DEV-057 — S-onboarding: frames captured on account M; two drawn values by fixture only

- Source: docs/pipeline/pulse/pkg/S-onboarding/deviations.md capture decisions; request R-S-onboarding-01
- Package: S-onboarding
- The frames show: a member (five tabs) with the note, the knee limitation on Óvatosan (onboarding-1) and an empty Hetente hány edzés? (onboarding-3).
- What the app does: no product change. The frames are captured on user@ (M) instead of the freeze's coach@ (C); C stays as the extra state onboarding-step5-coach. M's recording has the limitation on Kerülendő and 4 sessions per week, and pulse-fixture-check refuses the two edits, so onboarding-1 and -3 each differ by that one value (with the edits the captures equal the frames). work-packages.json fixtureFrames should also list onboarding-1.
- Status: open — fixture request R-S-onboarding-01.

## DEV-058 — S-notifications: the back label reads KEZDŐLAP for every viewer

- Source: docs/pipeline/pulse/pkg/S-notifications/deviations.md behaviour row 1
- Package: S-notifications
- The frames show: a push ScreenHeader with "‹ KEZDŐLAP" (notifications-1 / -2).
- What the app does: the back step stays `navigate(-1)` (the bell lives on Home and on `/coach`), labelled with the frame's KEZDŐLAP; the control's accessible name changes from "Vissza" to "KEZDŐLAP". A coach who came from `/coach` reads KEZDŐLAP but returns to `/coach`. A real fix needs both bells (NotificationBell and the coach dashboard, frozen for this package) to pass where they came from.
- Status: open — needs a ruling (product question).

## DEV-059 — S-notifications: undrawn states composed from the kit

- Source: docs/pipeline/pulse/pkg/S-notifications/deviations.md behaviour rows 2-6, states.json (PLAN.md Q4)
- Package: S-notifications
- The frames show: notifications-1 (arrival, 2 unread) and notifications-2 (empty) only.
- What the app does: the automatic mark-read on arrival and the frozen arrival count are unchanged; the numeral is static (no roll) and the lime lg pill is busy for one round trip, disabled (quiet grey primary) while offline. Settled, only-unread, nothing-unread, error, offline, mark-failed and loading are composed from the kit; the error retry is a 44 pt "Újra" TextLink under the error title (no second pill). The stat block is composed in the page (`data-kit="statBlock"`, 100 pt numeral slot + 16/22 body caption) because the kit StatBlock requires an eyebrow and a cap-13 caption; kit request: an optional label and a body caption. Loading (no capture tool can hold a GET open) and new-row-on-poll are verified by code review only.
- Status: open — kit and tool requests only.

## DEV-060 — S-notifications: glyphs removed with the frame

- Source: docs/pipeline/pulse/pkg/S-notifications/deviations.md "Removed on purpose"
- Package: S-notifications
- The frames show: no bell glyph or tinted disc above the numeral, no check in the pill, no read check on read rows; the message row glyph is a message circle.
- What the app does: follows the frame — the bell / struck bell, the pill's check and the read check are gone (read rows carry the age in text-2, unread rows the lime dot and the age in text-1); MessageSquare becomes MessageCircle. Nothing a user can do is lost.
- Status: closed — the frame wins.

## DEV-061 — S-notifications: notifications-1 captured on a fixture

- Source: docs/pipeline/pulse/pkg/S-notifications/deviations.md "Frame differences that stay", states.json
- Package: S-notifications
- The frames show: six rows of the two real notification kinds, no tab lit.
- What the app does: no product change. The recorded member inbox holds kinds no server code writes, so notifications-1 runs on a fixture with the frame's six rows (verdict matched-fixture, user@ = M); notifications-2 runs on demo.nagy.balazs (N, recorded empty list). The Kezdőlap tab is lit (Q6 = a, shell).
- Status: closed — capture decision.

## DEV-062 — S-admin: undrawn behaviour kept in Pulse forms

- Source: docs/pipeline/pulse/pkg/S-admin/deviations.md behaviour rows 1-4 and 6-11
- Package: S-admin
- The frames show: admin-1 (Moderáció, nothing open), admin-2 (a submission open), admin-3 (Fiókok) on a phone only.
- What the app does: the section tabs become the kit's `Segmented layout="cells"` radiogroup (role change only; the Moderáció option is named "Moderáció 3"); from 1024 px the sections are a `RowStack` rail beside an unboxed review pane (R21); the refresh control shows the kit's busy dots; the reject flow (Indoklás field, Elutasítás disabled until a reason, Mégse, no confirm) is kept 1:1 as links; a stale submission is a warn `NoticeLine`; missing instructions a warn line; the review follows the frame's order; muscles use `RoleKey`, equipment the 48 pt still; accounts become two-line rows with mono sort labels (KLIENSEK static; kit request R-S-admin-01).
- Status: closed — Pulse form of existing behaviour.

## DEV-063 — S-admin: silent failures kept (approve, figures)

- Source: docs/pipeline/pulse/pkg/S-admin/deviations.md behaviour rows 5 and 12
- Package: S-admin
- The frames show: no failure state for Jóváhagyás or for the figures.
- What the app does: as in the base, a failed approve shows nothing, and failed figures leave the hero, ledger, count and footer absent (the skeleton stands while the query client retries a 5xx twice). No copy exists for either.
- Status: open — known gap, needs copy and a ruling.

## DEV-064 — S-admin: Piactér reports stay expanded

- Source: docs/pipeline/pulse/pkg/S-admin/deviations.md behaviour row 13
- Package: S-admin
- The frames show: no Piactér tab (undrawn).
- What the app does: the moderation grammar without a new tap — the status filter as a bleeding `ChipRow`, each report a ruled block with subject, reason, reporters, mono date, the live-page link, the note and the snapshot, then Döntés with two fields, the one lime pill and the Elutasítás / Mégse links. The prep's collapsed variant needed an owner yes that was not asked.
- Status: open — owner ruling wanted: collapse the reports behind a row tap like Moderáció?

## DEV-065 — S-admin: AdminMetrics and its keys removed

- Source: docs/pipeline/pulse/pkg/S-admin/deviations.md "Removed on purpose"
- Package: S-admin
- The frames show: no donut, summary tiles or section icons.
- What the app does: `AdminMetrics.tsx` (imported nowhere) and its 14 `adminMetrics.*` keys, plus `admin.exercises`, `admin.media`, `admin.section.overview` (no reader) are removed through i18n.patch.json; the Gauge, tiles, CountUp and the section / status glyphs give way to the rolling `Numeral`, `SplitBar` + `SplitLegend`.
- Status: closed — the frame wins.

## DEV-066 — S-admin: frames captured on fixtures, admin-2 / -3 paired from taller captures

- Source: docs/pipeline/pulse/pkg/S-admin/deviations.md "Data that only fixtures reach", states.json, requests R-S-admin-02
- Package: S-admin
- The frames show: 19 users (15 / 3 / 1), 1656 exercises, 3 media, `@pelda.hu` owners, a barbell photo, a LETILTVA flag; admin-2 / -3 drawn already scrolled (switch at y 72).
- What the app does: no product change. The frame states replay recordings edited to the frame's figures (verdict matched-fixture; the dev DB answers 49 / 45 / 3 / 1, 1660, 4). The LETILTVA flag is drawn by the code but no recording holds a disabled account; the submitted image is the seed's blank upload. admin-2 / -3 are paired from 404 pt taller states cut at y 403 until pulse-shot gets a scroll step (R-S-admin-02).
- Status: open — tool request only.

## DEV-067 — S-compose-profile: undrawn states composed from the kit

- Source: docs/pipeline/pulse/pkg/S-compose-profile/deviations.md rows 1, 2 and 6
- Package: S-compose-profile
- The frames show: compose-profile-1 (the whole form, identity panel closed) and compose-profile-2 (identity panel open, a new handle typed) only.
- What the app does: create mode (no profile yet) uses the same kit - monogram "·" and the h1 "Profil létrehozása" until a name is typed, no identity line, the Felhasználónév field with its status line, the Város row, no public row, the pill "Profil létrehozása"; taken down (`removedAt` set) shows one danger NoticeLine "A profilodat levették", every field, word, the switch and Mentés disabled, the identity line plain text, Előnézet live; the rename refusal is a danger NoticeLine inside the panel under the warning. None of these is capturable from the recordings (pulse-fixture-check refuses a null profile, a numeric `removedAt`, a null `listedAt`): verdict structure.
- Status: closed — Pulse form of existing behaviour.

## DEV-068 — S-compose-profile: city row, switch outcomes, refusals and preview kept

- Source: docs/pipeline/pulse/pkg/S-compose-profile/deviations.md rows 3, 4, 5 and 9
- Package: S-compose-profile
- The frames show: the city row only inside the open identity panel (frame 2); the public switch row without outcomes; Előnézet as a text link.
- What the app does: the city stays behind the identity line (edit) or under the handle (create), saved by Mentés; the native `<select>` became the Város list row (value + chevron) opening the kit bottom Sheet with radio rows and the lime tick. The switch outcomes stay ("went dark" info NoticeLine with role status, the refusal danger NoticeLine with role alert); the refusal now fills `{{version}}` / `{{when}}` from the conflict instead of printing them raw (render-only fix, no key changed). The save refusal is a warn NoticeLine and the markdown refusal a danger NoticeLine under Előnézet (were tinted boxes). Előnézet toggles to "Előnézet elrejtése" and opens a ruled ELŐNÉZET section with DocRenderer.
- Status: closed — Pulse form of existing behaviour.

## DEV-069 — S-compose-profile: specialty words and counters

- Source: docs/pipeline/pulse/pkg/S-compose-profile/deviations.md rows 7 and 8
- Package: S-compose-profile
- The frames show: specialty words with the lime mark; the counters in two inks.
- What the app does: the words are kit `Chip`s without the check glyph (the mark carries the state), still `aria-pressed` toggle buttons inside the ChipRow's named `role="group"`; at the cap further taps do nothing; Több reveals the rest with no way back, as before. The bio counter turns warning past 90 % and danger past the cap (reads 0), as before; calm it is the frame's two inks, found in the translated string.
- Status: closed — the frame wins, behaviour kept.

## DEV-070 — S-compose-profile: inherited product gaps logged

- Source: docs/pipeline/pulse/pkg/S-compose-profile/deviations.md row 10
- Package: S-compose-profile
- The frames show: nothing for these cases.
- What the app does: a failed profile load still falls through to the empty create form (product gap 1), and flipping the switch / confirming a rename reloads the profile and drops unsaved edits (gap 5). Logic above the return, not changed.
- Status: open — owner ruling, later.

## DEV-071 — S-compose-profile: the "Erő" word is under the 44 pt target

- Source: docs/pipeline/pulse/pkg/S-compose-profile/deviations.md row 11, requests/R-S-compose-profile-01.json
- Package: S-compose-profile
- The frames show: "Erő" as a 25 pt word.
- What the app does: the kit Chip box is the word + 16, so "Erő" is a 41.5 x 44 target in Hungarian (en / de words are wide enough). Request R-S-compose-profile-01 asks for a 44 pt floor on Chip.
- Status: open — kit request.

## DEV-072 — S-style-studio: the studio shows E1 as dormant, the frames draw it live

- Source: docs/pipeline/pulse/pkg/S-style-studio/deviations.md rows SS-1 to SS-6 and SS-9
- Package: S-style-studio
- The frames show: E1 as a live element - "aktív" in the hero, the lime dot after the giant D and after the active row letter, the glowing "Save" pill at 150 % and five unlit Save pills in the row stages, "Legyen ez" in text-1, `studio.commitNote`, and (style-studio-2) the "E1 mostantól C változatot használ" toast band.
- What the app does: under Q3 (a) all 27 catalogue entries are `live: false` on pulse-redesign and F20 retired the E1 Demo, so the hero and the section head read "nem használt", the hero shows `studio.noPreview` beside the letter, no lime dot, no E1 stage, `studio.inertExplain` (4 lines, everything below 18 pt lower at 402), "Legyen ez" disabled at 40 %, and no save can be fired, so the toast band cannot be reached. Elements that still have a Demo draw the hero and the five stages in the frame's places (state studio-e2-stages). style-studio-2 is reached by the package's override (E1 = C in the first styles read, scrolled to the end); both frames carry the verdict structure.
- Status: closed — Q3 (a), honest dormant studio.

## DEV-073 — S-style-studio: the "Ez az aktív" tick is the kit CheckMark

- Source: docs/pipeline/pulse/pkg/S-style-studio/deviations.md row SS-7
- Package: S-style-studio
- The frames show: a 20 pt lime tick, stroke 2, before "Ez az aktív".
- What the app does: the kit `CheckMark` (24 pt, stroke 2.5) + the words; the row carries `aria-current`; the old disabled "Ez az aktív" button is now a state, not a control.
- Status: closed — kit part used.

## DEV-074 — S-style-studio: open owner questions (load retry, copy conflict)

- Source: docs/pipeline/pulse/pkg/S-style-studio/deviations.md rows SS-10 and SS-11
- Package: S-style-studio
- The frames show: neither case.
- What the app does: a failed styles read keeps today's behaviour (no giant letter, `studio.noPreview`, no active row, EmptyState, no retry; `common.retry` exists if a retry is wanted). `studio.noPreview` ("the components read it") and `studio.inertExplain` ("no component reads it") can stand on one screen and contradict each other; raised, not changed (R22).
- Status: open — owner ruling.

## DEV-075 — S-style-studio: the desktop element list (R21)

- Source: docs/pipeline/pulse/pkg/S-style-studio/deviations.md rows SS-8 and SS-12
- Package: S-style-studio
- The frames show: the phone only; the element rail with the selected word in text-1 and the lime mark.
- What the app does: on a phone the rail is drawn as in the frame and every option's accessible name ends in "— nem használt"; at 1024 pt and up the rail becomes a 27-row `RowStack` / `ListRow` radiogroup column (256 wide) beside the workspace (CSS `hidden lg:flex` beside a `lg:hidden` rail; both radiogroups are in the DOM, one is displayed).
- Status: closed — R21 keeps the desktop layout.

## DEV-076 — S-workout: the rest band on the docked layer, 137 pt tall (fix round 2)

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md "Fix round 2" rows F2-1 and F2-2
- Package: S-workout
- The frames show: (workout-2) the rest band painted after the chrome, its 4 pt line in the flat accent, the band 137 pt tall with the table's closing rule at y 616 and the active row's two 1 pt field edges under it.
- What the app does: `RestTimer.tsx` puts the band on `--z-dock` (above the tab bar's fade, below sheets and toasts), so the line reads (203,255,46) on all four pixel rows; its top padding is 15 pt (`pt-[15px]`, annotated `token-lint-disable` with the frame's measured 617 -> 632), so the band is the frame's 137 and the closing rule is back on 616. This restores the frame; the one off-grid value is the only deviation.
- Status: closed — matches workout-2.

## DEV-077 — S-workout: the 360 pt set list (unit dropped, smallest scroll, top fade) (fix round 2)

- Source: docs/pipeline/pulse/pkg/S-workout/deviations.md "Fix round 2" rows F2-3 and F2-4
- Package: S-workout
- The frames show: only 402 pt; no frame is drawn at 360 x 640 and none is scrolled.
- What the app does: below 376 pt viewport width the previous value drops its unit ("72,5 × 8"; the KG column head names it) instead of ellipsising the reps; the set list scrolls to the smallest offset that shows the whole active row (recomputed from the top), and once scrolled its top 16 pt fade out (a mask) instead of slicing a row at the head rule. At scroll 0 — every frame — there is no mask, and the 402 captures differ from the earlier ones only in the anti-aliasing of the "kg" glyphs.
- Status: closed — no frame is affected (360 x 640 only).

## DEV-078 — S-admin: the opened submission's blank upload stands on the skeleton block (fix round 2)

- Source: docs/pipeline/pulse/pkg/S-admin/deviations.md row 14, request R-S-admin-03
- Package: S-admin
- The frames show: (admin-2) a 354 x 199 black-and-white photograph of a barbell plate at 24 / 371; the admin-2 body script draws a blank still as `skel(P.cw, 199)`.
- What the app does: the upload's rectangle stands at the frame's place and size (24 / 370.7 / 354 x 199.1 pt) on the kit skeleton block (`--skeleton-base`, radius 2, static); an opaque photograph covers it completely. The demo seed's upload is a blank 92-byte WebP and a fixture cannot answer a binary body, so the photograph itself is not shown (R-S-admin-03). The capture's `boxed` probe counts this backing once on admin-2, admin-2-tall, admin-rejecting and admin-w1280.
- Status: open — owner ruling: keep the backing (the photo's own backing, not an enclosure) or remove it and accept a hole until R-S-admin-03 serves a real photograph.

## DEV-079 — S-admin: wide moderation list chevrons point to the review (fix round 2)

- Source: docs/pipeline/pulse/pkg/S-admin/deviations.md row 15
- Package: S-admin
- The frames show: only the phone (down / up chevrons of admin-1 / -2).
- What the app does: at 1024 px and up the list rows' chevrons point right, toward the review beside the list; the chosen row's chevron is in ink like its name, the others text-3. The phone is unchanged.
- Status: closed — no frame is affected.

## DEV-080 — S-workout-finish: the Befejezés link goes with the header line at 360 x 640 (Q7)

- Source: docs/pipeline/pulse/pkg/S-workout/finish-handoff.json DEV-S-workout-finish-01
- Package: S-workout (round S-workout-finish, D3)
- The frames show: nezetek/workout-finish and nezetek/workout-finish-confirm (design round A, Figma 161:2 / 171:2).
- What the app does: The Befejezés link lives in the header line, so it goes with the header line when the Q7 default takes it: at 360 x 640 only while the rest band AND the offline line are both on screen (workout-law-rest-offline.w360, workout-offline-inflight.w360). The link is back as soon as the rest ends or the network returns. While offline a finish would fail anyway (not queued).
- Why: Q7 order (figure first, then the header line) is the owner's rule for this column; the finish is not a set control and must not push the active check out of reach.
- Status: open - owner ruling: the Q7 order also takes the Befejezés link at 360 x 640 with rest + offline (the finish would fail offline anyway).

## DEV-081 — S-workout-finish: no header actions while an interval block runs

- Source: docs/pipeline/pulse/pkg/S-workout/finish-handoff.json DEV-S-workout-finish-02
- Package: S-workout (round S-workout-finish, D3)
- The frames show: nezetek/workout-finish and nezetek/workout-finish-confirm (design round A, Figma 161:2 / 171:2).
- What the app does: While an interval block is RUNNING the header actions (Időzítő, Videó, Befejezés) are hidden, as the hero toggle already was; the link returns when the stage is paused or stopped.
- Why: A running interval records rounds by itself; ending the session mid-round from the header would race the round's own write. Stopping first is one tap on the stage.
- Status: open - owner ruling: the header actions stay hidden while an interval block runs.

## DEV-082 — S-workout-finish: the kit sheet stands 1 pt in (its edge is a CSS border)

- Source: docs/pipeline/pulse/pkg/S-workout/finish-handoff.json DEV-S-workout-finish-03
- Package: S-workout (round S-workout-finish, D3)
- The frames show: nezetek/workout-finish and nezetek/workout-finish-confirm (design round A, Figma 161:2 / 171:2).
- What the app does: The sheet's content stands 1 pt in from the frame (x 25, w 352 instead of 24 / 354) and the panel starts at y 538 instead of 539.
- Why: The kit Sheet draws its 1 px hairS edge as a CSS border inside the panel; the Figma kit keeps the stroke out of the layout. Kit-wide (every sheet), within the 2 pt tolerance; not changed here.
- Status: open - kit-wide (every sheet), within the 2 pt tolerance.

## DEV-083 — S-workout-finish: the in-flight and failed states are built from the kit

- Source: docs/pipeline/pulse/pkg/S-workout/finish-handoff.json DEV-S-workout-finish-04
- Package: S-workout (round S-workout-finish, D3)
- The frames show: nezetek/workout-finish and nezetek/workout-finish-confirm (design round A, Figma 161:2 / 171:2).
- What the app does: Not drawn by any frame, built in the same language: the in-flight state (the chosen row holds its pressed level, the other row is inert, the sheet header shows the three dots) and the failed state (sheet stays open, danger dot + Újra repeating the same choice). No new copy.
- Why: PLAN 4.1 rule 7: undrawn states are built from the kit; a failed end must never look like one that worked.
- Status: closed - built from the kit, no new copy.

## DEV-084 — S-settings: Profil, the Edzés közbeni jelzések row value when every cue is off

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-settings/i18n.patch.json`
- Package: S-settings
- The frames show: `settings-v2-2` — no string is drawn at this place.
- What the app does: the frame draws 'Hang · Rezgés' only; with every cue off the row shows no value rather than an invented word for 'off'
- Status: open — a copy question; nothing was invented.

## DEV-085 — S-admin: admin-view-3-report title 'Bejelentés'

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-admin/i18n.patch.json`
- Package: S-admin
- The frames show: no string is drawn at this place.
- What the app does: In the approved frame, listed by the round-A README as invented copy; en 'Report' / de 'Meldung' are proposals.
- Status: open — a copy question; nothing was invented.

## DEV-086 — S-day-settings: zone sheet (opened by the zone row's chevron)

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-day-settings/i18n.patch.json`
- Package: S-day-settings
- The frames show: `lifeos/settings-day-v2` — no string is drawn at this place.
- What the app does: The frame draws the row's chevron but not what it opens. Built as the kit's picker grammar (SelectSheet): sheet titled 'Időzóna', the search field, every IANA zone as a radio row (place name from the zone database in English, e.g. 'Budapest', 'Buenos Aires'; offset 'GMT+2'). No new words beyond 'Keresés' / 'Nincs találat'. Localized city names do not exist on the platform and are not invented.
- Status: open — a copy question; nothing was invented.

## DEV-087 — S-focus: Fókusz, the ConfirmSheet behind "Feladás"

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-focus/i18n.patch.json`
- Package: S-focus
- The frames show: `lifeos/focus-2` — no string is drawn at this place.
- What the app does: the body script names the sheet ("Feladás → ConfirmSheet") but draws no words for it: title and message are proposed (focus.giveUpTitle / giveUpBody)
- Status: open — a copy question; nothing was invented.

## DEV-088 — S-focus: Fókusz, focus-3 SZINT row

- Source: PLAN.md R22 — a `copyQuestions` entry of `docs/pipeline/pulse/pkg/S-focus/i18n.patch.json`
- Package: S-focus
- The frames show: `lifeos/focus-3` — no string is drawn at this place.
- What the app does: the XP bar is the level progress of the wallet after the finish (readLevel of coins/statement.ts); the frame layer name "74 % to level 5 (+23 XP)" is not drawn as words
- Status: open — a copy question; nothing was invented.

## DEV-089 — S-lifeos-polish: Ma, the FÓKUSZ door when no block is planned

- Source: `pkg/S-lifeos-polish/deviations.md` question 1 (review of S-focus)
- Package: S-lifeos-polish
- The frames show: `lifeos/ma-1` draws FÓKUSZ ("ma 50 perc", a planned block); `ma-2`, `ma-3` and `ma-4` do not draw the section.
- What the app does: GET /lifeos/today always sends `focus`, so Ma always draws the FÓKUSZ door "Fókusz indítása"; without it /focus would have no door.
- Status: open — owner: keep the door, or draw FÓKUSZ only once a block exists and put the door elsewhere.

## DEV-090 — S-lifeos-polish: Fókusz, Befejezés before the end asks nothing

- Source: `pkg/S-lifeos-polish/deviations.md` question 3 (S-focus review 7)
- Package: S-lifeos-polish
- The frames show: `lifeos/focus-2` — the docked Befejezés has no confirmation drawn (only Feladás has one).
- What the app does: an early Befejezés finishes at once and pays the elapsed minutes only; it cannot be undone.
- Status: open — owner: should an early Befejezés ask first?

## DEV-091 — S-lifeos-polish: Ma, Nyújtás sub line wording

- Source: `pkg/S-lifeos-polish/deviations.md` question 2
- Package: S-lifeos-polish
- The frames show: `lifeos/ma-1` "Emlékeztető 21:30"; `lifeos/ma-4` and `lifeos/habits-1` "Naponta · emlékeztető 21:30".
- What the app does: one wording on both screens, the ma-4 / habits-1 form (habits.scheduleDaily + habits.reminderAt).
- Status: open — the frames disagree; owner picks the wording.

## DEV-092 — S-lifeos-polish: Haladás > Napok, the three states the frame does not draw

- Source: `pkg/S-lifeos-polish/deviations.md` question 5 (S-progress-days review D6 / D8 / D9)
- Package: S-lifeos-polish
- The frames show: `lifeos/progress-days` — a settled user with a full week only.
- What the app does: D6 a new user's page ends after four "0" rows (no sentence drawn); D8 today's column reads 0 for a habit-only day until the day close (GET /lifeos/stats carries no habits preview); D9 a lapsed day is drawn without a bar.
- Status: open — owner (copy for D6, the server preview for D8, the look of D9).

## DEV-093 — P-picker-muscles: the plan editor's exercise picker shows the muscle map (owner override)

- Source: owner request of 2026-11-03: "in the trainer's plan editor, when the coach searches for an exercise, also show the muscle map so they see what it works"
- Package: P-picker-muscles
- The frames show: `plan-editor-3` (picker with flags) draws result rows as a name only; `brain/58-Pulse/Screens/plan-editor.md` lists a muscle map / muscle tags / a "no results" text in the picker under "must not be shown", and `Feature inventory.md` listed a shared picker with a muscle heat map as planned.
- What the app does: each of the (up to 12) results gets a read-only mannequin as its lead (72 pt tall; back view when most primary muscles are drawn only on the back, front otherwise; primary lit, secondary the weaker step; mounted only when the row is near the visible part of the scroll box) and a one-line muscle label under the name (primary in `text-2`, secondary dimmer, "Nincs izom megadva" when none); the scroll box grows from about 3.5 to about 4.5 rows (27 rem). `GET /exercises` now carries `muscles: [{slug, role}]` per row. Also drawn because the frames show none: loading skeleton, "Nincs találat" + hint, load error + "Újra". The names follow the interface language (the picker hard-coded `hu`) and the query is debounced 300 ms like the library's.
- Status: ruled — the owner approved the override on 2026-11-03 (a layout the owner has not seen on a real device is still open: the row is 92 pt high, so on a phone with the keyboard up only a few results show before the page scrolls).

## DEV-094 — S-admin-accounts: the account list, account page and coin ledger, nine places where the app differs from the frames

- Source: `pkg/S-admin-accounts/handoff.md` (deviations 1-9), frames `admin-accounts-v2`, `admin-account-detail-1`, `-2a` .. `-2d`, `-3a`, `-3b` (owner decisions 2026-11-03, items 1 and 4)
- Package: S-admin-accounts
- The frames show: NAPLO lines such as "Erme-korrekcio -50", a person's name and a "Rendszer" actor; the disabled (3a) and own (3b) pages with FIOK + MUVELETEK only; "Nyitott munkamenet 3 · ebbol ez"; a lit "Mentes" pill on an unchanged name; no line under the coin figure; long sheet titles; the coin row on the own account; the filter words as plain text.
- What the app does: (1) NAPLO shows the actor's e-mail and the action only (the API carries `actorEmail` and no detail, no system actor); (2) 3a / 3b keep ERME, TEVEKENYSEG and NAPLO too (an admin looking at a disabled account needs the log that says who disabled it); (3) the open-session row shows the count only; (4) enabling an account reuses the disable sheet's layout (title "Fiok engedelyezese", link "Engedelyezes"), it is not drawn; (5) the name sheet's "Mentes" is disabled until the name differs; (6) the coin figure is the kit's NumeralField with its 1 pt line (the `check:pulse` raw-form ban leaves no other typed number); (7) the sheet titles "Kijelentkeztetes" and "Jelszocsere" are shortened (the kit's sheet header cuts a longer title with an ellipsis); (8) "Erme-korrekcio" is hidden on the own account (the server answers 409 cannot_adjust_own_coins); (9) the filter words are bare toggle buttons (one `token-lint-disable` with the reason: Chip draws a filled pill, Pressable's link has no mark).
- Status: open — owner (items 1 and 2 are the ones that change what an admin can read; each is a one-line change if he wants the frame's version, and 1 also needs the API to carry a detail line).

## DEV-095 — S-admin-fix: the confirm sheets carry the kit's close X, the frames draw none

- Source: `.pulse/review/S-admin-accounts/REVIEW.md` difference 5 (frame `admin-account-detail-2c-disable`; the same in the sign-out, lock-out and password sheets)
- Package: S-admin-fix
- The frames show: the `ConfirmSheet` header with the title only; the action link and "Mégse" are the two ways out.
- What the app does: the kit's `Sheet` header draws a 44 pt close control at its right edge (it is part of the kit `Sheet` / `ConfirmSheet`, `src/ui/feedback/**`, used by every confirmation of the product), so the admin sheets have it too. Not changed here: removing it from the admin sheets only would make one family of confirmations differ from all the others.
- Status: open — owner / integrator: either the designers add the X to the `ConfirmSheet` frame, or the kit drops it product-wide.

## DEV-096 — S-admin-fix: a taken-down author profile has no way back

- Source: `.pulse/review/S-admin-posts/REVIEW.md` difference 2 (frames `admin-post-detail-1`, `-2`, `-2-draft`: "Posztjai is eltűnnek. Visszaállítható.")
- Package: S-admin-fix
- The frames show: the row "Szerző profiljának levétele" with the sub line "Posztjai is eltűnnek. Visszaállítható."
- What the app does: the backend has ONE restore route, for a post (`POST /admin/marketplace/posts/:id/restore`); nothing clears a profile's `removed_at`. The row, the sheet and the combined take-down therefore say "Nem vonható vissza" / "this cannot be undone here", and the post page names the profile take-down next to a disabled author ("A szerző profilját levették, ezért a poszt nem látszik"). The post of such an author can be restored but stays hidden (`hiddenBy` carries `profile_removed`), which the restore sheet already says.
- Status: open — owner: a profile restore needs a backend route (a new package) and a row; until then the app tells the truth.

## DEV-097 — S-admin-fix: three post frames are older than the product

- Source: `.pulse/review/S-admin-posts/REVIEW.md` differences 2b, 2c, 13
- Package: S-admin-fix
- The frames show: (2b, `admin-post-detail-2-draft`) a SZÖVEG block with the draft's text; (2c, `admin-post-detail-2`) a snapshot block under each closed report; (13, `admin-post-detail-3`) "A szerző le van tiltva, de a posztja még látszik." with the live-page link.
- What the app does: (2b) the server withholds a draft's body (`bodyWithheld`), so no SZÖVEG block; (2c) the snapshot is destroyed when a case closes (a trigger), so a closed report shows its outcome line only (now in upper case like the frame); (13) the server hides the posts of a disabled author, so the notice says the post is not shown and the page has no live-page link (the ELŐ dot is the ink one, not the lime lamp, on a post nobody can see).
- Status: open — owner confirms the three behaviours; the designers redraw the frames.

## DEV-098 — S-admin-fix: figures of the Moderáció panel above 9 999 are written "12k"

- Source: `.pulse/review/S-admin-moderation/REVIEW.md` difference 3 (frame `admin-moderation-v2`)
- Package: S-admin-fix
- The frames show: one- and two-digit figures in 112 pt columns.
- What the app does: a figure of the six is exact up to 9 999, then "12k" (whole thousands) and "3M" (whole millions); the small second figure of "Edzés ma / 7 nap" turns to "1,2k" from 1 000. A screen reader still hears the exact number; the Statistics page has the exact figure. Nothing changes below the threshold, so every frame is as drawn.
- Status: open — owner (is a compact figure acceptable, or should the grid change shape at that size?).

## DEV-099 — S-admin-fix: the moderation queue lists its first page only

- Source: `.pulse/review/S-admin-moderation/REVIEW.md` difference 4 (frame `admin-moderation-v2`; owner decision 4: lists page with "Továbbiak")
- Package: S-admin-fix
- The frames show: "N várakozik" over the list.
- What the app does: `GET /admin/moderation` answers at most 50 rows with no cursor (backend, outside this package). When more wait than the list holds, the head reads "50 / 55 várakozik" and a quiet line under the list says the next ones follow as the admin decides; the refresh glyph reads the panel and the list together.
- Status: open — owner: a cursor on the queue route (a backend package) and a "Továbbiak" row.

## DEV-100 — S-admin-fix: what stays of the three screen reviews

- Source: the three `REVIEW.md` files of `.pulse/review/S-admin-accounts`, `S-admin-posts`, `S-admin-moderation`
- Package: S-admin-fix
- Not fixed, with the reason: accounts 12 — a display name may carry markup (`<script>`; React escapes it, no non-escaping sink exists; which characters a name may have is a product rule shared with PATCH /auth/me: owner); posts D1 (B-admin-polish) — the text of a post hidden by its author and edited afterwards is shown to the admin (owner); posts 12 — the moderation history (`moderationLog`) is fetched and not drawn, no frame has it (owner: a "Történet" section, or drop it from the read); posts 5 / 6 / 8 — a frame-side 1.5 pt offset of "Stílus stúdió", a 4.5 pt amber count, fixture-only differences (nothing to fix); moderation 7 — the Statistics page drifts down 0.5 - 1 pt per line row (4 pt by RENDSZER; the series lines are about 1 pt shorter than the frame's, not visible at a glance); accounts 13 — "Továbbiak" offline does nothing visible (the global offline strip says why).
- Status: open — owner for the first three; the rest is accepted.

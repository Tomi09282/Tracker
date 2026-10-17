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

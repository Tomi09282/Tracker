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

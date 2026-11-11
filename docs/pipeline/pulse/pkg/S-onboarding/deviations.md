# S-onboarding — deviations taken under Q4 (behaviour wins) and defaults that need a ruling

For INT to append to `docs/pipeline/pulse/deviations.md`. Frames: onboarding-1 (5/5, returning member),
onboarding-2 (1/5, first step, saved), onboarding-3 (2/5, after a refused "Kész"). Route `/onboarding`
is URL only (no inbound door, `check-nav` no-inbound-by-design; none added).

## Behaviour that the frames do not draw, kept in a Pulse form

| # | Behaviour (base) | Pulse form taken | Needs a ruling? |
|---|---|---|---|
| 1 | Steps 3 (place + equipment) and 4 (body data) exist; the frames draw only steps 1, 2 and 5 | composed from the same kit: the question, `Section` with the required star in ink + single-choice rows (place), `Section` + hint + `ChipRow wrap` of the 16 server equipment names (step 3); the optional note, the units as two single-choice rows, three underline `Field`s, the sex as four single-choice rows (step 4) | no |
| 2 | Units: two chip-shaped radio buttons; sex: four `Toggle` chips (role checkbox) that behave as a single choice | both are single-choice rows on hairlines with the tick / ring (the frames' single-choice language). The sex options change role checkbox -> radio (inventory diff of onboarding-step4-body: -4 checkbox, +4 radio, same names); a tap on the chosen one still keeps it | role change only |
| 3 | The progress ring (`Gauge`) with the step numeral and "5 lépésből" inside; `role="progressbar"` with min 1 and the "2 / 5. lépés" sentence as `aria-valuetext` | the hero stage: eyebrow + giant `Numeral` (static, `aria-hidden`) + the thin `SegmentBar` — its own `progressbar` (min 0, valuetext "2 / 5") named by the "2 / 5. lépés" sentence | no |
| 4 | Option cards with a glyph holder (goal / experience / location icons), filled accent when chosen | rows on hairlines: chosen = ink + the lime tick, others = text-2 + the 24 ring; no glyphs (the frames draw none). One tab stop per row as before | no |
| 5 | Body fields and the note carried a leading glyph (ruler, scale, cake, message) | no glyphs (the frames' fields have none) | no |
| 6 | The note was a single-line input (maxLength 2000) | the frame's multi-line `TextArea` (grows a row of 22 at a time); Enter now breaks a line; maxLength 2000 kept | no (drawn) |
| 7 | Numbers: `−` / `+` beside a field; on an empty field `+` gave min + step and `−` gave min | the kit `NumberStepper` (typed figure in the 48 pt Black face, `−` / `+` on the line): on an empty field `+` gives min and `−` gives max (the kit's rule); bounds unchanged (1-14, 10-240 step 5); the "in range" tick is now the frame's quiet text-2 tick instead of the green disc | yes (empty-field step direction, kit behaviour) |
| 8 | Vissza: an outlined button with a chevron, Tovább with a chevron | `TextLink` "Vissza" (always drawn, disabled on step 1) and the one lime pill (56) — no chevrons | no |
| 9 | Save state: a spinner + "Mentés…", a green tick + "Elmentve", a cloud-off glyph + the save error | the status slot (20 pt always kept, `aria-live="polite"`): `NoticeLine compact` info / ok / danger with its 6 pt dot, where onboarding-2 draws it (40 above the pill). Fix round 2: while a line is shown it has the canvas under it (a 48 pt ramp, then solid down to the pill), so on a page longer than the phone the rows scroll under it instead of showing through the words; the dock reserve counts the slot, so the last row still comes out above it | no |
| 10 | The required star after "Mennyi edzéstapasztalatod van?" and "Hol edzel?" in the accent colour | the star in ink (text-1), `aria-hidden`, after the eyebrow — as onboarding-3 draws it; `aria-required` stays on the radiogroups (goal too, without a visible star) | no |
| 11 | Load failed: the skeleton stays forever (no message) | kept; the skeleton is now the screen's own shape (hero, question, three rows) inside `Screen`, `role="status"` + "Betöltés…" | yes (copy - see `i18n.patch.json` copyQuestions) |
| 12 | Kész failing for another reason than missing answers: silent, the pill usable again | kept (state onboarding-finish-failed) | yes (copy) |
| 13 | A refused Kész jumps to the first step with a missing answer, marks the field, names the fields in an alert | kept: the `NoticeLine tone="danger" role="alert"` under the actions, the Dock 8 taller; with all four missing the line wraps to two lines (state onboarding-refused-all-four) | no |

## Removed on purpose

| What | Why |
|---|---|
| The local `Holder`, `GroupHeading`, `Choice`, `NumberRow`, `SaveState` and the three icon maps | replaced by kit composition (`ChoiceList` is a local composition of `RowStack` + `ListRow` + `CheckMark`, not a copy of a shared component) |
| `text-balance` on the h1 | not used: the step-5 title breaks where onboarding-1 draws it through a no-break space in its hu string (`i18n.patch.json` change), and the step-2 title wraps by itself as onboarding-3 draws it |

## Capture decisions (no product change)

- The three frames are captured on account M (user@), not the freeze's C: the frames are drawn for a member (five tabs) and M's recording holds the drawn note, the knee limitation, Izomtömeg, Haladó and 70 minutes. C's recording stays as the extra state onboarding-step5-coach.
- Two drawn values cannot be produced by a fixture that pulse-fixture-check accepts (request R-S-onboarding-01): onboarding-1 ticks "Óvatosan" (M's recording: "Kerülendő"); onboarding-3 draws "Hetente hány edzés?" empty (M's recording: 4). With the two edits the captures equal the frames (`.pulse/pairs/S-onboarding/onboarding-1.drawn-values.pair.png`, `onboarding-3.drawn-values.pair.png`).

## Fix round 2 (review .pulse/review/S-onboarding/REVIEW.md)

| Review finding | Done |
|---|---|
| 1 blocking: the save line floats over the page on a 402 x 874 phone | fixed in OnboardingPage (canvas backing under the slot while a line is shown); the general Dock fade fix is offered as R-S-onboarding-03 |
| 2 minor: the number field taps only on its digits | kit NumberStepper: R-S-onboarding-02 now carries a proposed patch |
| 3 minor: scroll-into-view lands under the dock | shell index.css: R-S-onboarding-04 with a proposed patch |
| 4 minor: load failure keeps the skeleton | unchanged, waits for the owner copy ruling (row 11) |

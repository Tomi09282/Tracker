# S-compose-profile — deviations under owner answer Q4 (behaviour wins over the frame)

Frames: `compose-profile-1` (the whole form, identity panel closed) and `compose-profile-2` (identity panel
open, a new handle typed). Screen: `/compose/profile`, URL only on a phone (Q5). For INT to transcribe into
`docs/pipeline/pulse/deviations.md`.

| # | Kind | The frames show | What the app does | Ruling needed |
|---|---|---|---|---|
| 1 | Q4 undrawn | no create form | Create mode (no profile yet) is built from the same kit: monogram "·" and h1 "Profil létrehozása" until a name is typed, no identity line, the Felhasználónév field with its status line, the Város row, no public row, the pill reads "Profil létrehozása". Not capturable from the recordings (a null profile fails `pulse-fixture-check`): checked in code, verdict `structure` | no |
| 2 | Q4 undrawn | no taken-down state | `removedAt` set: one danger NoticeLine "A profilodat levették" under the back row; every field, specialty word, the switch and Mentés disabled; the identity line is plain text (no chevron, no panel); Előnézet stays live. Not capturable (`removedAt` as a number fails the fixture check): `structure` | no |
| 3 | Q4 kept behaviour | the city row only inside the open identity panel (frame 2) | the city stays where it was: behind the identity line (edit) or under the handle (create), saved by Mentés. The native `<select>` became the Város list row (value + chevron) opening the kit bottom Sheet with radio rows and the lime tick; the inventory difference (combobox + 12 options -> one button "Város Budapest", the options as radios in the sheet state) is this change | no |
| 4 | Q4 kept behaviour | the frame draws the public switch row only | the switch outcomes stay: "went dark" (info NoticeLine, role status) and the refusal (danger NoticeLine, role alert) under the rows. Render-only fix of the live bug: the refusal now fills `{{version}}` / `{{when}}` from the conflict (activeVersion, eligibleAt) instead of printing them raw | no |
| 5 | Q4 kept behaviour | — | the save refusal is a warn NoticeLine (role alert) and the markdown refusal a danger NoticeLine under the Előnézet link (were tinted boxes) | no |
| 6 | Q4 kept behaviour | rename refusal not drawn | the rename refusal is a danger NoticeLine inside the panel, under the warning | no |
| 7 | Role / look change | specialty words with the lime mark | the chips lost the check glyph (the mark carries the state) and are kit `Chip`s (still `aria-pressed` toggle buttons in a named group; the old `role="group"` + `aria-labelledby` list became the ChipRow's `role="group"` + `aria-label`). At the cap further taps still do nothing; Több reveals the rest with no way back, as before | no |
| 8 | Look change | — | the bio counter turns warning past 90 % and danger past the cap (reads 0), as before; calm it is the frame's two inks (figure text-1, words text-2), found in the translated string (German puts the figure in the middle) | no |
| 9 | Q4 kept behaviour | Előnézet as a text link | the link toggles to "Előnézet elrejtése"; the rendered bio opens under the actions as a ruled section ELŐNÉZET with DocRenderer (or the previewEmpty line) | no |
| 10 | Inherited gap, logged | — | a failed profile load still falls through to the empty create form (product gap 1), and flipping the switch / confirming a rename reloads the profile and drops unsaved edits (gap 5): logic above the return, not changed | owner, later |
| 11 | Kit limit | "Erő" 25 pt word | the kit Chip box is the word + 16, so "Erő" is a 41 x 44 target (< 44 wide). Request R-S-compose-profile-01 (a 44 pt floor on Chip); en / de words are wide enough | INT (request) |

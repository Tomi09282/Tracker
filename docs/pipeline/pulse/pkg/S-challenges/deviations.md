# S-challenges — deviations from the frames, and why

Frames: design round B `lifeos/challenges-1` (Figma 190:2), `lifeos/challenges-2` (190:440), `lifeos/ma-4`
(190:1665); the picked teaser of `lifeos/ma-1` and the done challenge of `lifeos/ma-2`. Owner rule Q4:
behaviour wins over the frame where they disagree; every undrawn state is built from the kit.

| # | Where | Frame | Built | Why |
|---|---|---|---|---|
| 1 | Ma, NAPI DOBÁS (ma-4) | "Koppints egyre: ma ez a küldetésed." — a tap picks at once (README-ma open question 5: "tap-to-pick has no confirm, an undo toast is assumed") | a tap opens MAI DOBÁS (`/challenges?option=<id>`) with that option chosen; "Ezt vállalom" makes the pick | the server has no undo for a pick (a second pick is `409 ALREADY_PICKED`; deleting the task leaves the day picked), so the assumed undo toast cannot exist. challenges-1 draws exactly the state a Ma tap leads to (an option chosen, the pill), and it is challenges-1's only door ("pushed from Ma's NAPI DOBÁS"). The line stays true after the confirm. |
| 2 | Ma, option sub line (ma-4) | "Test · reggel", "Mozgás · bármikor", "Pihenés · lefekvés előtt" | the category alone: "Fegyelem", "Mozgás", "Elme" | the API carries no time of day for a challenge, and "Test" / "Pihenés" are not among the five categories (api.md). Nothing is invented. |
| 3 | KIHÍVÁSOK (challenges-2) | "30 fekvőtámasz" drawn mid-swipe with "Archiválás" revealed | every row at rest; a row opens the challenge sheet, which holds "Archiválás" / "Visszaállítás" and "Törlés" | the kit row has no swipe (ListRow: "No selected fill, no hover fill, no swipe"); the action keeps the frame's words and glyph, one tap further. The archived rows keep their "Visszaállítás" in place. |
| 4 | KIHÍVÁSOK, header plus | "add = header plus (→ form sheet)"; the sheet is not drawn | the kit bottom sheet as round B's other forms (habit-form, task-form): Megnevezés, Kategória chips, Érme / teljesítés ("legfeljebb 50"), Súly (the kit stepper, 1..5), the pill Létrehozás / Mentés; edit adds Archiválás and Törlés (ConfirmSheet) | a control must not do nothing (D3), and every create / edit / archive / delete route of api.md is reachable. |
| 5 | MAI DOBÁS, after the pick | not drawn | the chosen option ticked with "elvállalva" (or "teljesítve") on its sub line, the others' "+N" in text-3, no reroll line, no consequence line, no pill | api.md: a second pick and a reroll after the pick are refused; the README's own rule (chosen t1, the others t3) carries over. |
| 6 | MAI DOBÁS, the reroll used | not drawn | "Újradobás" off (40 %), "még 0 maradt ma" | the link stays where it was so the line does not jump; the count says why it is off. On Ma the head link is left out once the reroll is used (ma-4 draws it only with a count). |
| 7 | MAI DOBÁS, before a choice | challenges-1 draws one option chosen | nothing chosen: every "+N" in text-2 (the kit value colour), the pill off | the pick is mandatory and explicit; nothing is pre-chosen except from Ma's tap (deviation 1). |
| 8 | Undrawn states | — | loading (rule + three row skeletons, also while the day's first draw is made), a failed read (danger line + "Újra"), no zone yet (a line with "Nap és időzóna ›"), an empty pool (EmptyState "Még nincs kihívásod" + the pool door / "+ Új kihívás"), a refused write (toast; a 409 reloads the draw) | Pulse: every state in the same language. |
| 9 | Ma, NAPI DOBÁS with an empty pool | not drawn (api.md: "Ma shows no NAPI DOBÁS") | the eyebrow with "Kihívások ›" and one line | without it a new user has no way to the pool on a phone: the pool has no seed, and MAI DOBÁS is only reached from a drawn option. |
| 10 | Ma, FELADATOK and the MA a/b count (R-S-challenges-02) | ma-1 lists the four open tasks without the challenge; README-ma "the challenge never counts" | the picked challenge's task is left out of FELADATOK and of the count; "Ma eddig" keeps its pay (REVIEW-b1 7, ma-2 +68) | the pick becomes a real task due today (api.md), which would otherwise show twice and count. |
| 11 | KIHÍVÁSOK fixture order | the frame's order | the fixture lists the active rows in the frame's order | the server lists by name (api.md); the page does not sort, so a recording will show name order. |
| 12 | Tab bar (every frame) | six tabs with Naptár | five tabs | Naptár is plan Phase 5 (not merged). Not this package's. |
| 13 | Ma below NAPI DOBÁS (ma-1) | FÓKUSZ, KÖVETKEZŐ | not drawn | plan Phases 5 / 6; S-ma's own deviation. |

## Probes that do not pass, and why they are not this package's

- `boxed` on challenges-1 / -picked / ma-4: the kit set-check ring (`CheckMark`, a 24 pt ring with a 1.5 pt
  edge) is counted as a bordered surface. It is the kit's radio mark, drawn exactly as `setCheck`; S-ma's
  ma states report the same.
- `targets` on every pushed MAI DOBÁS state: the kit back control "‹ MA" is 36.6 pt wide (the parent's
  name is two letters). The kit's ScreenHeader; S-habits' "‹ MA" is the same.
- `targets` on the sheets: the kit NumberStepper's figure input is 24 pt wide between its − / + buttons.
- `geometry`: every remaining entry is a text box's WIDTH (Figma's fixed-width text vs the DOM's hugging
  inline box) or the five-tab bar; every y is within 1 pt (see the pair pictures).

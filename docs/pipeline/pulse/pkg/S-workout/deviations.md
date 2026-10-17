# S-workout — deviations taken under Q4 (behaviour wins) and defaults that need a ruling

For INT to append to `docs/pipeline/pulse/deviations.md`. Frames: workout-1, workout-2 (workout-3 superseded by D2).

## Behaviour that the frames do not draw, kept in a Pulse form

| # | Behaviour | Pulse form taken | Needs a ruling? |
|---|---|---|---|
| 1 | Pending rows' own check works, not only the active one | the 24 pt ring is a button (`Pressable link icon` around `CheckMark`) | no |
| 2 | Hero toggle Videó / Izomtérkép (names the other view; inert without taxonomy) | `TextLink` with the play / person glyph in the header line, as drawn; inert = `aria-disabled` (the kit's 40 % "off") | the old screen showed it at full ink when inert; Pulse's off state is 40 % |
| 3 | Interval timer toggle on circuit / EMOM / AMRAP members | a second `TextLink` "Időzítő" left of the hero toggle, 24 apart | yes (no frame) |
| 4 | Interval stage (8 sub-states) | in the hero under the title: one 48 pt line (countdown `Numeral num tick`, phase word in its phase TEXT colour, three bare icon buttons), the 4 pt line (lime while working), the round / next line; idle, done and the interruption prompt carry the lime pill | yes (no frame) |
| 5 | One lime lamp | while the stage shows its pill (idle, done, interrupted) the active set row draws its ring, which still checks | yes |
| 6 | Failed check: offline / server error / 409 | a danger `NoticeLine` over the fields and the check cell, ONE action: Újra (offline, error) or Visszavonás (409, void); the row keeps its height and its typed values | yes (no frame) |
| 7 | Withdrawn (voided) set | numerals in text-3 with no lock, a hairline through the row, no check control, "Visszavonva" right-aligned (in de "Zurückgenommen" lies over the reps figure) | yes |
| 8 | Exercise complete on the switcher | a 16 pt lime tick after the full count | yes (no frame) |
| 9 | Media stand-in (Videó pressed, or a freestyle movement) | the figure box stays empty; the side switch and legend go with the figure (they only steer it); no grey placeholder | no (images are withheld, never drawn) |
| 10 | Loading | the same column block for block with plain skeleton lines; the figure withheld | no |
| 11 | Error of the session read | F16's error line kept (`NoticeLine danger` + Újra), now inside `Screen` | no |
| 12 | Q7 at 360 x 640 | measured on the column: when the rows would get less than two of themselves, first the figure with its switch and legend goes (hero = title, 80), then the header line (counter + hero toggle); the interval stage is not the figure and stays | default of Q7, applied |
| 13 | The list region shrinks when the rest band rises or the offline line drops in | the active row is scrolled back into view (never focused) | small behaviour addition |
| 14 | A locked row | shows the server's values (entry_value, reps), not the row's local state | fixes a stale-row case (a check drained from the outbox) |
| 15 | The record caption | ends on a wall-clock deadline (1.4 s from the check), like the rest clock | no visible change |

## Behaviour removed by the one Pulse look (R11, `variants.json`)

| Element | Removed | Consequence |
|---|---|---|
| E21 B hold-to-confirm | the 550 ms hold and its hint (`workout.holdToCheck`, removed by `i18n.patch.json`) | tap only, as the database serves (A) |
| E21 C swipe-weight | horizontal drag in 2,5 kg steps | the weight is typed |
| E21 E undo pill | the 6 s "Visszavonás" pill after a normal check | **a normal check can be taken back only after a 409** — the void is still reachable there; flag for the owner |
| E22 B / C | the rest chip and the top hairline | the in-flow rest band of workout-2 |

## Copy

No new string. "Következik" + ":" (the colon is punctuation, as the old card printed it). The skip link prints `workout.skipRest` (was aria-only).

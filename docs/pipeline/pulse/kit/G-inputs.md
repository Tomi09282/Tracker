# Kit reference — gap lane G-inputs (input additions)

The kit gaps of `.pulse/prep/_kit-gaps.md` section A that belong to the inputs lane (IN, package
F12): item 8 (`TextArea`), item 9 (the numeral field) and the two input rows of item 13 (`Field`
unit, the title-style `Field`). Every addition is ADDITIVE (ruling R6): no existing prop changes
meaning, no call site has to change, and a component used without the new props renders exactly
what it rendered before. `inputs.md` stays the reference for everything else; this page is the
reference for what is listed here.

Numbers come from the frames' geometry export (`.pulse/geometry/<frame>.json`); node names and boxes
are quoted with each addition. Specimens: `frontend/src/features/playground/kit/G-inputs.tsx` (rest,
keyboard focus, error, disabled, empty — a field has no pressed and no busy state of its own, see
`inputs.md` "Not a field state").

The API below is final. Changes after this page are additive only.

## What a screen writes

```tsx
import { Field } from '../../ui/primitives/Field';
import { TextArea } from '../../ui/primitives/TextArea';
import { NumeralField } from '../../ui/primitives/NumeralField';
import { NumberStepper } from '../../ui/primitives/NumberStepper';

// nutrition-2 "gramm": the unit after the digits, the tick on the line's end
<Field label={t('nutrition.grams')} unit={t('nutrition.unitG') /* S-nutrition adds the key */} inputMode="numeric" value={grams} onChange={…}
       trailing={gramsValid ? <Check aria-hidden /> : undefined} className="w-40" />

// plan-editor-1 / -2: the plan name as a heading-like input
<Field variant="title" label={t('plans.newName')} ref={nameInput} maxLength={120} value={nameValue} onChange={…} />

// compose-post: a counter the screen colours (warning near the cap, danger past it)
<TextArea label={t('compose.body')} minRows={7} value={body} onChange={…}
          labelTrailing={<span className={COUNTER_CLASS[tone]}>{t('compose.charsLeft', { n })}</span>} />

// compose-profile: the headline wraps but is one line; the bio is an 8-row window
<TextArea singleLine label={t('compose.headline')} marker={t('compose.optional')} markerTone="quiet" hint={…} value={…} onChange={…} />
<TextArea labelHidden label={t('compose.bio')} minRows={8} maxRows={8} value={bio} onChange={…} />

// workout-1 / -2: the set fields on the row's rule
<NumeralField label={t('workout.weight')} className="w-26" placeholder="70" value={weight} onChange={…} />
<NumeralField label={t('workout.reps')} className="w-10" placeholder="6" value={reps} onChange={…} />
<NumeralField label={t('workout.weight')} className="w-26" value="80" locked lockedLabel={t('workout.recorded')} />
<NumeralField label={t('workout.reps')} className="w-10" value="6" locked lockMark={false} lockedLabel={t('workout.recorded')} />

// a stepper line without − / + (the figure is still typed and keyboard-stepped)
<NumberStepper label={…} value={n} onChange={setN} min={1} max={14} controls={false} />
```

## `Field` — two additive props (`ui/primitives/Field.tsx`, `data-kit="inputField"`)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `unit` | `string` | — | drawn right after the typed value: the input is sized to its content, the unit follows 4 pt after it in `body` `text-2` (`text-3` disabled), then the rest of the line (a tap there focuses the input), then `trailing`. In `aria-describedby`. The value stays the bare number |
| `variant` | `'line' \| 'title'` | `'line'` | `title` = the plan name (below) |

`FieldVariant` (`'line' | 'title'`) is exported. Two helpers are exported for the field's siblings
(not for screens): `fitInputToContent(el)` (the `ch` fallback where `field-sizing: content` is
missing) and `assignRef(ref, el)`.

### `unit`, in numbers — `nutrition-2` `Field/gramm` (24,699 160 × 62)

| Part | Frame | Kit |
|---|---|---|
| label | `gramm` 24,699 cap-m 13 / 18 `text-2` | the field's label row, unchanged |
| line | `Input/underline` 24,717 160 × 44, underline 24,760 1 px `#5E615B` | the field's line, unchanged |
| value + unit | `Value` 24,728 "180 g", body 16 / 22, the digits `text-1`, the unit `text-2` | the input hugs "180", the unit 4 after it (a body space), same 22 line box at +11 |
| tick | `Valid mark` 167,729 20 × 20, stroke 1.67, ink `#F2F5EA` | the caller's `trailing` (a bare `Check`), flush with the line's end, unchanged |

Never put "180 g" into the value: the screen's `gramsValid` parses the bare number.

### `variant="title"`, in numbers — `plan-editor-1 / -2` `Field/Új terv neve` (24,124 354 × 28)

| Part | Frame | Kit |
|---|---|---|
| text | Geist SemiBold 22 / 28, −0.22 (−1 %), `#F2F5EA`, one line | the `title` step, `text-1`, `truncate` (ellipsis while not focused) |
| label | none drawn | `sr-only`, still `htmlFor`-bound (`plans.newName` "Új terv neve") |
| rest | no underline | no line |
| layout box | 354 × 28 | 28 — the input is a 44 pt target overhanging it by 8 above and below (`-my-2`) |
| focus | (the kit's field focus) | 2 px lime on the 2 pt right under the 28 line box + the lime caret |
| error | — | the same 2 pt line in `danger`; the message 8 under the line box, `role="alert"` |
| disabled | — | `text-3`, no line |

`leading`, `trailing`, `unit` and `marker` are not drawn by the title variant; `hint` and `error` are.

## `TextArea` — two additive props (`ui/primitives/TextArea.tsx`, `data-kit="textArea"`)

Already on the F12 page and unchanged: `minRows`, `maxRows`, `labelHidden`, `counter`, `marker` /
`markerTone` / `hint` (parity with `Field`). Added:

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `labelTrailing` | `ReactNode` | — | any node at the trailing end of the label row, on the label's baseline, in `cap` `text-3` unless the node colours itself (the screen's counter `<span className="text-warning">`). In `aria-describedby`. Takes the place of `counter` and of the marker |
| `singleLine` | `boolean` | `false` | one logical line that wraps: Enter does not break it (an IME composition keeps its Enter), a pasted or dictated break becomes a space before `onChange` sees it, `enterkeyhint="done"`, `aria-multiline="false"`. Grows like any `TextArea` (44 → 66 …) |

### In numbers

| Use | Frame | Kit |
|---|---|---|
| counter on the label row | `compose-post-1` text field: label row 662 (18), counter 244,662 w 134 `cap` `text-3`; area 680-856 (176 = 11 + 154 + 11); underline 855 | `minRows={7}` + `labelTrailing` |
| headline (`singleLine`) | `compose-profile-1` `Field/Egysoros bemutatkozás`: label 24,551; marker "Nem kötelező" 287,553 micro `text-3`; line 24,569 354 × 66 (value 24,580, two rows); underline 24,634; hint 24,643 cap `text-3` | `singleLine marker markerTone="quiet" hint` — two rows = 66 |
| bio window (`labelHidden`, 8 rows) | `compose-profile-1` `Input/multiline · markdown source` 24,940 354 × 176 (8 rows, the text starts AT the window's top), underline 24,1127 | `labelHidden minRows={8} maxRows={8}`: 11 + 176 + 11. The field keeps its 11 pt top pad; the frame starts the text at the window's top, so the screen places the field 11 higher (`-mt-2.75`, placement) |

## `NumeralField` — new (`ui/primitives/NumeralField.tsx`, `data-kit="numeralField"`)

The set fields of `workout-1 / -2`: the figure typed in the `num` step, on the row's rule.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | the name for assistive tech, always `sr-only` (the frames name the columns above the rows: "Súly", "ism.") |
| `error` | `string` | — | the line becomes 2 px `danger`, `aria-invalid`; the words are announced (`role="alert"`, `sr-only`) — a set row has no message line, a screen prints them itself if it wants them seen |
| `locked` | `boolean` | `false` | a recorded value: the figure in `text-1`, no line, the 14 pt lock in `text-3` 3 after the figure's box; the input is disabled |
| `lockedLabel` | `string` | — | the lock's words, read with the value (`workout.recorded` "Rögzítve") |
| `lockMark` | `boolean` | `true` | draw the lock after a locked figure; the frame draws one lock per row, after the weight, so the reps field is `locked lockMark={false}` |
| `className` | `string` | — | placement AND width: `w-26` (104, the weight) / `w-10` (40, the reps) |
| …every `<input>` attribute but `type` and `size` | | | `value` (a STRING — "142,5"), `onChange`, `placeholder`, `disabled`, `name`, `ref`, `aria-*` … `inputMode` defaults to `decimal` |

| Part | Frame (`workout-1` `Set row/3 · active` 24,487 354 × 64) | Kit |
|---|---|---|
| box | the row, 64 high | `h-16`, width from `className` |
| figure | `Súly · placeholder` 151,495 48 × 48 "70", Big Shoulders Display Black 48 / 48, `#858C79` | the `num` step at +8; value `text-1`, placeholder `text-3`, caret lime |
| line | `Field edge` 152,551 104 × 1 `#5E615B` (on `Rule/row` 24,551) | 1 px `edge` on the pt UNDER the box — the row's rule; focus 2 px lime from +63, error 2 px `danger`, disabled hairline |
| reps | `ism. · placeholder` 270,495 24 × 48; `Field edge` 272,551 40 × 1 | `w-10` |
| locked | `Set row/1 · done`: `Súly` 150,365 49 × 48 "80" `#F2F5EA`; `glyph/lock · Rögzítve` 202,393 14 × 14, stroke 1.02 `#858C79`; no edge | the input hugs "80", the lock `ml-0.5` (2) after it (202.4 vs 202: the frame's text box starts 2 left of its field edge), 36 under the box's top, stroke 1.75 at 14 |
| long value | "142,5" | the figure grows past the field's width (`field-sizing: content`), never cut |
| hit target | — | the whole 64 pt box; a 40 pt field reaches 2 pt past each side (the 44 floor) |

The figure is 48 pt, above WebKit's 16 pt zoom floor. The screen keeps its parse / sanitise helpers;
the field never parses. Focus = the line, as on every field (the global ring is off on the input).

## `NumberStepper` — one additive prop (`ui/primitives/NumberStepper.tsx`, `data-kit="numberStepper"`)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `controls` | `boolean` | `true` | `false` leaves out − and +; the typed figure, the keyboard steps (ArrowUp / Down, PageUp / Down, Home / End), the tick, the hint and the error stay |

`error` was already there (the message replaces the hint, 2 px `danger` line) — `onboarding-3`'s
"empty + error" needs nothing new.

## Tokens and strings

No token added. No string added: every visible word is the caller's (`workout.weight`,
`workout.reps`, `workout.recorded`, `nutrition.grams`, `plans.newName` … exist in `hu.json`; `nutrition.unitG` "g" is added by S-nutrition's own i18n patch).

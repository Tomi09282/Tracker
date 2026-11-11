# Kit reference — gap lane G-lifeos (LifeOS kit gaps, plan F.2)

The five kit gaps of the LifeOS port (`.claude/plans/abundant-booping-willow.md`, "LifeOS frontend",
"Kit gaps"): `DayRail`, `TimeTrigger`, `RecurrencePicker`, `WeekdayChips`, `Countdown`. All five are
NEW files (ruling R6: no existing component changes); they compose the existing kit (`ChipRow` /
`Chip`, `FieldFrame`, `NumberStepper`) and draw nothing those already draw.

Source of truth: design round B (approved 2026-10-18) — `TRACKER-mockups/5-pulse/kepernyok-2x/lifeos/`
`calendar-1`, `task-form`, `habit-form`, `event-form`, `focus-2` and their build scripts
`figma-build/lifeos/*.body.js` (`dayRail`, `chipRow`, `inputField`, `countdown`), on the kit of
`figma-build/app-kit.js`. Round B has no geometry export yet; the numbers below are the build
scripts' own and were checked on the 2x pictures.

Specimens: `frontend/src/features/playground/kit/lifeos.tsx` (each component first as its frame
draws it, then rest, pressed, keyboard focus, busy, disabled). Every word is the caller's: the kit
holds no copy, weekday names come from `Intl` (in Hungarian exactly the frames' "H K Sze Cs P Szo V").

The API below is final. Changes after this page are additive only.

## What a screen writes

```tsx
import { DayRail } from '../../ui/primitives/DayRail';
import { TimeTrigger } from '../../ui/primitives/TimeTrigger';
import { RecurrencePicker, type Recurrence } from '../../ui/primitives/RecurrencePicker';
import { WeekdayChips } from '../../ui/primitives/WeekdayChips';
import { Countdown } from '../../ui/data/Countdown';

// calendar-1: the week under the week line; busy = the day has events / tasks / a workout
<DayRail label={weekLabel} days={week /* [{ date: '2026-10-19', busy: true }, …] */} value={day} onChange={setDay}
         today={todayKey} busyLabel={t('calendar.busy')} busy={weekQuery.isLoading} />

// task-form: "Határidő ideje" next to the date (165 wide), event-form: mono clock figures (106 wide)
<TimeTrigger label={t('tasks.dueTime')} value={time} onChange={setTime} className="w-[165px]" />
<TimeTrigger label={t('events.start')} value={start} onChange={setStart} face="mono" className="w-[106px]" />

// task-form: the recurrence group, the summary line is the screen's
<RecurrencePicker label={t('tasks.recurrence')} value={rule} onChange={setRule} anchor={dueDate}
                  labels={{ none: t('…none'), daily: t('…daily'), weekly: t('…weekly'), monthly: t('…monthly'),
                            interval: t('…interval'), monthDay: t('…monthDay') }}
                  hint={summary /* "Minden vasárnap 20:00" */} />

// habit-form: "Adott napok" — the weekday mask
<WeekdayChips label={t('habits.schedule')} value={mask} onChange={setMask} />

// focus-2: the running session
<Countdown seconds={left} srText={t('focus.left', { min, sec })} />
```

## `DayRail` (`ui/primitives/DayRail.tsx`, `data-kit="dayRail"`)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | accessible name of the rail (`radiogroup`) |
| `days` | `readonly DayRailDay[]` (`{ date: 'YYYY-MM-DD'; busy?: boolean }`) | — | the cells, in order; seven share the width |
| `value` | `string` | — | the selected day |
| `onChange` | `(date: string) => void` | — | a tap or ←/→/Home/End |
| `today` | `string` | — | its weekday is `text-1` (`aria-current="date"`) |
| `busyLabel` | `string` | — | appended to a busy day's name; without it the dot is decoration |
| `busy` | `boolean` | `false` | the dots are being read: none drawn, `aria-busy` |
| `disabled` | `boolean` | `false` | 40 % |
| `className` | `string` | — | placement only |

Drawing (`calendar-1.body.js` `dayRail`): 354 × 76, seven equal cells (50.6); a cell is a column 4
from the top, items centred, 6 apart: weekday `data` (today `text-1`, else `text-3`), date `data-l`
(selected `text-1`, else `text-2`), a 4 pt dot (`text-1` under the selected day, else `text-2`) on a
busy day only. Selection = a 2 pt INK bar the cell's width at y 74, on the 1 pt hairline at y 75
(the `segSwitch` rule — choosing a day changes the view). A cell is the 50.6 × 76 target; pressed
60 %, the lime focus ring 2 off the cell; the mark ignites (`--duration-fast`).

## `WeekdayChips` (`ui/primitives/WeekdayChips.tsx`, `data-kit="weekdayChips"`)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | the group's accessible name |
| `value` | `number` | — | weekday mask, bit 0 = Monday … bit 6 = Sunday (f_app `weekdayMask`) |
| `onChange` | `(mask: number) => void` | — | the mask after a tap (the caller decides if 0 is allowed) |
| `disabled` | `boolean` | `false` | every chip 40 % |
| `busyDay` / `failedDay` | `number` (0 = Monday) | — | that chip shows the three dots / its word is `danger` |
| `className` | `string` | — | placement only |

Drawing: exactly the kit `chipRow` (`ChipRow` + `Chip`, one line, words 24 apart, `body-m`, chosen
`text-1` + 2 pt LIME mark at y 37 of 44). Each chip is a `checkbox` named by the full weekday.
Helpers in `ui/primitives/weekdays.ts`: `WEEKDAYS`, `maskHas`, `maskToggle`, `weekdayShort`,
`weekdayLong`, `weekdayIndexOf`, `dayKeyToDate`, `ALL_WEEKDAYS_MASK`.

## `RecurrencePicker` (`ui/primitives/RecurrencePicker.tsx`, `data-kit="recurrencePicker"`)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | the group label (`cap-m` `text-2`) and the radiogroup's name |
| `value` | `Recurrence \| null` | — | f_app `Recurrence`: `{type:'daily', interval?}` · `{type:'weekly', weekdayMask}` · `{type:'monthly', day}`; `null` = none |
| `onChange` | `(next: Recurrence \| null) => void` | — | |
| `labels` | `RecurrencePickerLabels` | — | `none` `daily` `weekly` `monthly` (the four words), `interval`, `monthDay` (the number fields), `weekdays?` (the weekday row's name) |
| `anchor` | `string` (`YYYY-MM-DD`) | today | seeds weekly (its weekday) and monthly (its day) when the kind changes |
| `hint` | `string` | — | the summary line under it (`cap` `text-3`), written by the screen |
| `error` | `string` | — | `danger`, replaces the hint, `role="alert"` |
| `labelHidden` / `disabled` / `busy` | `boolean` | `false` | name only for AT / 40 % / the chosen kind shows the dots |
| `className` | `string` | — | placement only |

Drawing (`task-form.body.js`, `fieldGroup('Ismétlődés', …, 'Minden vasárnap 20:00')`): label 18,
4, the kind `chipRow` 44, the `WeekdayChips` row 44 directly under it (weekly only), 4, the hint 18.
Daily and monthly are not drawn in round B: their one number is the kit's `NumberStepper`, 8 under
the chips. The kind chips are radios (←/→ move the choice, roving tab stop); a weekly rule keeps at
least one day. Exported: `Recurrence`, `RecurrenceKind`, `RecurrencePickerLabels`,
`recurrenceFor(kind, anchor?, previous?)`.

## `TimeTrigger` (`ui/primitives/TimeTrigger.tsx`, `data-kit="timeTrigger"`)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | |
| `value` | `string` (`HH:MM`, 24 h) | — | `''` = none |
| `onChange` | `(value: string) => void` | — | |
| `min` / `max` / `step` | `string` / `string` / `number` (s) | — / — / `60` | the native attributes |
| `face` | `'body' \| 'mono'` | `'body'` | `mono` = event-form's clock figures (`data-l`, Geist Mono 16, −1 %) |
| `placeholder`, `hint`, `hintTone`, `error`, `marker`, `markerTone`, `labelHidden`, `disabled`, `required`, `id`, `name`, `className` | | | as `DateTrigger` / `Field` |

Drawing: the kit `inputField` (label `cap-m`, 44 pt line, 1 px `edge` / 2 px lime focus / 2 px
`danger`, hint 8 under). No glyph. The control is the native `<input type="time">` laid over the
drawing and opened with `showPicker()` (tap, Enter, Space) — the `DateTrigger` pattern; nothing
re-implements a clock. Forwarded ref = the input.

## `Countdown` (`ui/data/Countdown.tsx`, `data-kit="countdown"`)

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `seconds` | `number` | — | drawn `mm:ss`, from an hour `h:mm:ss`; below 0 = 0 |
| `size` | `'giant' \| 'num'` | `'giant'` | the giant uses the fluid size (`--giant-fluid`) |
| `tone` | `'ink' \| 'pending'` | `'ink'` | `pending` = `text-3` (paused) |
| `padMinutes` | `boolean` | `true` | "05:00" |
| `srText` | `string` | the time | what a screen reader says (`role="timer"`, not live) |
| `className` | `string` | — | placement only |

Drawing (`focus-2.body.js` `countdown`, ruling DEV-003): every digit is centred BY ITS INK in a cell
65 / 124 em wide (widest digit ink + 6), the colon in a 41 / 124 em cell (its ink + 20); the box is
trimmed to cap and baseline (+0.01 em of round overshoot) and starts on the gutter with the first
cell. Measured on focus-2@2x: inks 29.5-83, 92.5-150, 164.5-185, 199.5-257, 267.5-319 from x 24.
Also exported: `formatCountdown(seconds, padMinutes?)`.

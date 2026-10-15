# Kit reference — data (lane DA, package F10)

The figures, bars and meters of Pulse: `Numeral`, `Fraction`, `StatBlock`, `SegmentBar`,
`MacroColumns`, `ProgressBar`, and `CountUp` / `DigitRoller` (the digit roller). Stage 2 of the
lane (`LedgerRow`, `Stepper`) is not in this page yet.

Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §2.1 (light levels), §2.2 (type ramp),
§2.4 (count-up), §4 (rows "Big numeral", "Week / segment bar", "Macro columns", "Progress bar").
Construction: `figma-build/app-kit.js` (`numeral`, `fraction`, `statBlock`, `segBar`,
`progressBar`, `macroCol`). Measured boxes: `.pulse/geometry/_components.json` (column 3) and the
frames `home-1`, `coins-1`, `progress-1`, `nutrition-1`, `workout-2`. Specimen:
`frontend/src/features/playground/kit/data.tsx`.

The API below is final. Changes after this page are additive only (R6).

## What a screen writes

```tsx
import { Fraction, Numeral } from '../../ui/data/Numeral';
import { StatBlock } from '../../ui/data/StatBlock';
import { SegmentBar } from '../../ui/data/SegmentBar';
import { MacroColumns } from '../../ui/data/MacroColumns';
import { ProgressBar } from '../../ui/data/ProgressBar';

// The labels below are variables on purpose: a screen uses ITS existing i18n keys (R22).

// home-1: the week as the hero — eyebrow, giant fraction, week bar
<StatBlock label={weekLabel}>
  <Fraction size="giant" value={done} of={planned} mode="roll" srText={weekSr} />
</StatBlock>
<SegmentBar label={weekLabel} segments={week} />           // [{ state: 'on' | 'half' | 'off', label: 'H', today?, srText? }]

// coins-1: the balance
<StatBlock label={balanceLabel}>
  <Numeral size="giant" value={coins} mode="roll" from={lastSeen} />
</StatBlock>

// progress-1: a giant with a unit on its baseline
<StatBlock label={weightLabel}>
  <Numeral size="giant" value={weight} format={{ maximumFractionDigits: 1 }} unit="kg" />
</StatBlock>

// workout-2: a countdown — fixed digit cells, so it never jumps sideways
<Numeral size="giant" value={clock} mode="tick" />
<ProgressBar tone="accent" value={left} max={total} label={restLabel} />

// home-1 / progress-1: the macro row
<MacroColumns columns={[{ name: proteinLabel, value: 128, unit: 'g', ratio: 128 / 180, caption: targetLine }, /* … */]} />

// nutrition-1: the same instrument one size up — eyebrow, num numeral + unit, bar, target
<MacroColumns size="num" columns={[{ name: proteinLabel, value: 128, unit: 'g', ratio: 128 / 180, caption: targetLine }, /* … */]} />
```

Rules that are not negotiable:

1. **One giant per screen** (Pulse System §1.5) — a giant numeral, a monogram or an image, one of them.
2. **Never a `text-…` class on a figure.** `className` is placement only (`self-start`, `mt-…`,
   `absolute …`). The giant's size mechanism is internal: the element carries `text-giant` and the
   fluid size is an inline style, `fontSize: var(--giant-fluid)` (= `min(124px, 31vw)`); a second
   `text-*` class would make `cn()` drop `text-giant` with its line height, weight and family.
3. **Place a figure by its edge, not by a nudge.** Every figure is ink-tight: its box IS its ink
   (below). Put it on the gutter and its ink is on x 24; put it 8 under an eyebrow (a `StatBlock`
   does) and its ink starts 8 under the eyebrow's line box — exactly the frames. Never add a
   negative margin to "fix" a figure.
4. **A number that changes while it is on screen says so** with `mode`: `tick` for a countdown,
   `roll` for a balance or a count. `static` (the default) is right for anything that is only ever
   rendered once per value.
5. **Over target is always `warn`** (bar and value), whatever tone is asked for. Lime is for the
   screen's ONE live datum (`ProgressBar tone="accent"`) and for done segments, nothing else.

## Ink-tight: what "the box is the ink" means

The Figma kit draws every big figure as a frame the size of its glyphs' INK (`app-kit.js`
`numeral`: "the frame IS the ink box"). A CSS text box is not that: Big Shoulders' "2" at 124 px
starts 5 pt right of its box and its cap line is 2.6 pt under the line box. `Numeral` and
`Fraction` therefore trim the element that draws the digits:

- top and bottom: `text-box: trim-both cap alphabetic` (Chrome 133+, Safari 18.2+) cuts the line
  box to the cap line and the baseline; a padding puts back what THIS string draws beyond them —
  0.01 em of round overshoot ("0", "2", "6", "8", "9"), the comma's tail (0.142 em, so "83,1" is
  118 tall at the giant, as in `progress-1`). Without `text-box` support the same box comes from two
  margins computed from the face's ascent, descent and cap height (tokens `--trim-display-t` /
  `--trim-display-b`, lane F10 block of `tokens.css`).
- left and right: a negative margin of the first glyph's left side bearing and of the last glyph's
  right side bearing plus the trailing tracking (Chrome adds the tracking after the last glyph).

The bearings are a table in `Numeral.tsx`, measured from the shipped woff2 in Chrome (pixel scan
at 1000 px, `pkg/F10/proofs/face-metrics.json`); they agree with the Figma export to 0.1 pt.

| Frame | Figure | Figma ink (x, y, w, h) | How the app gets there |
|---|---|---|---|
| home-1 | "2 / 4" giant under "Heti edzés" | 2: 24, 178.8, 52.2, 100.4 · /: 88.2, 180.1, 34.7, 99 · 4: 134.9, 180, 58.4, 99.2 | eyebrow 152-172, gap 8, the fraction's box starts on the cap line at 180 |
| coins-1 | "190" giant under "Egyenleged" | 24, 206, 147.6, 101.7 | eyebrow 178-198, gap 8, box = ink (round top and bottom included) |
| progress-1 | "83,1" giant + "kg" | 24, 232, 176.4, 118 | eyebrow 204-224, gap 8; the comma's tail is inside the box; "kg" 6 after the ink, on the baseline |

## `Numeral` — `ui/data/Numeral.tsx` · `data-kit="numeral"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `value` | `string \| number` | — | a string is drawn as given ("83,1", "2:59", "—"); a number is formatted in the app language (`toLocaleString(i18n.language, format)`) |
| `size` | `'giant' \| 'num'` | `'num'` | `giant` 124 / 108 Black, tracking −1 %, fluid to 31vw (111.6 at 360); `num` 48 / 48 Black |
| `tone` | `'ink' \| 'pending' \| 'warn'` | `'ink'` | `text-1` · `text-3` (planned, a zero) · `warning` (over target) |
| `mode` | `'static' \| 'tick' \| 'roll'` | `'static'` | see "When the value changes" |
| `from` | `string \| number` | — | `roll` only: roll in from this value when the figure first appears |
| `format` | `Intl.NumberFormatOptions` | — | for a numeric `value` / `from` |
| `unit` | `string` | — | `cap` 13 / 18 `text-2`, on the digits' baseline, 6 after the ink of a giant, 4 after a `num` |
| `srText` | `string` | — | what a screen reader says instead; the drawn figure is then `aria-hidden` |
| `className` | `string` | — | placement only |

Renders `<span data-kit="numeral" data-size data-mode class="inline-flex items-baseline text-giant|text-num …">`
holding the trimmed digits (`<span class="inline-block [text-box:…]">`) and the unit. At rest, in
`static` and `roll`, the digits are ONE text node — exactly a string. The element is inline: it
hugs its figure and stands where its parent puts it.

## `Fraction` — `ui/data/Numeral.tsx` · `data-kit="fraction"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `value` | `string \| number` | — | the part that is done — `text-1` |
| `of` | `string \| number` | — | the whole — `text-3`, like the slash |
| `size` | `'giant' \| 'num'` | `'num'` | the same two roles |
| `mode` | `'static' \| 'tick' \| 'roll'` | `'static'` | applies to `value`; the whole is static |
| `srText` | `string` | `"2 / 4"` | what a screen reader says |
| `className` | `string` | — | placement only |

Three inks 12 apart at the giant, 6 at `num` (`app-kit.js` `fraction(a, b, role, gap)`: home-1 and
the board use 12 for the giant, ledger rows 6 for `num`). The slash is set at 80 % of the size
(99 at the giant, 38 at `num`), so its ink is exactly one cap high. The box is one cap high from the
whole's cap line (home-1: 170 x 99).

## `StatBlock` — `ui/data/StatBlock.tsx` · `data-kit="statBlock"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `ReactNode` | — | the eyebrow (`eyebrow` 16 / 20 Bold, upper case, `text-2`) — also the block's accessible name |
| `children` | `ReactNode` | — | the figure: a `Numeral` or a `Fraction` |
| `caption` | `ReactNode` | — | one line under the figure, `cap` `text-2` ("érme") |
| `className` | `string` | — | placement only |

`<div role="group" aria-labelledby>`: eyebrow → 8 → figure → 8 → caption, left-aligned, as wide as
its widest line (`w-fit`). The hero block directly under a header has no rule above it. Its face is
the display face (the capture tool checks the family of every `statBlock`).

## `SegmentBar` — `ui/data/SegmentBar.tsx` · `data-kit="segBar"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `segments` | `readonly Segment[]` | — | one by one: `{ state: 'on' \| 'half' \| 'off', label?, today?, srText? }` |
| `value`, `total` | `number` | — | OR a count: `value` of `total` lit from the left (a `progressbar` with `aria-valuenow`) |
| `thin` | `boolean` | `false` | 4 pt segments 4 apart (the stepper's bar) instead of 6 pt, 8 apart |
| `label` | `string` | — | the accessible name |
| `className` | `string` | — | placement and width; the bar fills the width it is given |

Segments share the width equally (home-1: 7 × 43.7 on 354), square-ended to 1 pt (`rounded-bar`).
Levels: `on` = `accent`, `half` = `text-1` at 50 %, `off` = `track`. With labels each column is
`segment → 8 → label (data 13 / 18, text-3; today text-1) → 4 → 4 pt dot (today only)` — 40 tall.
`segments` with labels is a `list` of `listitem`s; give each an `srText` ("Péntek: tervezett, ma").
Motion: a level is a layer whose opacity changes in `--duration-fast`, segments 60 ms apart left
to right — only on a change, never on the first paint.

## `MacroColumns` — `ui/data/MacroColumns.tsx` · `data-kit="macroColumns"`, each column `macroCol`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `columns` | `readonly MacroColumn[]` | — | two to four: `{ name, value, unit?, ratio?, caption? }` |
| `size` | `'data' \| 'num'` | `'data'` | `data`: the macro row of Home and Haladás; `num`: the same instrument one size up, as Táplálkozás draws its trio (added after the first commit — additive) |
| `className` | `string` | — | placement; the row fills the width it is given |

`size="num"` (nutrition-1 "Macro row", 3 × 107.3, 109 tall): each column is a `StatBlock` (the name
as the eyebrow over a `num` numeral with its unit 4 after the ink) → 12 → the bar → 8 → the caption.

A `data` column: name (`cap` `text-2`) → 4 → figure (`dataL` 16 / 20 mono, `text-1`; unit `cap` `text-2`
4 after it, on its baseline) → 8 → 4 pt `ProgressBar` (only when `ratio` is a number) → 8 →
caption (`cap` `text-3`). Columns share the width, 16 apart (home-1: 4 × 76.5), stand at the top of the row and hug their
own content (a column without a bar is shorter, as on the board). `ratio > 1` = over target: value
and bar `warn`. `ratio` absent or `null` = no target: no bar (progress-1 draws a date as the caption
instead). No tiles, no glyphs.

## `ProgressBar` — `ui/data/ProgressBar.tsx` · `data-kit="progressBar"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `value` | `number` | — | on the scale 0 … `max` |
| `max` | `number` | `1` | so `value` may be a ratio |
| `tone` | `'ink' \| 'accent' \| 'warn'` | `'ink'` | `accent` only for the screen's ONE live datum (nutrition-1 calories, workout-2 rest); over `max` is always `warn` |
| `label` / `labelledBy` | `string` | — | the accessible name — one of them is required |
| `valueText` | `string` | — | what a screen reader says for the value ("1840 / 2600 kcal") |
| `className` | `string` | — | placement and width |

4 pt `track` line, fill `max(1 px, w × min(value / max, 1))` square-ended to 1 pt — the kit draws a
1 pt sliver at zero. `role="progressbar"` with min / max / now. Motion: the width is final on the
first frame; a change is shown as a scale from the old width (`--duration-base`, transform only).

## `CountUp` and `DigitRoller` — `ui/feedback/CountUp.tsx`

`CountUp({ to, from = 0, duration? })` keeps the API the hybrid screens call. It is now the digit
roller: the digits that differ ROLL from `from` to `to` once, in `--duration-slow` on
`--ease-standard` — no sweep through the numbers in between. `duration` is deprecated and ignored
(UI motion never exceeds 500 ms); screen packages remove it.

`DigitRoller` is the visual half both use:

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `text` | `string` | — | the formatted figure as it stands now |
| `cells` | `boolean` | `false` | every digit centred in a fixed-width cell (a number that ticks) |
| `cell` | `string` | `'1ch'` | the cell width; `1ch` suits a face with tabular figures, `Numeral` passes its face's widest digit |
| `roll` | `boolean` | `true` | roll the changed digits when `text` changes |
| `fromText` | `string` | — | roll in from this figure on first appearance |
| `direction` | `'up' \| 'down'` | `'up'` | `up`: the new digit comes from below |
| `className` | `string` | — | placement |

While rolling (and always with `cells`) the drawn digits are `aria-hidden` and an `sr-only` copy
says the final figure. A timer one roll later removes the outgoing layer even if no frame ran: a
figure never keeps showing its old value. Reduced motion: no roll, the figure just changes.

## When the value changes (`mode`)

Big Shoulders Display has no tabular figures ("1" is 0.274 em wide, "5" 0.515 em; DEV-003).

| `mode` | Use | At rest | On a change |
|---|---|---|---|
| `static` | a figure rendered once per value | exactly as drawn | it is simply the new figure |
| `roll` | a balance, a count, a weekly total | exactly as drawn (one text node) | reflows once to the new width, the changed digits roll in `slow` |
| `tick` | a countdown, a stopwatch | every digit in a 0.515 em cell (the widest digit), ":" and "," as they are | the cells stay put: nothing jumps sideways |

`tick` draws a figure slightly wider than the frame where it holds a "1" (a countdown frame is a
sample; the jump is the defect it prevents). The probe then reports the countdown's text as not
matched by string: each digit is its own text node.

## Not interactive

None of these takes focus or a pointer, so they have no pressed, disabled, busy or focus state.
A row that opens something (a ledger row, a macro row that links to Táplálkozás) is a `ListRow` /
`LedgerRow` around them; the press state is the row's (60 % opacity).

## Measured (F10 stage 1, `.pulse/pairs/F10/`)

Pixel ink of every big figure, app (built, Chrome 155, 402 pt, scale 2) against the frame's 2x PNG,
the components placed where the frame's geometry puts their kit layer:

| Frame | Figure | Ink delta (dx, dy, dw, dh pt) | Kit boxes |
|---|---|---|---|
| home-1 | "2" / "/" / "4" giant | 0, 0, 0, −0.5 · 0, 0, −0.5, 0 · 0, 0, 0, 0 | statBlock, segBar, 4 × macroCol, 4 × progressBar: ≤ 0.7 |
| coins-1 | "190" giant | 0, −0.5, 0.5, 0 | statBlock ≤ 0.4 |
| progress-1 | "83,1" giant + kg | 0, −0.5, 0, 0 | statBlock ≤ 1.0, 4 × macroCol 0 |
| nutrition-1 | "1840" giant, "128" "210" "52" num | ≤ 0.5 | statBlock, progressBar, 3 × macroCol (`size="num"`) ≤ 0.8 |
| coach-dashboard-1, admin-1 | "6", "19" giant | 0, −0.5, 0, 0 | statBlock ≤ 0.3 |
| workout-2 | "2:59" giant, `static` / `tick` | 0, −0.5, 0, 0 / **3, −0.5, 1, 0** | progressBar 0 |

The `tick` countdown stands in fixed cells (DEV-003), so its ink starts 3 pt right of the frame's
"2:59"; the capture tool's text probe finds the countdown through its screen-reader copy, so judge a
`tick` figure on the picture, not on the probe line. The giant at 360 pt: family Big Shoulders
Display, weight 900, line height 108, size 111.6 (402 pt: 124) — the `text-giant` step with the
fluid size inline. Without `text-box` support (forced off) the boxes are the same to 0.02 pt.

# Kit reference — charts (lane CH, package F14)

Lines over time: the kit's `sparkline` and the two charts the frames build from it.
Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §7 ("Sparkline / chart"), the kit function
`sparkline()` in `figma-build/app-kit.js`, the frames `client-detail-3` ("Chart/Bench Press"), `progress-1`
("Trend/Testsúly" > "Chart") and `settings-1` (the Profil weight row), measured in `.pulse/geometry/`.
Specimen: `frontend/src/features/playground/kit/charts.tsx`.

The API below is final. Changes after this page are additive only (R6).

## The rules a screen has to know

1. **No area, no grid box, no card.** A 1.5 px line with round caps, ONE end dot for the last reading,
   hairline axes, mono scale figures. The lime is only ever the end dot of a chart (the live reading).
2. **x is time.** Positions come from `chartGeometry.plot()`; a pause shows as distance. A step of
   **14 days or more** (`GAP_DAYS`) is drawn dotted (`1 5`, the quiet ink `--text-3`) and the longest
   one is named between the axis dates with the existing `progress.gap` ("{{count}} nap kihagyás").
3. **Fewer than three readings draw no chart**: `TrendChart` prints the `emptyKey` sentence instead.
4. **The table is the content.** `TrendChart` renders the series as a visually hidden table (caption =
   `label`, headers `progress.date` + `label`). The drawing is `aria-hidden`.
5. **The change is neutral unless the caller knows better** (`direction`): success ink only when the
   direction is known AND the change went that way; otherwise the secondary ink. Body data stays
   `neutral` (hard product rule, progress screen note).
6. A chart is not interactive: no tap, no tooltip, no range switch, so there is no pressed, disabled,
   busy or focus state.

## `Sparkline` — `frontend/src/ui/feedback/Sparkline.tsx` · `data-kit="sparkline"`

```tsx
import { Sparkline } from '../../ui/feedback/Sparkline';

<Sparkline series={weight} width={120} height={28} />                 // the Profil ledger row (settings-1)
<Sparkline series={weight} />                                         // the board's default, 140 x 32
<Sparkline series={weight} width={354} height={96} tone="live" fluid /> // full width, lime end dot
```

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `series` | `TrendPoint[]` (`{ date: 'YYYY-MM-DD', value }`, oldest first) | — | the readings. Empty → renders nothing |
| `width` | `number` | `140` | pt. With `fluid` it is the design width the 3 pt air is measured against |
| `height` | `number` | `32` | pt |
| `tone` | `'quiet' \| 'live' \| 'ink'` | `'quiet'` | `quiet`: line `--text-2`, end dot `--text-1` (a glance in a row). `live`: line `--text-1`, end dot `--accent`. `ink`: line `--text-1`, end dot `--text-1` (a chart that is not the screen's live datum, e.g. admin-statistics-1's coin curve beside the lime-ended activity curve) |
| `fluid` | `boolean` | `false` | fill the container's width; the line, the dots and the dash keep their size, only x reflows |
| `className` | `string` | — | placement only |

Geometry (the kit's): 3 pt of air on every side, end dot radius 3, stroke 1.5, round caps and joins,
breaks `stroke-dasharray="1 5"` in `--text-3`. Renders one `<svg data-kit="sparkline" aria-hidden>`; x is
written as a percentage of the drawing's width (no `viewBox`, so nothing is ever stretched).

Also exported, for the two charts: `SPARK_PAD` (3) and `TrendLine` (the drawing itself — positions from
`plot()` in, runs / dotted breaks / reading dots / end dot out). A screen uses `Sparkline` or `TrendChart`,
never `TrendLine`.

## `TrendChart` — `frontend/src/ui/feedback/TrendChart.tsx` · `data-kit="trendChart"`

```tsx
import { TrendChart } from '../../ui/feedback/TrendChart';

// client-detail-3: a chart with its own head (the default)
<TrendChart series={s} unit="kg" label="Bench Press" direction="up" />

// progress-1: the screen's anchor, under the screen's own Stat block (eyebrow + giant value + unit)
<TrendChart variant="stage" series={s} unit="kg" label={t('progress.metricName.weight')} />
```

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `series` | `TrendPoint[]` | — | readings, oldest first; fewer than 3 → the `emptyKey` sentence (`text-cap`, `--text-2`) |
| `unit` | `string` | — | printed once: after the value (`titled`) or above the scale (`stage`) |
| `label` | `string` | — | the name in the head (`titled`); always the caption of the hidden table |
| `direction` | `'up' \| 'down' \| 'neutral'` | `'neutral'` | which way is good, for the change's ink |
| `className` | `string` | — | placement only (it lands on the `<figure>`) |
| `emptyKey` | `string` | `'progress.notEnough'` | the sentence for fewer than three readings |
| `variant` | `'titled' \| 'stage'` | `'titled'` | **added by F14** — see below |
| `height` | `number` | 96 / 185 | **added by F14** — the plot's height in pt |

### `variant="titled"` — `client-detail-3`, "Chart/Bench Press" (354 x 197 at 402 pt)

- Head, 44 high, ONE baseline 40 down: the name (`text-body-m`, `--text-1`, truncates) on the left; on the
  right the change (`text-data-l`, success or `--text-2`), 9 pt, the last value (`text-num`, Big Shoulders
  48/48), 3 pt, the unit (`text-cap`, `--text-2`), right on the content edge.
- 16 under it the plot, 96 high: the kit sparkline (`live`) over the content width minus 54; the three scale
  figures (`text-data`, `--text-3`: max / middle / min of the data; one when flat) right-aligned on the
  content edge, centred on the line's top, middle and bottom.
- 16 under it the axis: a hairline (`bg-hair`), 6 under it the first date, the break (a 6 pt `--warning`
  dot + `text-cap-m` in `--text-1`) and the last date, which ends where the line ends.

### `variant="stage"` — `progress-1`, "Chart" (354 x 239 at 402 pt)

The screen draws the eyebrow, the giant value, its unit and the picture ABOVE the chart (`StatBlock`,
lane DA); the chart does not repeat them.

- Head, 20 high: the change (`text-data-l`) on the left, the scale's unit (`text-cap`, `--text-3`) on the
  right. The name is in the caption for a screen reader only.
- 8 under it the plot (`height`, default 185): one hairline per scale value over the content width minus 44
  (`stroke-hair`; the lowest one `stroke-hair-strong` — it is the axis), the scale figures right-aligned on
  the content edge and centred on their hairline, holding ONE precision (`88,6 / 85,8 / 83,0`). The line in
  `--text-1`, a 2 pt dot on every reading, a 4 pt lime dot on the last; air 2 left, 4 right, 5.5 above and
  below (the dots' radii).
- 8 under it the dates, the break named between them in `text-cap` `--warning` (no dot, no chip).

Both forms: the date row gives up the room under the scale column before anything else when a phone is
narrow (360 pt and less), so the break label is never cut to an ellipsis; the line, its dots and its
dash keep their pt size at every width (only x reflows).

Figures: values and scale through `formatMeasure` (`83,1`, `100,3`); the change carries `+` or a true minus
`−` (U+2212), as the frames print it; dates are the raw ISO strings the API sends (screen notes: a known
locale defect, not this lane's to change).

## `ProgressChart` — `frontend/src/ui/feedback/ProgressChart.tsx`

Unchanged API: `points`, `measure`, `unit`, `label`, `className`. A mapper over `TrendChart` (default
`titled`): picks the measure's column, drops empty readings, and sets `direction` — `down` for
`best_seconds` (less time is better), `up` for everything else. It draws whatever `TrendChart` draws.

## `chartGeometry.ts` — pure, no React

Kept: `Plotted`, `plot`, `linePath`, `areaPath` (no chart draws an area any more), `longestGapDays`.
Added (F14): `Inset`, `PlotBox`, `GAP_DAYS` (14), `splitAtGaps(pts, gapDays?)` → `{ solid, gaps }`,
`scaleTicks(values, box)` → `[{ value, y }]` with the same mapping as `plot`. `plot`'s `pad` now also takes
a per-side `Inset`; a number means what it always meant. `check:interval` still proves the old exports.

## For the screen packages

- **S-client-detail-b** (`ProgressTab.tsx`): drop the card classes it passes as `className`
  (`rounded-card border … bg-surface-1 p-4`) — the frame has no box — and stack the charts 32 apart under
  the section head. Its own "not enough" fallback should use `text-cap` like `TrendChart`'s.
- **S-progress** (`ProgressPage.tsx`): drop the `<Surface>` around the chart, draw `Stat/<metric>`
  (eyebrow, giant value, unit, `hero-tape`) above it, and pass `variant="stage"` (and `height` if its fold
  needs another plot height than 185).
- **S-settings**: the Profil weight row's line is `<Sparkline series={…} width={118} height={28} />` (the
  frame's 118; the board's 120) inside the ledger row (lane DA).
- `AdminMetrics.tsx` (unmounted, no frame) keeps the default `titled` chart with its own `emptyKey`.

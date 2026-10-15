# Kit reference — selection (lane SEL, package F8)

Stage 1: `BadgeCount`, `Segmented` in its two Pulse forms, `LanguageToggle`.
Stage 2 (additive, section "Stage 2" at the end): `ChipRow` / `Chip`, `Toggle`, `Switch`, `CheckMark`,
the `CopyButton` skin, and one additive prop on `Segment` (`mark`).

Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §1 rule 3, §2.2, §2.4 ("Ignite"), §4 (rows
"Segmented switch", "Badge / tag", "Icon button"). Construction: `figma-build/app-kit.js` line 208
(`badgeCount`), 214-221 (`chipRow`, `segSwitch`). Measured boxes: `_components.json`, cells
`iconBtn` (`Badge/count`) and `segSwitch` (hug, equal cells); in the frames `home-1` (badge),
`auth-1` / `settings-2` (language), `coins-1`, `progress-1`, `admin-1` (cells), `library-1`,
`workout-1`, `exercise-detail-1` (hug), `client-detail-1` (hug on a hairline).
Specimen: `frontend/src/features/playground/kit/selection.tsx`. On the `/playground` board its two
cells "segSwitch · hug — ink mark = neutral selection" and "segSwitch · equal cells on a hairline"
take the board's own cells; the badge appears in the actions lane's "iconBtn · badgeCount 2 / 99+ …"
cell (stage-1 hand-in `pkg/F8/1/shared.patch`, `kit/actions.tsx`, merged); every other state cell (pressed, keyboard
focus, busy, failed, read-only, disabled, the live count, the ruled hug, the language switch) is
listed after the board.

The API below is final. Changes after this page are additive only (R6).

## What a screen writes

```tsx
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { BadgeCount } from '../../ui/primitives/BadgeCount';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';

// a view switch in a section head or beside a figure — kit: segSwitch (hug)
<Segmented label={t('muscleMap.viewLabel')} options={sides} value={side} onChange={setSide} />

// page-level tabs: equal cells across the content width, on a hairline — kit: segSwitch(labels, sel, P.cw)
<Segmented layout="cells" label={…} options={tabs} value={tab} onChange={setTab} />

// a live count after a word (admin "Moderáció 3"): mono, lime, 6 after the word
<Segmented layout="cells" label={…} options={[…, { value: 'moderation', label: …, count: pending }, …]} … />

// a hug switch seated on a full-width hairline, the mark on the line (client page)
<Segmented rule label={…} options={…} value={…} onChange={…} />

// the language switch: auth footer, the "Nyelv" section head
<LanguageToggle />

// the count on the bell — inside the 44 pt icon button, which is `position: relative`
<Pressable variant="link" shape="icon" aria-label={t('notifications.withUnread', { count })}>
  <Bell />
  <BadgeCount count={count} capped={capped} />
</Pressable>
```

Rules that are not negotiable (Pulse System §1, §2.2, §4):

1. **Words, not a capsule.** A segmented switch has no track, thumb, fill, border or icon. An `icon`
   passed in an option is not rendered (it stays in the type until the call site is rebuilt, R5).
2. **The mark is INK** (`text-1`) — the switch changes the view, not the subject. A lime mark is a
   *filter* (`ChipRow`, stage 2).
3. **Selection never changes weight.** Both states are `body-m` (Geist Medium 16 / 22); only the ink
   (`text-1` / `text-2`) and the mark change.
4. **The badge is on the bell only.** Never on a tab, never a dot, never red. Hidden at 0.
5. **`className` is placement only** (`self-start`, `shrink-0`, a margin). Never a colour, a size, a
   radius or a padding.

## `Segmented` — `frontend/src/ui/feedback/variants/E6Segmented.tsx` · `data-kit="segSwitch"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `options` | `readonly SegmentedOption<T>[]` | — | `{ value, label, icon?, count?, lang? }` |
| `value` | `T` | — | the chosen option |
| `onChange` | `(next: T) => void \| Promise<unknown>` | — | commit. A promise is READ: busy while pending, the mark ignites on resolve, the word turns `danger` for 2.4 s on reject (the mark stays: the value never moved) |
| `label` | `string` | — | the group's accessible name |
| `layout` | `'hug' \| 'cells'` | `'hug'` | see the numbers below |
| `rule` | `boolean` | `false` | `hug` only: seat the control on a full-width hairline, the mark on the line (`cells` always is) |
| `readOnly` | `boolean` | `false` | the settled answer: full contrast, in the tab order, `aria-disabled` on each option, does nothing |
| `disabled` | `boolean` | `false` | unavailable: 40 %, out of the tab order |
| `className` | `string` | — | placement only |

`SegmentedOption<T>`:

| Field | Type | Meaning |
|---|---|---|
| `value` | `T` | |
| `label` | `string` | the word (already translated) |
| `icon` | `ReactNode` | BRIDGE — not rendered |
| `count` | `number` | a live count after the word (`data` 13 / 18 mono, `accent`, 6 after the word, on its baseline); not rendered at 0 or below; part of the option's accessible name |
| `lang` | `string` | `lang` on the option, for a label in another language |

Behaviour (kept from the E6 control, PLAN 5.2 row 9):

- `role="radiogroup"` + `aria-label`; each option `role="radio"` + `aria-checked`. ONE tab stop
  (roving `tabindex`). Arrow Right / Down and Left / Up move AND select, wrapping, and focus follows
  the selection. Read-only and disabled controls ignore the arrows.
- Busy: `aria-busy` on the option, three dots over the word. A polite `role="status"` says
  `common.loading` → `home.done` → (on failure) `common.retry`.
- Two commits in flight: only the latest may write the status.

### The two forms, in numbers

| | hug | cells |
|---|---|---|
| Control | as wide as its words, 44 high | 100 % of its container, 44 high |
| Options | hug their words, **24 apart**, left-aligned; each option's BOX reaches 8 past its word on either side (padding given back in negative margins, so the layout is the words) | equal shares (`flex: 1 1 0`), word centred |
| Word | `body-m` 16 / 22 Medium; chosen `text-1`, others `text-2`; the line box at y 11 | the same |
| Mark | 2 pt `text-1`, the width of the word, at **y 37** (4 under the line box) | 2 pt `text-1`, the width of the CELL, at **y 42** — on the line |
| Hairline | none (`rule`: 1 pt white 8 % under the full width at y 43, mark at y 42) | 1 pt white 8 % (`bg-hair`) under the full width, at y 43 |
| Count | — | `data` mono 13 / 18, `accent`, 6 after the word, baseline-aligned |

### States

| State | Look |
|---|---|
| Rest | chosen `text-1` + mark, others `text-2` |
| Ignite (a choice) | the new mark fades in over `--duration-fast` where it lands; the old one fades out where it was. Nothing slides. Reduced motion: instant |
| Pressed | the option at 60 % (`--pressed-opacity`), in `--duration-fast`; no scale |
| Keyboard focus | 2 px `--focus-ring` (lime) outline, 2 px off the option's 44 pt frame (a hug option: the word + 8 either side, as around a text link) |
| Busy | three 6 pt dots in the word's ink at 100 / 60 / 30 %, centred over the word, which keeps its width; `cursor: progress` |
| Failed | the word in `danger` for 2.4 s; the mark stays on the old value |
| Read-only | as rest; no pressed look, `cursor: default` |
| Disabled | the whole control at 40 % (`--disabled-opacity`) |

**Hit floor.** A hug option lays out as wide as its word ("Elöl" is 28 pt), so its box reaches 8 past
the word on either side (44 for "Elöl", the shortest word a hug switch carries; the capture's target
probe reads that box), and an invisible `::after` layer centred on it keeps 44 for anything
shorter — the target, not the layout. Options 24 apart keep 8 between their boxes; a row of
one-character labels belongs in `cells`.

### `Segment` — the face, for a composite that is not a radiogroup

`Segment` (same file) is one option: the `<button>` with the word, the optional count, the mark and
the busy dots. `Segmented` uses it as a `radio`; `LanguageToggle` as a pressed button. Props:
`selected`, `layout`, `onRule` (default: `layout === 'cells'`), `busy`, `failed`, `count`, `children`
(the word) and every `<button>` attribute. Put it in a `data-kit="segSwitch"` row (`inline-flex
gap-6` for hug). A screen does not need it: it uses `Segmented` or `LanguageToggle`.

## `LanguageToggle` — `frontend/src/ui/nav/LanguageToggle.tsx` · `data-kit="segSwitch"`

```tsx
<LanguageToggle />                        // auth footer
<LanguageToggle className="shrink-0" />   // the trailing node of the "Nyelv" section head
```

The hug `segSwitch` with the three native names from the locale registry (`Magyar`, `English`,
`Deutsch` — never translated). Each option is a button with `aria-pressed` and `lang`; the row is a
`role="group"` named `common.language`. A press switches the language at once (`setLanguage`). Only
prop: `className` (placement).

## `BadgeCount` — `frontend/src/ui/primitives/BadgeCount.tsx` · `data-kit="badgeCount"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `count` | `number` | — | nothing is rendered at 0 or below |
| `capped` | `boolean` | `false` | the server capped the count: "99+". Any count above 99 also shows "99+" |
| `placement` | `'corner' \| 'inline'` | `'corner'` | `corner`: absolute on the top-right corner of a 44 pt icon button (the button is `relative`); `inline`: in the flow |
| `className` | `string` | — | placement only |

| | Number |
|---|---|
| Box | 18 high, at least 18 wide (`--badge-h`), fully round |
| Figure | `tab-on` — Geist SemiBold 11 / 14, +1 % — in `accent-fg` (the canvas), 5 from either edge (`--badge-pad-x`) |
| Fill | `accent` |
| Ring | 2 pt of the canvas OUTSIDE the lime (an outline: it adds no size, like the kit's outside stroke) |
| Corner | x 26, y 0 in the 44 pt button: the left edge 18 in from the right edge, so "99+" (31 wide) grows to the right, as drawn |

`aria-hidden`: the count goes into the host's accessible name (`notifications.withUnread`). It is not
interactive (`pointer-events: none`), has no pressed, focus or busy state, and is never focusable.

## Tokens this lane added (`tokens.css`, block `lane:F8`, handed in as `pkg/F8/1/shared.patch`, merged)

| Token | Value | Used by |
|---|---|---|
| `--badge-h` | 18px | the badge's height, minimum width and corner offset |
| `--badge-pad-x` | 5px | the badge's side padding (off the 4 pt grid on purpose: it centres one digit in the circle) |

Tokens it reads: `--text-1`, `--text-2`, `--accent`, `--accent-fg`, `--surface-0`, `--danger`,
`--surface-border` (`bg-hair`), `--focus-ring`, `--pressed-opacity`, `--disabled-opacity`,
`--target-min`, `--duration-fast`, `--ease-standard`.

## Variant elements

E6 (Segmented control) is one Pulse look: the letter is not read any more, and the element is handed
in as `live: false` (stage 1, `pkg/F8/1/variants.json`, merged). E2 (CopyButton) is one Pulse look
since stage 2 (`pkg/F8/2/variants.json`).

## For the kit specimen and for captures only

`data-force="pressed"` and `data-force="focus"` on a segment show the pressed look and the focus ring
without a finger or a keyboard — the segment answers with the same declarations as `:active` and
`:focus-visible`. Nothing in the product sets the attribute.

---

# Stage 2

Construction: `figma-build/app-kit.js` line 211 (`chipRow`), 238 (`uiSwitch`), 239 (`setCheck`), 209
(`iconBtn`, for the copy button). Measured boxes: `_components.json`, cells "chipRow · filter",
"chipRow · multi-select, wrap", "uiSwitch · on / off / disabled — as a listRow trail", "setCheck ·
done (lime tick) / to do (ring)"; the copy button in `coach-dashboard-1.body.js` lines 142-148 (the
code sheet of `coach-dashboard-2`). Specimens: `kit/selection.tsx` — the four board cells take the
board's own cells on `/playground`; pressed, keyboard focus, busy, failed and disabled are listed
after the board.

## What a screen writes

```tsx
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { Toggle } from '../../ui/primitives/Toggle';
import { Switch } from '../../ui/primitives/Switch';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { CopyButton } from '../../ui/feedback/variants/E2CopyButton';

// a filter you can switch off again (library muscle, marketplace kind) — one line, scrolls sideways
<ChipRow label={t('library.muscle')} className="-mr-6 pr-6">   {/* bleed past the right gutter */}
  {muscles.map((m) => (
    <Chip key={m.slug} selected={muscle === m.slug} onClick={() => setMuscle(muscle === m.slug ? undefined : m.slug)}>
      {nameOf(m)}
    </Chip>
  ))}
</ChipRow>

// multi-select (equipment): wraps inside the content width
<ChipRow wrap label={t('settings.equipment')}>
  {options.map((eq) => <Toggle key={eq.id} on={current.includes(eq.id)} label={eq.name} onToggle={() => toggle(eq.id)} />)}
</ChipRow>

// a setting row: the switch in the ListRow's control slot, labelled by the row's title
<ListRow title={t('cues.voice')} titleId="cue-voice" control={<Switch labelledBy="cue-voice" checked={on} onChange={setOn} />} />

// the set check / the radio mark of a single-choice list — a picture inside the host
<ListRow role="radio" aria-checked={level === 'pro'} title={…} control={<CheckMark done={level === 'pro'} />} onClick={…} />

// the join code: unchanged call site
<CopyButton value={code} label={t('common.copy')} />
```

Rules (Pulse System §1, §2.4, §4):

1. **A chip is a word.** No fill, no outline, no capsule, no check glyph. Selected = `text-1` + the
   2 pt LIME mark; idle = `text-2`. Lime because a filter changes the subject; the segmented
   switch's mark is ink.
2. **Selection never changes weight** (`body-m` in both states).
3. **Nothing slides.** Chip mark, switch fill and knob, check tick, copy glyph: each change is an
   ignite — the new state fades in over `--duration-fast` where it lands, the old one fades out.
   Reduced motion: instant.
4. **`className` is placement only.** The bleed of a one-line chip row past the right gutter is
   placement (`-mr-6 pr-6`; `-mr-4 pr-4` under 376), the screen's to write.

## `ChipRow` — `frontend/src/ui/primitives/ChipRow.tsx` · `data-kit="chipRow"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | the group's accessible name |
| `wrap` | `boolean` | `false` | multi-select: wrap inside the container (lines 44 apart). Without it: one line that scrolls sideways inside itself |
| `role` | `'group' \| 'radiogroup'` | `'group'` | `radiogroup` when the chips are `role="radio"` |
| `disabled` | `boolean` | `false` | the whole row at 40 %, inert |
| `className` | `string` | — | placement only |
| `children` | `ReactNode` | — | `Chip`s or `Toggle`s |

## `Chip` — same file

A chip inside a row carries no `data-kit` of its own; a chip used alone wraps itself in a
`data-kit="chipRow"` row of one.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `selected` | `boolean` | — | `text-1` + the lime mark |
| `busy` | `boolean` | `false` | three dots over the word, which keeps its width; `aria-busy` |
| `failed` | `boolean` | `false` | the word in `danger` (the caller times it) |
| `role` | `'checkbox' \| 'radio' \| …` | — | with `checkbox` / `radio` the chip writes `aria-checked`; otherwise `aria-pressed` (a toggle button) |
| … | every `<button>` attribute | | `onClick`, `disabled` (40 %), `lang`, `tabIndex`, `data-force` |
| `children` | `ReactNode` | — | the word |

### In numbers

| | |
|---|---|
| Chip | 44 high; the layout is the word (`body-m` 16 / 22 Medium, line box at y 11); the BOX reaches 8 past the word on either side (the target, the focus ring), given back in negative margins inside a row |
| Spacing | words 24 apart; wrapped lines 44 apart (no row gap) |
| Mark | 2 pt `accent`, the width of the word, at y 37 (4 under the line box) |
| Alone | outside a `ChipRow` the 8 either side stays as padding: in a `gap-tight` (8) row the words stand 24 apart, and the first word stands 8 in from the row's edge — a screen with a row of chips uses `ChipRow` |

### States

| State | Look |
|---|---|
| Rest | idle `text-2`, selected `text-1` + lime mark |
| Ignite | the mark fades in `--duration-fast` where it lands, the old one fades out; nothing slides |
| Pressed | 60 % (`--pressed-opacity`) in `--duration-fast`; no scale |
| Keyboard focus | 2 px `--focus-ring` outline, 2 off the chip's box (the word + 8 either side) |
| Busy | three 6 pt dots in the word's ink at 100 / 60 / 30 %, over the word |
| Failed | the word in `danger` |
| Disabled | 40 % (`--disabled-opacity`), `cursor: not-allowed` |

## `Toggle` — `frontend/src/ui/primitives/Toggle.tsx` (a `Chip`)

`{ on: boolean; label: string; onToggle: () => void; disabled?: boolean; busy?: boolean }` — the
three existing props kept, two added. A `Chip` with `role="checkbox"` + `aria-checked`. Its old look
(a `primary` / `secondary` chip pill with a check glyph) is gone everywhere it is used, at once.

## `Switch` — `frontend/src/ui/primitives/Switch.tsx` · `data-kit="uiSwitch"` (on the track)

| Prop | Type | Meaning |
|---|---|---|
| `checked` | `boolean` | |
| `onChange` | `(next: boolean) => void` | |
| `labelledBy` / `label` | `string` | the id of a visible label (the row's title), or an `aria-label` |
| `describedBy` | `string` | e.g. the row's sub line that says why it is disabled |
| `disabled` | `boolean` | 40 % on the track |
| `id`, `className` | `string` | `className`: placement only |
| `data-force` | `'pressed' \| 'focus'` | kit specimen and captures only |

| | Number |
|---|---|
| Track | 48 × 28, fully round (14); on `accent`, off `surface-3` |
| Knob | 22, 3 in from the edge; on: `accent-fg` (the canvas) on the right; off: `text-2` on the left; no shadow |
| Target | the button is 48 × 44, the track centred in it, the 16 above and below given back in negative margins: the layout is the 48 × 28 track (a row with a switch stays 56) and a switch in a row ends on the row's right edge |
| Focus | 2 px `--focus-ring`, 2 off the TRACK |
| Change | the track colour and the two knobs cross-fade in `--duration-fast`; the knob does not travel |
| Pressed / disabled | 60 % / 40 % |

`role="switch"` + `aria-checked` kept. No busy state: a setting takes effect at once, and the kit
draws none, so none is invented.

## `CheckMark` — `frontend/src/ui/primitives/CheckMark.tsx` · `data-kit="setCheck"`

`{ done: boolean; className?: string }`. A 44 × 44 frame, `aria-hidden`: to do = a 24 ring, 1.5
`edge`; done = the bare tick (Lucide `check`) at 24, stroke 2.5, `accent`. The two cross-fade in
`--duration-fast`. A picture, not a control: role, state, pressed, focus and target belong to the
host (the set row's check button, a radio row).

## `CopyButton` — `frontend/src/ui/feedback/variants/E2CopyButton.tsx` · `data-kit="iconBtn"`

`{ value: string; label: string; disabled?: boolean; demo?: 'busy' | 'done' | 'error'; 'data-force'? }`
— `value` and `label` unchanged; the rest added (`demo` and `data-force` for the kit specimen and
captures only).

The actions lane's bare icon button with the Lucide `copy` glyph (24, stroke 1.75, `text-1`).
After a tap: busy (only if the write takes longer than 120 ms) = the three dots; done = the tick in
`accent` for 2 s; refused = the warning glyph in `danger` for 3.2 s. Each glyph change is an ignite
(opacity, `--duration-fast`); the old flip, bubble, confetti, wipe, badge and shake are gone. A
polite live region says the label after a copy; an `alert` says `common.retry` after a refusal.

## `Segment` (stage 1) — one additive prop

`mark?: 'ink' | 'accent'` (default `ink`): the colour of the 2 pt mark. `accent` is the chip; a
chip is also dimmed on its own when `disabled` (a segment is dimmed by its group).

## Tokens

Stage 2 adds none. It reads `--accent`, `--accent-fg`, `--surface-3`, `--text-1`, `--text-2`,
`--edge`, `--danger`, `--focus-ring`, `--pressed-opacity`, `--disabled-opacity`, `--duration-fast`,
`--ease-standard`.

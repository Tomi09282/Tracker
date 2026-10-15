# Kit reference — selection (lane SEL, package F8)

Stage 1 (this page): `BadgeCount`, `Segmented` in its two Pulse forms, `LanguageToggle`.
Stage 2 (a later merge, additive): `ChipRow`, `Toggle`, `Switch`, `CheckMark`, the `CopyButton` skin.

Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §1 rule 3, §2.2, §2.4 ("Ignite"), §4 (rows
"Segmented switch", "Badge / tag", "Icon button"). Construction: `figma-build/app-kit.js` line 208
(`badgeCount`), 214-221 (`chipRow`, `segSwitch`). Measured boxes: `_components.json`, cells
`iconBtn` (`Badge/count`) and `segSwitch` (hug, equal cells); in the frames `home-1` (badge),
`auth-1` / `settings-2` (language), `coins-1`, `progress-1`, `admin-1` (cells), `library-1`,
`workout-1`, `exercise-detail-1` (hug), `client-detail-1` (hug on a hairline).
Specimen: `frontend/src/features/playground/kit/selection.tsx`. On the `/playground` board its two
cells "segSwitch · hug — ink mark = neutral selection" and "segSwitch · equal cells on a hairline"
take the board's own cells; the badge appears in the actions lane's "iconBtn · badgeCount 2 / 99+ …"
cell (hand-in `pkg/F8/shared.patch`, `kit/actions.tsx`); every other state cell (pressed, keyboard
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

## Tokens this lane added (`tokens.css`, block `lane:F8`, handed in as `pkg/F8/shared.patch`)

| Token | Value | Used by |
|---|---|---|
| `--badge-h` | 18px | the badge's height, minimum width and corner offset |
| `--badge-pad-x` | 5px | the badge's side padding (off the 4 pt grid on purpose: it centres one digit in the circle) |

Tokens it reads: `--text-1`, `--text-2`, `--accent`, `--accent-fg`, `--surface-0`, `--danger`,
`--surface-border` (`bg-hair`), `--focus-ring`, `--pressed-opacity`, `--disabled-opacity`,
`--target-min`, `--duration-fast`, `--ease-standard`.

## Variant elements

E6 (Segmented control) is one Pulse look: the letter is not read any more, and the element is handed
in as `live: false` (`pkg/F8/variants.json`). E2 (CopyButton) follows in stage 2.

## For the kit specimen and for captures only

`data-force="pressed"` and `data-force="focus"` on a segment show the pressed look and the focus ring
without a finger or a keyboard — the segment answers with the same declarations as `:active` and
`:focus-visible`. Nothing in the product sets the attribute.

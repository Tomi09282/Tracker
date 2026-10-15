# Kit reference — structure (lane ST, package F9)

The "no boxes" grammar of every screen: one left edge, hairlines, small-caps eyebrows, space.
A section is a strong rule and an eyebrow; a list is rows on the gutter with a hairline between two;
an empty or failed state is a left-aligned display line; a status is a dot and a line of words; a
load is grey blocks where the text will be. Nothing here has a fill, a border box, a radius (the
skeleton's 2 px excepted) or a shadow.

Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §2.3 (rhythm), §3 (section), §4 (rows
"List row", "Empty / error state", "Skeleton", "Status line / toast"). Construction:
`figma-build/app-kit.js` — `rule`, `secHead`, `sect`, `rowStack`, `listRow`, `emptyState`, `skel`,
`noticeLine`. Measured boxes: `.pulse/geometry/_components.json`, cells `sect`, `listRow`,
`emptyState`, `skel`, `noticeLine`; and the frames `home-1`, `settings-1`, `notifications-1`,
`coach-dashboard-1/3`, `compose-profile-2`, `onboarding-3`, `workout-2`. Specimen:
`frontend/src/features/playground/kit/structure.tsx`.

The API below is final. Changes after this page are additive only (R6). Stage 2 of this lane
(`Monogram` 28 / 64 / 176) is not published yet.

## What a screen writes (keys illustrative)

```tsx
import { Section, SectionHeader } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

// a section: strong rule -> 16 -> eyebrow (+ ONE trailing node on its baseline) -> 16 -> content
<Section title={t('home.todayTitle')} trailing={<span className="text-data text-text-2">{meta}</span>}>
  …content…
</Section>
<Section title={t('nutrition.card.title')} trailing={<TextLink to="/nutrition" trail={<ChevronRight />}>{t('nutrition.card.open')}</TextLink>}>…</Section>
<SectionHeader rule={false} title={t('home.weekTitle')} />            // the block directly under a header

// a list: rows on the gutter, a hairline between two, nothing before the first or after the last
<RowStack>
  <ListRow title={name} sub={team} to={`/coach/clients/${id}`} chevron />
  <ListRow title={t('settings.language')} value={language} onClick={openSheet} chevron />
  <ListRow title={t('settings.cues.voice')} titleId={voiceId} control={<Switch checked={on} onChange={set} labelledBy={voiceId} />} />
  <ListRow title={t('common.logout')} tone="danger" onClick={askLogout} />
</RowStack>
<RowStack open close>…</RowStack>                                       // a table: strong rules open and close it

// empty / failed: left-aligned, display title, one line, ONE action
<EmptyState title={t('home.emptyTitle')} body={t('home.emptyBody')}
  action={<Pressable variant="primary" size="lg" onClick={browse}>{t('nav.library')}</Pressable>} />
<EmptyState title={t('common.errorTitle')} body={t('common.errorBody')} action={<TextLink text="body" onClick={retry}>{t('common.retry')}</TextLink>} />

// a status line: dot + words (+ one action)
<NoticeLine tone="danger" role="alert" action={<TextLink onClick={retry}>{t('common.retry')}</TextLink>}>{t('…saveFailed')}</NoticeLine>

// loading: blocks where the text lines will be — never a spinner
{isPending ? <RowStack as="div">{[0, 1, 2].map((i) => <ListRowSkeleton key={i} sub index={i} />)}</RowStack> : …}
```

Rules that are not negotiable (Pulse System §1, §3, §6):

1. **Never wrap a section or a row in a surface.** Grouping is a rule above and 32 below. A list item
   is a `ListRow` in a `RowStack`, never a tile with a fill, a radius and 8 px between tiles.
2. **One trailing node per section head** — a count, a status, a text link or a hug segmented switch.
   Never two, never an icon, never a lime pill unless the head makes room for it (`trailingInFlow`).
3. **Sections stand 32 apart** (`gap-section` on the page column); head -> content is 16 (built in).
   The hero block directly under the header has no rule (`rule={false}` or a `StatBlock`).
4. **An empty state is left-aligned on the gutter** — no icon, no disc, nothing centred. It carries
   the screen's one pill only if it IS the screen's one action; otherwise a text link.
5. **A semantic colour is a 6 pt dot or text**, never a filled strip. The words of a notice are
   always `text-1`.
6. **A skeleton block stands in for one text line** (16 for a 16 px line, 12 for a 13 px line, a
   numeral = one block at its cap height). Images are withheld, never drawn as grey squares.
7. **`className` is placement only** (a margin, `self-start`, `absolute`). Never a colour, a height,
   a padding or a radius.

## `Rule` — `frontend/src/ui/data/Rule.tsx` · `data-kit="rule"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `strong` | `boolean` | `false` | the section rule, white 14 % (`bg-hair-strong`); default the row rule, white 8 % (`bg-hair`) |
| `className` | `string` | — | placement only |

1 px tall, full width, `aria-hidden` (a rule is decoration, under 3:1 on purpose; it is not an `<hr>`
that a screen reader announces forty times). `SectionHeader` and `RowStack` draw their own rules —
use this only for a rule that belongs to neither.

## `SectionHeader`, `Section` — `frontend/src/ui/data/SectionHeader.tsx` · `data-kit="sect"` (the head row)

```
──────────────────────────────────────────   strong rule (1)
                                               16
MAI EDZÉS                  18:00 · 5 gyakorlat   head row: 20 high (eyebrow 16 / 20, +6 %, upper, text-2)
                                               16  (Section's gap; a bare SectionHeader leaves it to its parent)
content
```

`SectionHeader`:

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `title` | `string` | — | the eyebrow, in an `h2` (`heading="h3"` inside another section). `title` OR `children` |
| `titleId` | `string` | — | the heading's id, for `aria-labelledby` on the section |
| `children` | `ReactNode` | — | bridge: a call site's own heading element. A rebuilt screen uses `title` |
| `trailing` | `ReactNode` | — | ONE node, ending on the right edge, its text on the eyebrow's baseline |
| `trailingInFlow` | `boolean` | `false` | the head makes room for a 44 pt control (the small pill of `coach-dashboard-1`): the row grows to 44 and the eyebrow is centred on it |
| `rule` | `boolean` | `true` | the strong rule above |
| `heading` | `'h2' \| 'h3'` | `'h2'` | |
| `className` | `string` | — | placement only |
| `icon` | `LucideIcon` | — | **deprecated, never rendered** (R5); `check:pulse` counts it (`heading-icon`) |
| `action` | `ReactNode` | — | **deprecated**: the old name of `trailing`, used when `trailing` is not given |

- The head row is 20 high whatever trails it: a 44 pt link overhangs it symmetrically and its words
  sit on the eyebrow's baseline (flex `items-baseline` on the row, the trailing node centred in a
  20 px box). A screen never corrects that with margins.
- A trailing node with a `trail` glyph (`<TextLink trail={<ChevronRight />}>`) is pulled 5 px past
  the right edge, as the kit does (`secHead`: dx 5), so the chevron's TIP stands on the edge.
- The trailing text is the caller's: a count or a figure is `text-data text-text-2`, a status in
  words `text-cap text-text-2`; a link is `TextLink` (`text="cap"`, the default).

`Section` = a `<section aria-labelledby>` holding a `SectionHeader` (same `title`, `trailing`,
`trailingInFlow`, `rule`, `heading`) and the content 16 below it; `id`, `className` (placement, or
another head -> content gap where a frame draws one).

## `RowStack` — `frontend/src/ui/data/RowStack.tsx` · `data-kit="rowStack"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `children` | rows | — | `ListRow`s (or any row). Fragments are opened, `null` / `false` skipped (a conditional row costs no rule). No rows -> renders nothing |
| `open` | `boolean` | `false` | a strong rule above the first row (a table of its own) |
| `close` | `boolean` | `false` | a strong rule under the last row |
| `as` | `'ul' \| 'ol' \| 'div'` | `'ul'` | `div` when the rows are not list items (a radio group, a set of switches) |
| `role` | `AriaRole` | — | with `as="div"` only (`radiogroup`, `group`, `menu`); a list keeps `role="list"` |
| `id`, `aria-label`, `aria-labelledby`, `className` | | | |

Each row gets an `<li>` (or `<div>`) wrapper that carries the row rule as its top border: rule 1 +
row 56 = a pitch of 57, as in the frames (a border drawn inside a 56 px row would put every row one
pixel higher than the frame).

## `ListRow`, `ListRowSkeleton` — `frontend/src/ui/data/ListRow.tsx` · `data-kit="listRow"`

```
[lead 48 / 20]  16  Title (body-m, text-1)                value  16  trailing  16  control  16  ›
                    Sub line (cap, text-2), 2 below
```

Hugs its content with a floor of 56 (64 with `sub`): 10 above and below, 16 between slots, a 48 pt
thumb makes it 68. No background, no radius, no border — the hairline belongs to `RowStack`.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `title` | `ReactNode` | — | one line, cut with an ellipsis (`lines={2}`: two) |
| `sub` | `ReactNode` | — | the line under the title, `cap` `text-2`; raises the floor to 64 |
| `lines` | `1 \| 2` | `1` | title lines |
| `subLines` | `1 \| 2 \| 3` | `1` | sub lines (a hint that explains a disabled control may need 3) |
| `lead` | `ReactNode` | — | a 48 pt `<Pic slot width={48} />` thumb, or a bare Lucide icon (drawn 20 px, stroke 1.75, `text-2`) |
| `leadSlot` | `boolean` | `false` | a fixed 48 × 44 lead slot, content on its left edge: for a 28 pt monogram, and for a row with NO lead in a list whose other rows have one (same text edge) |
| `value` | `ReactNode` | — | trailing value in `text-2`: a string with a digit is mono (`text-data`), words are `text-cap` |
| `trailing` | `ReactNode` | — | something to READ at the end: a tag (`text-micro`), a status, a time with a dot. Never interactive |
| `control` | `ReactNode` | — | something to OPERATE: a `Switch`, a set check, an icon button, a `TextLink`. Stands BESIDE the row's action, never inside it |
| `chevron` | `boolean` | `false` | the 16 px chevron, `text-3`, its tip on the right edge (the box overhangs by 5). Decorative |
| `tone` | `'default' \| 'muted' \| 'danger'` | `'default'` | title in `text-1` / `text-2` (an option that is not the chosen one) / `danger` (destructive, text only) |
| `to` / `href` / `onClick` | | — | makes the whole row an action: router `<Link>` / `<a>` / `<button>` |
| `disabled` | `boolean` | `false` | the row's ACTION is unavailable: 40 %, inert (`aria-disabled`, keeps the focus). The reason goes in `sub`. A row that only holds a `control` is not dimmed: the control carries its own disabled state (the board's "Rezgés": switch at 40 %, words in ink) |
| `busy` | `boolean` | `false` | the row's action is in flight: held at 60 %, refuses input, `aria-busy`. No spinner |
| `titleId` | `string` | — | the title's id, for a `control` labelled by it (`labelledBy` / `aria-labelledby`) |
| `role`, `tabIndex`, `actionRef`, `aria-*` | | — | on a row that is an action only (`radio`, `option`, `menuitem`; roving tabindex) |
| `className` | `string` | — | placement only |
| `data-force` | `'pressed' \| 'focus'` | — | kit specimen and captures only |

States of a row that is an action: rest · pressed = opacity 60 % in `--duration-instant` (Pulse:
"rows and links -> opacity 0.6", no fill, no scale) · keyboard focus = the global 2 px lime ring,
2 off the box · disabled 40 % · busy 60 % + `aria-busy`. No hover look, no selected fill: selection
is the mark of the control in the `control` slot.

A row with an action AND a `control` renders two targets side by side (`<div data-kit="listRow">`
holding the action and the control), never one inside the other.

`ListRowSkeleton` — `{ sub?, leadSlot?, index?, className? }`: the same floor, a 16 px block for the
title and a 12 px block for the sub line (8 apart), the lead slot kept EMPTY. `index` varies the
widths so three rows do not read as a table of equal bars. `aria-hidden`; the list it stands in for
announces the load (`role="status"` + `common.loading` at the call site).

## `EmptyState` — `frontend/src/ui/feedback/EmptyState.tsx` · `data-kit="emptyState"`

```
MA NINCS BETERVEZVE EDZÉS          display 32 / 34, upper, text-1
                                   8
Ha van aktív terved, a mai…        body 16 / 22, text-2
                                   20
( Gyakorlatok böngészése )         the pill fills the width — a text link keeps its own, on the left
```

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `title` | `string` | — | the display line |
| `body` | `string` | — | one line of `body` `text-2` |
| `action` | `ReactNode` | — | ONE action. A `variant="primary"` element (any size) or a `data-kit="btnPrimary"` child is stretched to the full width; anything else (a `TextLink`) keeps its width on the left edge |
| `heading` | `'h1' \| 'h2'` | `'h2'` | `h1` when the empty state IS the page |
| `className` | `string` | — | placement only |
| `icon`, `badge`, `size` | | — | **deprecated, never rendered** (R5) |

The same component is the error state: a title, one line, "Újra" (`common.retry`) as a text link.
It has no padding of its own and is not centred; the screen places it on its column.

## `NoticeLine` — `frontend/src/ui/feedback/NoticeLine.tsx` · `data-kit="noticeLine"`

```
●  Nem sikerült menteni.                                  Újra
6  8                                                    8  TextLink (cap)
```

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `children` | `ReactNode` | — | the message, `cap-m` `text-1`. Wraps, never cut |
| `tone` | `'info' \| 'ok' \| 'warn' \| 'danger'` | `'info'` | the 6 pt dot: ink / success (saved) / warning (offline, over target) / danger (error) |
| `detail` | `ReactNode` | — | a second line, `cap` `text-2`, 4 below (`coach-dashboard-3`: what the notice means) |
| `lead` | `ReactNode` | — | a 16 px ink glyph in place of the dot (a bare Lucide icon; `workout-2`: the record trophy) |
| `action` | `ReactNode` | — | ONE trailing action: a `TextLink` or a bare icon button |
| `compact` | `boolean` | `false` | 20 high instead of 44: the alert line 20 above a pill (`auth`, `onboarding-3`) |
| `role` | `'alert' \| 'status'` | — | `alert` for an error that follows an action, `status` for a line that changes quietly |
| `id`, `className` | | — | placement only |

The line is at least 44 high (so a 44 pt action fits), the text block centred in it; a message that
wraps keeps its dot centred on its FIRST line. A line with a `detail` and no `action` hugs its two
lines. The toast band (F13) is this line over the header zone with a strong rule under it.

## `Skeleton`, `ScreenSkeleton` — `frontend/src/ui/feedback/ScreenSkeleton.tsx` · `data-kit="skel"`

`Skeleton({ className })` — one block: `surface-2` (`--skeleton-base`), radius 2, the sheen sweeping
on the ambient loop (`animate-sheen`, 1.2 s; stopped under reduced motion). The call site gives its
SIZE: `h-4` for a 16 px text line, `h-3` for a 13 px caption, a numeral = one block at its cap
height. A radius passed at a call site is the old tile's shape and is counted by `check:pulse`
(`shaped-skeleton`).

`ScreenSkeleton()` — the route / session placeholder: the display title block, then one section
(strong rule, eyebrow block, three title + caption rows with a hairline between two), `role="status"`
with `common.loading` for screen readers.

## Tokens it reads (none added)

`--spacing-group` (16), `--spacing-section` (32), `--row-h` (56), `--row-h-sub` (64), `--thumb` (48),
`--surface-border` / `--surface-border-strong` (as `hair` / `hair-strong`), `--text-1/2/3`, `--danger`,
`--warning`, `--success`, `--pressed-opacity`, `--disabled-opacity`, `--focus-ring`,
`--duration-instant`, `--ease-standard`, `--skeleton-base`, `--skeleton-sheen`, `--animate-sheen`,
`--radius-1` (2), and the type steps `eyebrow`, `display`, `body`, `body-m`, `cap`, `cap-m`, `data`,
`micro`.

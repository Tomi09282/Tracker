# Kit reference — data gaps (lane G-data)

The kit gaps of `.pulse/prep/_kit-gaps.md` section A that belong to the data and structure parts of
the kit: items 1, 2, 4, 5, 10, 11 and the `ui/data` / `ui/feedback` rows of item 13. Every change
to an existing component is ADDITIVE (R6): no prop changed meaning, no call site changed. New
components are new files.

Sources: the frames named per item (`.pulse/geometry/<frame>.json` for every number below),
`figma-build/app/<frame>.body.js` for the construction, `app-kit.js` for `oval`, `segBar`,
`numeral`, `monogramMark`, `listRow`, `ledgerRow`, `emptyState`. Specimen:
`frontend/src/features/playground/kit/gap-data.tsx` (listed after the board on `/playground`).
Pairs: `.pulse/pairs/G-data/`.

The API below is final. Later changes are additive only.

## 1 · `Dot`, `RoleKey`, `StatusLine` (new, `ui/data/`)

```tsx
import { Dot } from '../../ui/data/Dot';
import { RoleKey } from '../../ui/data/RoleKey';
import { StatusLine } from '../../ui/data/StatusLine';

<Dot />                                   // 6 pt lime: unread (notifications-1), live
<Dot tone="half" />                       // tone: live | secondary | half | off | ink | ok | warn | danger
<Dot size={8} tone="secondary" />         // size: 6 | 8; secondary = lime 55 % at 8, 50 % at 6 (as drawn)
<Dot tone="warn" label={pendingLabel} />  // label -> role="img" with that name; else aria-hidden

// exercise-detail-1 / admin-2: 8 pt dot, 10, body-m text-1; stack 8 apart / inline 24 apart
<RoleKey items={[{ role: 'primary', label: 'Mell' }, { role: 'secondary', label: 'Tricepsz' }]} roleLabels={{ primary: t('muscleMap.primary'), secondary: t('muscleMap.secondary') }} />
<RoleKey layout="inline" items={…} />
// workout-1 legend: 6 pt dot, 6, cap text-2, keys 16 apart (inline is the default at 6)
<RoleKey size={6} items={[{ role: 'primary', label: t('muscleMap.primary') }, { role: 'secondary', label: t('muscleMap.secondary') }]} />

// client-detail-1/2 row sub line: dot 6 · 6 · micro word · 12 · cap meta text-2 (18 high)
<ListRow title={plan.name} sub={<StatusLine tone="live" word={t('plans.status.active')} meta={meta} />} chevron to={…} />
<StatusLine word={t('plans.status.draft')} meta={meta} />   // no tone = no dot, the word in text-2
```

`Dot` is a `span`, so a `TextLink` lead slot (which sizes a bare `svg` to 16) leaves it at 6. It is
under 24 pt, so the boxed-surface probe never counts it; `data-kit="dot"` names it for the probes.
compose-hub's level dot is `<Dot tone="live" | "half" | "off" />` (the same three levels as
`SegmentBar`).

## 2 · `SplitBar`, `SplitLegend` (new, `ui/data/SplitBar.tsx`)

```tsx
import { SplitBar, SplitLegend } from '../../ui/data/SplitBar';

// coach-dashboard-1/3: ink steps by place (1 · .64 · .4 · .24), the legend in two columns
<SplitBar label={t(…)} parts={teams.map((team) => ({ label: team.name, count: team.size }))} />
// coach-plans-1: statuses take light levels, the legend in one row (key 12 x 6, 20 apart)
<SplitBar legend="inline" parts={[{ label: t('plans.status.active'), count: 4, tone: 'live' }, { label: …, count: 1, tone: 'half' }, { label: …, count: 0, tone: 'warn' }, { label: …, count: 1, tone: 'off' }]} />
// admin-1: the bar alone under the giant, the legend placed beside it as three lines
<SplitBar legend="none" parts={roles} />
<SplitLegend layout="stack" parts={roles} className="…placement and the height the lines spread over…" />
```

`SplitPart = { label: string; count: number; tone?: 'ink' | 'live' | 'half' | 'warn' | 'off' }`.
Bar 6 high, parts 8 apart, radius 1, widths `(W - 8 (n - 1)) x count / sum`. A part with count 0
has no segment and no legend line (`keepZero` keeps the line). One part fills the bar. With a
legend the bar is `aria-hidden` and the legend list is read ("name count"); with `legend="none"` the
bar is an `img` named by `srText` (default "label count, …").

## 4 · `ListRow` / `RowStack` / `ListRowSkeleton` additive props

```tsx
// marketplace-1/2, coach-profile-1: feed row, 96 high
<ListRow to={…} pad="loose" kickerLead={kind} kicker={`${city} · ${date}`} title={post.title} sub={post.coach} value={price} valueOn="sub" />
// coach-plans-1: plan row, title 22/28 in two balanced lines, mono meta, lime tick for the active one
<RowStack trim>
  <ListRow to={…} chevron pad="loose" titleSize="title" lines={2} subFace="data" subInk="ink" subLead={<Check />} title={…} sub={…} />
</RowStack>
<ListRowSkeleton kicker />
```

| prop | values | draws |
|---|---|---|
| `kicker` | node | `micro`, 4 above the title (text-1 alone, text-2 after `kickerLead`); title and sub then 4 apart |
| `kickerLead` | string | the kicker's first word in text-1 (the kind), then " · " and `kicker` in text-2 |
| `titleSize` | `body` (default) · `title` | 22 / 28 SemiBold, `text-wrap: balance`; a string title keeps " –" glued to the word before it (the dash ends line 1, as drawn) |
| `subFace` | `cap` (default) · `data` | the sub line in mono 13 / 18 |
| `subLead` | node | a 14 px glyph, 6 before the sub line, lime |
| `subInk` | `quiet` (default) · `ink` | the sub line in text-1 |
| `valueOn` | `title` (default) · `sub` | the value right-aligned on the sub line's baseline |
| `valueUnit`, `valueStep` | string · `dataL` / `data` | the value as a `FigureUnit` (item 10) |
| `pad` | `default` (10) · `loose` (16) | the row's top and bottom padding |
| `RowStack trim` | boolean | no top padding on the first row, no bottom padding on the last |

## 5 · `Monogram` 96 / 124, dot tone, labels

Already on pulse-redesign (F9 stage 2): `size: 28 | 64 | 96 | 124 | 176`, `dot: true | 'accent' |
'warn'`, `dotLabel`, `label`, the light texture from 96 up. Nothing changed; the specimen shows
96, 124 + lime and 124 + warn next to coach-chat-1 and client-detail-1.

## 10 · figure + unit: `FigureUnit` (new), `ListRow valueUnit`, `LedgerRow pair`

```tsx
import { FigureUnit } from '../../ui/data/FigureUnit';

// client-detail-3 records: "108" dataL 16/20 text-1 + "kg" cap text-2, 4 apart, on one baseline
<ListRow title={r.exercise} sub={…} value={value} valueUnit={r.value_unit} />
<FigureUnit value={kcal} unit="kcal" />            // step: dataL (default) | data; tone: ink | quiet | warn
// admin-1: two label + figure pairs on ONE ledger baseline, not tappable
<LedgerRow label={t(…exercises)} value={counts.exercises} pair={{ label: t(…media), value: counts.media }} />
```

`null` / `undefined` prints the dash in both, never a 0. `LedgerRow` already had `unit`; `pair`
is new (`LedgerPair = { label, value, unit?, format?, srText? }`); `note` is not drawn with a pair.

## 11 · `UserPhoto feather`, `bleed`

```tsx
<UserPhoto src={cover} alt="" ratio={4 / 3} feather bleed />   // post-detail-1/2, marketplace lead cover
```

`feather`: a static mask, each edge fading over 16 % of its side into the canvas; no blend, no
scrim, no radius. `bleed`: the photo runs over both 24 pt gutters to the screen edges.

## 13 · `SegmentBar slots`, `MacroColumns tracks`, `Numeral dot`, `EmptyState measure`

```tsx
// plan-editor-1/2 cycle strip: 7 num numerals over one 6 pt bar, every slot one 51.7 x 56 button
<SegmentBar label={t('plans.cycle', { days })} slots={days.map((day, i) => ({
  state: open === i ? 'on' : day ? (day.is_rest ? 'off' : 'half') : 'off',
  label: i + 1,                           // or <Plus /> for an empty slot (drawn as given, 24 pt)
  onPress: () => …, pressed: day ? open === i : undefined, busy, disabled,
  srText: `${day?.name ?? t('plans.addDay')} · ${t('plans.dayIndex', { n: i + 1 })}`,
}))} />                                   // perView (default 7): more slots keep the pitch and scroll

<MacroColumns tracks={4} columns={lastRow} />          // progress-1: a short row keeps 76.5 per column
<Numeral size="giant" value={active} dot />            // style-studio-1: 16 pt lime dot 6 after the ink
<Numeral value={v} tone={on ? 'ink' : 'pending'} dot={on} />   // the rail: 6 pt, 2 after the ink
<EmptyState measure="narrow" title={…} body={…} />     // notifications-2: the body at 312
```

`SegmentSlot = { state, label, labelTone?, onPress?, pressed?, busy?, disabled?, srText?, force? }`.
A slot's numeral is `ink` over `half` / `on` and `pending` over `off` unless `labelTone` says
otherwise. States: pressed 60 %, disabled 40 % (`aria-disabled`, keeps the focus), busy at the
pressed level with `aria-busy`, the global focus ring. `Numeral dot`: `true | 'accent' | 'warn'`,
`dotLabel`; d = round(size / 8), gap round(d / 2.75), as `monogramMark`; not drawn after a unit.

`Numeral`'s glyph table now also holds the capitals A–H (the same measurement as `Monogram`'s), so
a letter numeral ("D" in style-studio) is ink-tight like a digit.

# Kit reference — inputs (lane IN, package F12)

Stage 1 (this page): the underline `Field`. Stage 2 (`SearchField`, `TextArea`, `NumberStepper`,
`MaskedField`, `DateTrigger`, `SelectSheet`, `FilePick`, the `FeedbackField` skin, the bottom `Sheet`,
`ConfirmSheet`) is a later run; its section is added here when it starts, additively.

Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §2.1 (`edge`, `hair`, `danger`), §2.2
(`body`, `cap`, `cap-m`, `micro`), §4 row "Underline field". Construction: `figma-build/app-kit.js`
223-236 (`inputField`). Measured boxes: `.pulse/geometry/auth-1.json`, `auth-2.json` and
`_components.json` (cell `inputField`, board y 1645-2139). Specimen:
`frontend/src/features/playground/kit/inputs.tsx`.

The API below is final. Changes after this page are additive only (R6).

## What a screen writes

```tsx
import { Field } from '../../ui/primitives/Field';

<Field label={t('auth.email')} type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} {...register('email')} />
<Field label={t('auth.password')} type="password" hint={t('auth.passwordRules')} hintTone="plain"
       trailing={<Pressable variant="link" shape="icon" aria-label={…} aria-pressed={revealed} onClick={…}><EyeOff /></Pressable>} />
<Field label={t('compose.postTitle')} marker={t('compose.required')} hint={t('compose.charsLeft', { n })} error={tooLong ? t('compose.overLimit') : undefined} />
<Field label={t('compose.headline')} marker={t('compose.optional')} markerTone="quiet" hint={t('compose.headlineHint')} />
<Field label={t('progress.on')} leading={<CalendarDays />} … />
```

Rules that are not negotiable (Pulse System §1, §4):

1. **No box.** A field is a label, a 44 pt line and an underline. Never wrap it in a panel, never give
   it a fill, a radius or a border of its own. `className` is placement only (`w-full`, `flex-1`,
   `self-start`, margins).
2. **The label is always rendered.** `labelHidden` keeps it for assistive tech only and exists for the
   one case where a visible heading already says the same words.
3. **One message under the line.** The hint, or — while there is an error — the error in its place.
4. **Input text is 16** (`body`), so WebKit never zooms the page on focus.

## `Field` — `frontend/src/ui/primitives/Field.tsx` · `data-kit="inputField"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | the label, `cap-m` 13 / 18 Medium, `text-2` (`text-3` when disabled) |
| `hint` | `string` | — | under the line, 8 pt below it, `cap` 13 / 18 Regular |
| `hintTone` | `'quiet' \| 'plain'` | `'quiet'` | `quiet` = `text-3` (the kit); `plain` = `text-2` — a hint that is the only statement of a rule (auth-2's password rule) |
| `error` | `string` | — | replaces the hint, `cap` in `danger`, `role="alert"`; the line becomes 2 px `danger`; `aria-invalid` |
| `marker` | `string` | — | obligation tag on the label row: `micro` (Geist Mono 11 / 16, +10 %, upper case), on the label's baseline, against the trailing edge; in `aria-describedby` |
| `markerTone` | `'plain' \| 'quiet'` | `'plain'` | `plain` = `text-2` ("Kötelező"), `quiet` = `text-3` ("Nem kötelező") |
| `leading` | `ReactNode` | — | a bare Lucide icon; set to 20 px, stroke 1.75, `text-2`, 10 pt before the value; `aria-hidden` |
| `trailing` | `ReactNode` | — | laid out flush with the right edge, centred on the 44 pt line, 10 pt after the value; drawn by the caller (an icon button is a `Pressable` with its own `aria-label`; a tick is `aria-hidden`) |
| `labelHidden` | `boolean` | `false` | label `sr-only` (still rendered, still bound) |
| `className` | `string` | — | placement only, on the outer element |
| …every `<input>` attribute | | | `type`, `value`, `defaultValue`, `placeholder`, `disabled`, `autoComplete`, `inputMode`, `onChange`, `ref`, `id`, `aria-*` … |

`FieldTone` (`'plain' | 'quiet'`) is exported for callers that pass a tone through.

### The field, in numbers

| Part | Value |
|---|---|
| Outer (`Field/<label>`) | full width of its parent; label row + line, then `gap-tight` (8) + the hint or error |
| Label row | 18 high (`cap-m` line box); with a marker: `justify-between`, `items-baseline` |
| Line (`Input/underline`) | 44 high; glyph · 10 · value · 10 · trailing; the value's 22 pt line box at +11 in every state |
| Value / placeholder | `body` 16 / 22 Regular; value `text-1`, placeholder `text-3`; caret `accent` |
| Masked value | 6 pt discs on an 11 pt pitch, centred on the line (`--field-mask-*`, below) |
| Underline, rest | 1 px `edge` (#5E615B), the last pt of the 44 |
| Focus | 2 px `accent`, the last 2 pt of the 44, and the lime caret. Focus wins over an error (the message stays) |
| Error | 2 px `danger`; the message in `danger` where the hint was |
| Disabled | label and value `text-3`, 1 px `hair` (white 8 %); not focusable |
| Empty | the placeholder in `text-3` |
| Hit target | the `<input>` itself: 44 high, the width of the line minus glyph and trailing |

### Behaviour that is kept from before Pulse

- `aria-describedby` = marker + hint (only while it is shown) + error; `aria-invalid` on an error;
  the error is a `role="alert"` paragraph, so it is announced when it appears.
- `forwardRef` to the `<input>`; every `<input>` attribute passes through (react-hook-form's
  `register()` spreads straight in).
- The label is a `<label htmlFor>` bound to the input id (`useId()` unless an `id` is given).

### Keyboard focus

The field's focus indicator is the line: 1 px grey becomes 2 px lime, plus the lime caret. The global
`:focus-visible` ring is turned off on this one element — a ring would draw the box Pulse forbids, and
its radius would bend the ends of the line. A text input matches `:focus-visible` for mouse and
keyboard alike, so the line answers `:focus-within` and the two paths look the same. The capture
tool's focus walk reads the change on the line's element (its bottom border width and colour).

### Not a field state

A field has no pressed state (pressing it focuses it) and no busy state (an in-flight check belongs to
its caller — `FeedbackField`, stage 2). Autofill keeps the canvas: Chrome's autofill tint is held back
and the value keeps `text-1`.

## Specimen

`features/playground/kit/inputs.tsx` exports `specimens: { kit, label, gap?, node }[]` (the media
page's shape, plus `gap`: the board cell's gap between the label and the nodes, 20 for the field
cells) and a default component that lays the cells out in a 354 column. Cell 1 is the board's
`inputField` cell (idle with hint, focus, error, disabled, empty); the focus specimen carries
`data-specimen="focus"` — a capture focuses it with the keyboard. Cell 2 shows the field as the
frames compose it (marker required / optional, the plain rule hint with a trailing reveal control, a
trailing format tick, a leading glyph).

## Tokens this lane added (`tokens.css`, block `lane:F12`, handed in as `pkg/F12/shared.patch`)

| Token | Value | Used by |
|---|---|---|
| `--field-mask-size` | `24px` | a masked value (`type="password"` with a value): Geist's bullet at 16 is a 4 pt dot on a 5 pt pitch; at 24 it is the drawn 6 pt disc |
| `--field-mask-tracking` | `3.5px` | the same: 7.5 pt advance + 3.5 = the drawn 11 pt pitch |
| `--field-mask-lift` | `3px` | the same: a bottom padding that lifts the larger bullet 1.5 pt back onto the line's centre (optical, not a layout step) |

Measured on the built Field against `auth-2@2x.png` (14 discs): pitch 11.0 = 11.0, disc 5.5 vs 6 (antialiased edge),
first disc x 25 vs 24, ink rows 569-574 vs 569-575. The placeholder and a revealed value keep `body`.

Every other value is an existing token: `--edge`, `--surface-border` (`border-hair`), `--accent`, `--danger`,
`--text-1/2/3`, the `body` / `cap` / `cap-m` / `micro` steps, `--duration-fast`, `--ease-standard`,
`--spacing-tight`.

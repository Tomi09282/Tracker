# Kit reference — inputs (lane IN, package F12)

Stage 1: the underline `Field`. Stage 2 (section "Stage 2" below, additive): `SearchField`,
`TextArea`, `NumberStepper`, `MaskedField`, `DateTrigger`, `SelectSheet`, `FilePick`, the
`FeedbackField` skin, the bottom `Sheet` (+ `SheetStatic` for specimens) and `ConfirmSheet`; and,
for those siblings only, the frame they share (`FieldFrame`, `fieldIds`, `fieldDescribedBy`,
`fieldLine`) and `Field`'s `kit` prop.

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

---

# Stage 2 — the rest of the inputs, and the sheet

The API below is final (R6): later changes are additive only. Every component carries its
`data-kit` name. Construction: `app-kit.js` 223-237 (`inputField`, `searchField`) and 317-327
(`bottomSheet`); Pulse System §4 rows "Search field", "Bottom sheet", "Destructive action" and the
recipe line "number stepper = `iconBtn('minus')` · `numeral` · `iconBtn('plus')`". Measured boxes:
`.pulse/geometry/` frames named per component below, and `_components.json` (`searchField` cell, the
pushed-screen bottomSheet demo).

## What a screen writes

```tsx
import { SearchField } from '../../ui/primitives/SearchField';
import { TextArea } from '../../ui/primitives/TextArea';
import { NumberStepper } from '../../ui/primitives/NumberStepper';
import { MaskedField } from '../../ui/primitives/MaskedField';
import { DateTrigger } from '../../ui/primitives/DateTrigger';
import { SelectSheet } from '../../ui/primitives/SelectSheet';
import { FilePick } from '../../ui/primitives/FilePick';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';

<SearchField label={t('library.search')} placeholder={t('library.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
<TextArea label={t('compose.body')} counter={t('compose.charsLeft', { n })} minRows={7} value={body} onChange={…} />
<TextArea label={t('chat.compose')} labelHidden maxRows={5} value={draft} onChange={…} />          // the composer: grows 44 → 66 → …
<NumberStepper label={t('onboarding.sessionMinutes')} value={minutes} onChange={setMinutes} min={10} max={240} step={5} valid={ok} hint={…} />
<MaskedField label={t('auth.password')} autoComplete="new-password" hint={t('auth.passwordRules')} hintTone="plain" {...register('password')} />
<DateTrigger label={t('progress.on')} value={day} onChange={setDay} max={today} />                     // field: calendar glyph + "2026. okt. 9."
<DateTrigger variant="inline" label={t('nutrition.date')} value={day} onChange={setDay} />              // header: "Péntek, október 9. ⌄"
<SelectSheet label={t('progress.metric')} value={metric} options={metrics} onChange={setMetric} />
<FilePick size="lg" className="w-full" accept="image/jpeg,image/png,image/webp" busy={uploading} onFiles={([f]) => upload(f)}>{t('progress.chooseFile')}</FilePick>
<FilePick variant="link" text="body" accept="image/*" onFiles={…}>{t('compose.chooseCover')}</FilePick>
<Sheet open={open} onClose={close} title={t('coaching.codeReady')}>…</Sheet>
<ConfirmSheet open={asking} onClose={() => setAsking(false)} title={t('auth.logout')} message={…}
              confirmLabel={t('auth.logout')} onConfirm={logout} busy={loggingOut} />
```

## The shared frame — `Field.tsx` (additive exports)

`FieldFrame` is the kit's `Field/<label>`: label row (`cap-m`, a marker or an `aside` on its
baseline at the trailing edge), the line (the child), the hint / error 8 under it. `TextArea`,
`NumberStepper`, `DateTrigger` and `SelectSheet` are built on it, so the five fields cannot drift
apart. `fieldIds(id)` → `{ markerId, hintId, errorId, labelId }`; `fieldDescribedBy(id, { marker,
hint, error, extra })` → the control's `aria-describedby`; `fieldLine({ disabled, error })` → the
line's border classes (1 px `edge` · 2 px lime on `:focus-within` · 2 px `danger` · hairline).
`Field` gained `kit?: string` (default `inputField`) for its siblings. Not for screens.

The label now carries an id (`<id>-label`); nothing else in `Field`'s DOM changed.

## `SearchField` — `ui/primitives/SearchField.tsx` · `data-kit="searchField"`

Kit `searchField` (`marketplace-1`, `nutrition-1`, `admin-3`, `client-detail-2`; board cell
"searchField · empty / focus + clear"). The underline field with NO visible label, the 20 pt search
glass (`text-2`) 10 before the placeholder, and while there is a value the 20 pt `x` in `text-2`,
its ink on the line's end. `type="search"`, `enterkeyhint="search"`.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | the name (rendered `sr-only`) |
| `labelVisible` | `boolean` | `false` | draw the label above the line (`plan-editor-3` "Gyakorlat keresése") |
| `onClear` | `() => void` | — | told after a clear. The field clears itself (a controlled caller gets `onChange` with `''` first) and focus returns to the input |
| `clearLabel` | `string` | `common.clearSearch` | the clear button's name |
| …every `Field` prop but `leading`, `trailing`, `type`, `marker`, `labelHidden`, `kit` | | | `value`, `placeholder`, `hint`, `error`, `disabled`, `ref` → the input |

The clear button is a 44 × 44 target whose glyph ends on the line's end (it overhangs by 12 into the
gutter); pressed 60 %, keyboard focus the lime ring inside its box.

## `TextArea` — `ui/primitives/TextArea.tsx` · `data-kit="textArea"`

`Textarea/underline` (`compose-post-1`, 176), `Input/underline · multi-line` (`onboarding-1`, 66),
the composer (`coach-chat-1` 44 → `coach-chat-2` 66). The field frame around a `<textarea>` in
`body` 16 / 22 starting 11 under the label row: one row is the 44 line, each row more adds 22. The
line is drawn over the box's last pt (1 px `edge` · 2 px lime · 2 px `danger` · hairline), so focus
never changes the box's height.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label`, `hint`, `hintTone`, `error`, `marker`, `markerTone`, `labelHidden` | | | as `Field` |
| `counter` | `string` | — | `cap` `text-3` on the label row's trailing end ("19897 karakter maradt"); in `aria-describedby`; takes the marker's place |
| `minRows` | `number` | `1` | rows kept when empty (7 = the 176 of `compose-post`) |
| `maxRows` | `number` | — | rows it grows to before it scrolls; none = no limit |
| `className` | `string` | — | placement only |
| …every `<textarea>` attribute but `rows` | | | `value`, `onChange`, `placeholder`, `maxLength`, `ref` … |

Auto-grow: `field-sizing: content` where the engine has it, else the measured `scrollHeight`,
re-measured on every value change (controlled or not).

## `NumberStepper` — `ui/primitives/NumberStepper.tsx` · `data-kit="numberStepper"`

`Input/number` of `onboarding-3`. Label, then 4 pt, then a 60 pt line: the figure in `num`
(Big Shoulders Display Black 48 / 48, its cap ink 10.5 under the line's top, on the gutter), the
optional 16 pt tick (`text-2`) 10 after it, and on the trailing edge − and + — the actions kit's bare
44 pt icon buttons (24 pt glyph, `text-1`), 4 apart, 8 under the line's top. Underline = the line's
last pt. Hint / error 8 under the line.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | |
| `value` | `number \| null` | — | `null` = empty (the figure slot stays, the line shows) |
| `onChange` | `(value: number \| null) => void` | — | every step, typed number or emptying; clamped to `min` / `max` |
| `min`, `max` | `number` | — | − / + disable themselves at the bounds (40 %) |
| `step` | `number` | `1` | one tap; PageUp / PageDown = 10 steps |
| `unit` | `string` | — | `cap` `text-2` after the figure (plan request P10-R02); read with the value |
| `valid` | `boolean` | `false` | the "Bounds tick" |
| `hint`, `hintTone`, `error`, `marker`, `markerTone`, `labelHidden`, `disabled`, `id`, `name`, `className` | | | as `Field` |
| `decreaseLabel` / `increaseLabel` | `string` | `common.less` / `common.more` | the buttons' names ("Kevesebb" / "Több", as the frame names them) |

The figure is a real input: `inputmode="numeric"`, `role="spinbutton"` with `aria-valuenow / min /
max`; ArrowUp / ArrowDown step, Home / End jump to the bounds. The buttons never take focus from the
figure on a pointer tap. The figure is 48 pt, above WebKit's 16 pt zoom floor.

## `MaskedField` — `ui/primitives/MaskedField.tsx` · `data-kit="maskedField"`

The password line of `auth-1` / `auth-2`: `Field type="password"` (6 pt discs on an 11 pt pitch —
stage 1) and `Button/reveal`: 44 × 44 on the line's end, the 20 pt eye in `text-2` against its right
edge; struck eye + "Jelszó megjelenítése" while masked, open eye + "Jelszó elrejtése" while
revealed, `aria-pressed`. A tap on the eye keeps the focus (and the phone keyboard) in the input.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| …every `Field` prop but `type`, `trailing`, `kit` | | | `autoComplete` defaults to `current-password` |
| `revealable` | `boolean` | `true` | offer the eye |
| `revealed` / `onRevealedChange` | `boolean` / `(b) => void` | — | controlled reveal; leave out for the field's own state |
| `showLabel` / `hideLabel` | `string` | `common.showPassword` / `common.hidePassword` | |

## `DateTrigger` — `ui/primitives/DateTrigger.tsx` · `data-kit="dateTrigger"`

The day as words; the picker is the platform's. The control IS the native `<input type="date">`
(value, min / max, name, keyboard, screen reader), laid transparently over the drawing and opened
with `showPicker()` on a tap, Enter or Space.

| Variant | Frame | Drawing |
|---|---|---|
| `field` (default) | `progress-1` / `progress-3` "Mikor" | the field frame; the 20 pt calendar glyph (`text-2`) 10 before the day in `body` `text-1` (placeholder `text-3`); the line lights on focus |
| `inline` | `nutrition-1` "Date control · Dátum" | the day in `cap-m` `text-1`, 4, the 16 pt chevron in `text-2`; 44 high, hugs its words; pressed 60 %; keyboard focus the lime ring; the label is its name only |

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | |
| `value` | `string` | — | `YYYY-MM-DD` or `''` |
| `onChange` | `(value: string) => void` | — | |
| `min`, `max` | `string` | — | `YYYY-MM-DD` |
| `variant` | `'field' \| 'inline'` | `'field'` | |
| `format` | `(value, locale) => string` | field "2026. okt. 9.", inline "Péntek, október 9." | in the app's language (`i18n.language`), weekday first and capitalised as Home writes it |
| `placeholder`, `hint`, `hintTone`, `error`, `marker`, `markerTone`, `labelHidden`, `disabled`, `required`, `id`, `name`, `className` | | | as `Field` |

## `SelectSheet` — `ui/primitives/SelectSheet.tsx` · `data-kit="selectSheet"`

"Pickers are sheets." The trigger is the field — the chosen words in `body` `text-1` (placeholder
`text-3`), the 20 pt chevron in `text-2` on the line's end (`progress-1` "Mit mérsz") — as a button
named by label + value, `aria-haspopup="dialog"`, `aria-expanded`. Tap / Enter / Space /
Alt+ArrowDown open the `Sheet` titled with the label: the options are `ListRow`s on hairlines, a
`radiogroup` of `radio`s; the chosen one in `text-1` with the 24 pt lime tick (`setCheck`), the
others in `text-2`. ArrowUp / ArrowDown move; a tap chooses, closes, and focus returns to the trigger.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `label` | `string` | — | field label and sheet title |
| `value` | `V \| null` | — | |
| `options` | `{ value: V; label: string; sub?: string; disabled?: boolean }[]` | — | `SelectOption<V>` |
| `onChange` | `(value: V) => void` | — | |
| `placeholder`, `sheetTitle` | `string` | — | |
| `hint`, `hintTone`, `error`, `marker`, `markerTone`, `labelHidden`, `disabled`, `id`, `className` | | | as `Field` |
| `name` | `string` | — | also writes a hidden input for a plain `<form>` |

Interim, until the selection lane's `CheckMark` (F8 stage 2) lands: the tick is drawn here with the
same numbers (24 pt `Check`, stroke 2.5, `accent`, in a 44 slot). It moves to `CheckMark` then,
without an API change.

## `FilePick` — `ui/primitives/FilePick.tsx` · `data-kit="filePick"`

The heir of the two raw `type="file"` inputs (`ProgressPage`, `PostEditorPage`). A `<label>` in any
look of the actions kit (`variant` / `size` / `tone` / `text`, as `Pressable`; default
`variant="primary"`), holding an `sr-only` native file input: a tap opens the platform's dialog, the
label's words name the input, the input's keyboard focus lights the trigger's lime ring
(`data-force="focus"`), Enter / Space open the dialog. Pressed / disabled / busy are the actions
kit's looks (the disabled pill = `surface-2` + `text-3`, no glow). `data-kit-look` carries the look's
kit name (`btnPrimary` / `textLink`).

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `children` | `ReactNode` | — | the words: "Fájl választása", "Kép választása" |
| `onFiles` | `(files: File[]) => void` | — | never called with none; the input resets so the same file can be chosen again |
| `accept`, `multiple`, `capture`, `name`, `id`, `aria-describedby` | | | native |
| `variant`, `size`, `tone`, `text` | | `primary`, `lg` | the look; a pill is 56 (`lg`) unless `size="sm"` |
| `disabled`, `busy` | `boolean` | `false` | busy = three dots, `aria-busy`, no second pick |
| `icon`, `trail` | `ReactNode` | — | lead / trail glyph |
| `className` | `string` | — | placement only |

The server still sniffs the real type of every upload; `accept` only filters the dialog.

## `FeedbackField` — `ui/feedback/variants/E7Field.tsx` · `data-kit="feedbackField"` (delta E7)

Same props as before (`FieldProps` + `valid?`, `busy?`). Now the underline `Field` with one mark on
the line's end: busy = the three dots (`text-2`, + a `role="status"` "Betöltés" for the `busy` prop
only), valid = the 16 pt tick in `success`, error = the field's own 2 px danger line and message.
A verdict is still held 400 ms while typing settles (dots meanwhile). A caller's `trailing` is kept
after the mark. It no longer reads E7 (`pkg/F12/variants.json`). Its one product use (`LibraryPage`
search) becomes `SearchField` in that screen's package.

## `Sheet` — `ui/feedback/variants/E14E20.tsx` · `data-kit="bottomSheet"` (delta E14)

Contract unchanged: `open`, `onClose`, `title`, `children`, `status?: 'idle' | 'busy' | 'success' |
'error'`, `onRetry?`.

| Part | Value (kit `bottomSheet`, `coach-dashboard-2`, `compose-hub-2`) |
|---|---|
| Scrim | `--scrim` (black 60 %), full screen, no blur. A tap closes |
| Panel | `surface-2` (`--sheet-bg`), top corners 28 (`--radius-sheet`), 1 pt white 14 % edge on top and sides, no shadow; full width up to 430 (`--screen-max`), pinned to the bottom; at most the screen minus the top inset tall, then it scrolls |
| Padding | 12 top · 24 sides · 16 + the bottom inset (= the drawn 50 on a 34 pt inset) |
| Column | 8 apart: grabber · header · body |
| Grabber | 36 × 4, white 24 % (`--grabber`), radius full; dragging it (or the 20 pt around it) moves the sheet down, released past 96 pt or flicked it closes |
| Header | 44 high: title `title` 22 / 28 SemiBold `text-1` (an `h2`, the dialog's name), and the close `iconBtn` (24 pt `x`, `common.close`) flush right |
| Body | the children, 16 apart |
| Status (header, before the close) | busy: three 6 pt dots `text-2` + `aria-busy` · error: a 6 pt `danger` dot, + "Újra" (`TextLink`) with `onRetry` · success: a 6 pt `success` dot. Each announced by a `role="status"` line |
| Motion | rises in `--duration-slow` (400), scrim fades in `--duration-base` (250); both leave in 250. Reduced motion: none |

Behaviour: `role="dialog"` `aria-modal` `aria-labelledby` (the title); focus moves into the panel on
open, Tab / Shift+Tab are held inside it, Escape closes, the page under it does not scroll
(`overflow: hidden` on `<html>`, counted, so nested sheets release correctly), and focus returns to
the opener on close. The letters B–E (centred dialog, morph, stacked deck, success-close) are gone:
every letter renders this sheet.

`SheetStatic` — `{ title, children, status?, onRetry?, onClose? }`: the same scrim, panel and body
drawn inside the nearest positioned ancestor, with no focus move, no scroll lock and no key listener.
For kit specimens and captures only.

`ElementStatus` stays exported.

## `ConfirmSheet` — `ui/feedback/ConfirmSheet.tsx` · `data-kit="confirmSheet"`

The board's "Kijelentkezés" sheet: the question in `body` `text-2`, then the action as a `body-m`
text link (`danger` by default) and "Mégse" (`text-1`) directly under it, no gap, no pill.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `open`, `onClose`, `title` | | — | as `Sheet`; `onClose` is also the cancel |
| `message` | `ReactNode` | — | what will happen |
| `confirmLabel`, `onConfirm` | | — | the action. The sheet does not close itself: the caller closes it when the work is done |
| `cancelLabel` | `string` | `common.cancel` | |
| `tone` | `'danger' \| 'default'` | `'danger'` | |
| `busy` | `boolean` | `false` | the action's three dots |
| `status`, `onRetry` | | — | passed to `Sheet` |

`ConfirmSheetBody` (message + the two links) is exported for the specimen.

## Tokens this stage added (`tokens.css`, block `lane:F12`, in `pkg/F12/shared.patch`)

| Token | Value | Used by |
|---|---|---|
| `--grabber` | `rgb(255 255 255 / 0.24)` | the sheet's grabber |

Read, not added: `--sheet-bg`, `--radius-sheet`, `--scrim`, `--grabber-w`, `--screen-max`,
`--safe-t`, `--safe-b`, `--spacing-group`, `--z-sheet`, `hair-strong`, `--edge`, `--accent`,
`--danger`, `--success`, `--text-1/2/3`, `--pressed-opacity`, `--disabled-opacity`, `--focus-ring`,
the `num`, `title`, `body`, `body-m`, `cap`, `cap-m` steps, `animate-busy-1/2/3`.

## i18n (`pkg/F12/i18n.patch.json`, namespace `common`)

`common.clearSearch`, `common.showPassword`, `common.hidePassword` — the existing strings of
`library.clearSearch`, `auth.showPassword`, `auth.hidePassword`, as the default accessible names of
the shared controls. `common.less` / `common.more` / `common.close` / `common.cancel` /
`common.retry` / `common.loading` are read as they are.

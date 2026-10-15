# Kit reference — the status zone (lane SH2, package F13)

The toast band at the top, the offline line, the Cmd+K palette. Source of the rules:
`docs/brain/58-Pulse/Pulse System.md` §2.6 ("Toast"), §3 (status bar zone: "only the toast band may
enter"), §4 row "Status line / toast". Construction: `figma-build/app-kit.js` 313-315 (`noticeLine`,
`showToast`). Measured: `.pulse/geometry/style-studio-2.json` and `workout-2.json`, layer `Toast`
(band 0-120, `Notice/*` 24,68 354 x 44, `Rule/section` at 112, `Countdown` 24,112 232 x 1). Specimen:
`frontend/src/features/playground/kit/status.tsx`. Ruling: PLAN R14 (the contract is untouchable).

The API below is final. Changes after this page are additive only (R6).

## What a screen writes

Nothing new. A screen raises a toast exactly as before:

```tsx
import { useToast } from '../../ui/feedback/ToastHost';

const { toast } = useToast();
toast(t('coaching.equipmentSaved'));                              // kind 'success' (the ok dot)
toast(t('plans.undoFailed'), 'error');                            // the danger dot
toast(t('plans.dayDeleted'), 'info', { onUndo: () => restore() });  // ink dot + "Visszavonás"
toast(t('plans.dayDeleted'), 'info', () => restore());            // the same: a bare fn is the undo
toast(t('workout.recordSpoken'), 'record');                       // the trophy instead of the dot
```

- `toast(message, kind?, options | fn)` — unchanged. `kind`: `'success'` (default) · `'error'` ·
  `'info'` · `'record'`. `options`: `{ onUndo?, placement? }`.
- **`placement` is accepted and not rendered** (R5). Every toast drops in the one band at the top.
  The screen package that owns a call site deletes the argument (today: `WorkoutPlayer.tsx`, S-workout).
- Undo undoes and closes the line (the behaviour of the letter E15 served at the freeze, `C`).
- 4 s, paused while the pointer is over the line — a real pause: the time left is kept, so the line
  leaves when its countdown ends. At most three lines; the oldest goes.
- Never put a celebration in a toast (Pulse System §4: "No celebration toasts"); the record line is
  the one drawn exception.

## `ToastHost` / `useToast` / `ToastBand` — `frontend/src/ui/feedback/ToastHost.tsx`

| Export | Type | Meaning |
|---|---|---|
| `useToast()` | `() => { toast }` | the raise; a no-op outside the provider |
| `ToastHost` | `({ children })` | the provider + the band; mounted once in `app/providers.tsx` |
| `ToastOptions` | `{ onUndo?: () => void; placement?: ToastPlacement }` | unchanged |
| `ToastPlacement` | `'top' \| 'bottom'` | kept for the call sites, not rendered |
| `ToastBand` | `({ toasts, onDismiss, inline?, still? })` | the band itself (`data-kit="toastBand"`); the host renders it, a specimen can too |

`ToastBand` — kit `showToast`:

| | Value | Source |
|---|---|---|
| Box | full width, the canvas `surface-0`, opaque; lines in the 24 pt gutter (`.screen-x`), a centred 430 column above 430 pt | `Toast` 0,0 402 x 120, fill `#0b0d0a` |
| Top | `top: var(--offline-h)`; padding `max(var(--band-pad-t) − var(--offline-h), 0)` — 68 on the frames (inset 62 + 6) | `Notice` y 68 |
| Bottom | 7 pt under the closing rule (`pb-1.75`) | 120 − 113 |
| Layer | `--z-toast` (over the tab bar and the dock, under the palette) | Pulse System: content → showToast → chrome → dock → sheet |
| Motion | the band drops from the status zone in `base`, leaves in `fast`; a line fades in, 8 pt down, in `base`. Reduced motion: no travel | Pulse System §2.6 |
| `inline` | pinned to its positioned parent (a specimen sets `--band-pad-t` for its device) and does not drop | — |
| `still` | every countdown frozen at that share (0-1), no timer — specimens and captures | — |

**With the offline line up**, the band starts under it (the line publishes `--offline-h`) and pads
only by what of the status zone the line has not covered: two lines one under the other, never one
over the other.

## `Toast` — `frontend/src/ui/feedback/variants/E12E16.tsx` · `data-kit="toast"`

One line of the band: `noticeLine` + its rule + the countdown on the rule.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `toast` | `ToastData` (`{ id, kind, message, onUndo? }`) | — | unchanged |
| `onDismiss` | `(id) => void` | — | unchanged; called by the timer, the close button and Undo |
| `last` | `boolean` | `true` | the line closes the band: strong rule (white 14 %); else the row rule (white 8 %) |
| `still` | `number` (0-1) | — | specimens / captures: the countdown frozen, no timer |
| `force` | `{ undo?, dismiss? }`: `'pressed' \| 'focus'` | — | specimens only |

| Part | Pulse | Frame |
|---|---|---|
| Line | `NoticeLine`: 44 high, 6 pt dot (ok `success`, danger `danger`, ink `text-1`), 8, the message in `cap-m` 13 / 18 Medium `text-1` | `Notice/ok` 24,68; `Dot` 24,87 6 x 6; text x 38, y 81 |
| Record | a 16 pt Lucide `Trophy` in ink instead of the dot; text at x 48 | `workout-2` `glyph/trophy` 24,82 |
| Undo | `TextLink` (cap-m, ink), `common.undo` "Visszavonás" — before the close button, 8 apart | kit `noticeLine(.., action)` |
| Close | the kit `iconBtn`: `Pressable variant="link" shape="icon"`, ✕ 24 pt `text-1`, 44 x 44, `aria-label` `common.dismiss` | `workout-2` `Button/icon · x` 334,68 |
| Rule | `Rule strong` (last line) / `Rule` (a line with a line under it) | `Rule/section` 24,112 354 x 1 |
| Countdown | 1 pt `text-2` over the rule, from the leading edge, `scaleX` 1 → 0 over 4 s (`toast-timer`, a loop the line's removal ends — so a still capture holds it full instead of running the clock 4 s and losing the toast), paused with the timer; **not rendered under reduced motion** | `Countdown` 24,112, `#a9b09d` |
| a11y | each line `role="status"` `aria-live="polite"`; the band is not a live region | — |

States: a line has no disabled and no busy state. Undo and close: rest, pressed (60 %), keyboard
focus (the lime ring) — the actions lane's own looks.

`DUR_MS` and `secs` (the duration tokens for Motion) are exported from the same file for the band.

## `OfflineIndicator` / `OfflineLine` — `frontend/src/ui/shell/OfflineIndicator.tsx`

`OfflineIndicator` is unchanged in behaviour: the outbox drain, the `/healthz` body check, the
`online` / `offline` / `visibilitychange` listeners and the measured `--offline-h` are where they
were. Only its markup is Pulse now — `OfflineLine`:

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `offline` | `boolean` | — | no connection |
| `count` | `number` | — | this user's writes in the outbox |
| `sending` | `boolean` | `false` | draining now (`data-sending`) |
| `showing` | `boolean` | `true` | render the words (the strip is open) |

`data-kit="offlineLine"`: the canvas, the gutter, `--band-pad-t` above, a `NoticeLine` and the strong
rule, 7 under it — the same band a toast drops in, held in the flow. The words:
offline → `offline.title` (warn dot); offline with a queue → `offline.title · offline.queued` on ONE
line (warn), as the board draws `Nincs internetkapcsolat · 3 művelet vár feltöltésre`; online with
a queue → `offline.queued` (ink dot). No glyph, no rail, no tinted surface.

## `CommandPalette` — `frontend/src/ui/shell/CommandPalette.tsx` · `data-kit="commandPalette"`

Kept and minimally restyled (R21); desktop only (`lg`), Cmd+K / Ctrl+K, Esc, arrows, Enter.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `commands` | `Command[]` | — | extra commands after the built-in routes (unchanged) |
| `inline` | `boolean` | `false` | specimens only: the open panel in place — no scrim, no shortcut, no focus taken |

Look: the one scrim (`bg-scrim`); the panel is the sheet's surface — `--sheet-bg` (`surface-2`),
the strong hairline edge, radius 28 (`--radius-sheet`), no blur, no shadow, 24 pt padding at the
sides. The search line is the kit `searchField`: 20 pt glyph `text-2`, 10, 16 pt words, the edge
underline, 2 pt lime while focused, lime caret; `esc` in `micro`. Rows are list rows: 56 high,
`body-m`, row rules between them; the row under the cursor is ink with the return glyph, the rest
`text-2` (a neutral selection, no wash). Keyboard focus on a row: the lime ring.

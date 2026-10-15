import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * The two text tiers a field's secondary lines are set in (Pulse System §2.1).
 *
 * `plain` is `text-2`, `quiet` is `text-3`. A field never sets them in `text-1` (that is the value)
 * and never in a semantic colour (that is the error, which the field decides itself).
 */
export type FieldTone = 'plain' | 'quiet';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** The label. Always rendered — visibly, or for assistive tech only with `labelHidden`. */
  label: string;
  /** Persistent helper text under the line. A placeholder is not a label and not a hint. */
  hint?: string;
  /**
   * The hint's tier. `quiet` (`text-3`, the default) is the kit's hint; `plain` (`text-2`) is for a
   * hint that is the ONLY place a rule is stated — the password rule of `auth-2`, which has to be
   * read before the tap, not discovered after it.
   */
  hintTone?: FieldTone;
  /** The refusal. Replaces the hint in the same place, in `danger`, and thickens the line to 2 px. */
  error?: string;
  /** Placement only (width, flex, margins). Never a colour, a size or a border. */
  className?: string;
  /**
   * A glyph at the line's leading edge — the search glass, a calendar. Pass a bare Lucide icon:
   * the recipe sets it to 20 px, stroke 1.75, `text-2`, 10 px before the value. `aria-hidden` by
   * construction — the label names the field, and a glyph that announced itself would say it twice.
   */
  leading?: ReactNode;
  /**
   * What sits on the line's trailing edge — a reveal button, a format tick, a clear button. It is
   * laid out by the field (flush with the right edge, centred on the 44 pt line, 10 pt after the
   * value) and drawn by the caller: an icon button is a `Pressable` with its own accessible name.
   */
  trailing?: ReactNode;
  /**
   * Obligation marker on the label row — `Kötelező` / `Nem kötelező`: a mono tag (`micro`) on the
   * label's baseline, against the trailing edge.
   *
   * On the label row and not in the hint, because it answers a question the user asks BEFORE
   * typing ("do I have to fill this in?"). Not `required?: boolean`: the frames mark optional
   * fields too. It is tied into `aria-describedby`, because a marker that is only visible tells a
   * sighted user which fields they can skip and leaves everyone else to find out on submit.
   */
  marker?: string;
  /** The marker's tier: `plain` (`text-2`, the default — "Kötelező") or `quiet` (`text-3` — "Nem kötelező"). */
  markerTone?: FieldTone;
  /**
   * Keeps the label for assistive tech only — still rendered, still `htmlFor`-bound, `sr-only`.
   *
   * NOT an escape hatch from "the label is always rendered": the label still exists, so a screen
   * reader still names the field. Use it only where a visible element already carries the same
   * words (onboarding prints the question as a heading above the field); anywhere else this is
   * placeholder-only labelling with extra steps.
   */
  labelHidden?: boolean;
}

const TONE: Record<FieldTone, string> = { plain: 'text-text-2', quiet: 'text-text-3' };

/**
 * The underline field — kit `inputField` (`app-kit.js` 223-236, Pulse System §4 "Underline field").
 *
 * No box: a `cap-m` label, a 44 pt line with the value in `body` (16 — WebKit does not zoom), and
 * the line itself — 1 px `edge` at rest, 2 px lime with a lime caret while focused, 2 px `danger`
 * with the message under it on an error, a hairline with `text-3` everywhere when disabled. A hint
 * sits 8 pt under the line. Measured against `auth-1`, `auth-2` and the component board:
 *
 *   label row        18   (cap-m 13 / 18)
 *   the line         44   value centred (its 22 pt line box at +11), underline on the last 1 or 2 pt
 *   gap               8
 *   hint / error     18   (cap 13 / 18)
 *
 * WHY THE LINE IS THE ROW'S BORDER, AND THE INPUT OVERHANGS IT. The underline runs under the
 * leading glyph and under the trailing control, so it belongs to the row, not to the `<input>`.
 * The row is 44 high with `border-box`, so a thicker border would shrink its content and nudge the
 * value; the row therefore aligns its children to the TOP and every child is itself 44 high —
 * the input, the glyph's slot, the trailing slot. They overhang the border by the line's own 1 or
 * 2 pt, the value stays at +11 in every state, and the input's own box is the 44 pt target.
 *
 * WHY FOCUS IS THE LINE, NOT THE RING. Pulse draws a focused field as a 2 px lime underline and a
 * lime caret, and nothing else — a ring around an element that has no box would draw the box the
 * system forbids. A text input shows its focus for mouse and keyboard alike (it matches
 * `:focus-visible` either way), so the line answers `:focus-within` and the global ring is turned
 * off for this one element. The change from a 1 px grey line to a 2 px lime one is the indicator,
 * and the focus walk of the capture tool reads it (the row's bottom border changes). Focus wins
 * over an error: the message under the line keeps saying what is wrong while the user fixes it.
 *
 * The error is wired through `aria-describedby` and `role="alert"`, so a screen reader hears it
 * when it appears rather than only on the next focus.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  {
    label,
    hint,
    hintTone = 'quiet',
    error,
    className,
    leading,
    trailing,
    marker,
    markerTone = 'plain',
    labelHidden = false,
    id,
    disabled,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const markerId = `${inputId}-marker`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const showHint = !!hint && !error;

  const labelEl = (
    <label htmlFor={inputId} className={cn('text-cap-m', disabled ? 'text-text-3' : 'text-text-2', labelHidden && 'sr-only')}>
      {label}
    </label>
  );

  return (
    // The kit's `Field/<label>`: the labelled line, then the hint 8 under it (`gap-tight`).
    <div data-kit="inputField" className={cn('flex flex-col gap-tight', className)}>
      {/* The kit's `Labelled input`: label row and line touch — the 18 pt label line box is the gap. */}
      <div className="flex flex-col">
        {/* A ROW, not just a label, whenever there is a marker: `justify-between` parks the marker
            against the trailing edge at any width, `items-baseline` sets the mono tag on the label's
            baseline, `gap-2` lets a long label wrap before it collides.
            With no marker AND a hidden label there is nothing to lay out and the row is skipped:
            `sr-only` is `position: absolute`, so an empty row would still open 18 pt of nothing. */}
        {labelHidden && !marker ? (
          labelEl
        ) : (
          <div className={cn('flex items-baseline gap-2', labelHidden ? 'justify-end' : 'justify-between')}>
            {labelEl}
            {marker ? (
              <span id={markerId} className={cn('text-micro shrink-0', TONE[markerTone])}>
                {marker}
              </span>
            ) : null}
          </div>
        )}

        {/* The kit's `Input/underline`: 44 high, glyph · 10 · value · 10 · trailing, and the line. */}
        <div
          className={cn(
            'flex h-11 items-start gap-2.5',
            'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            disabled
              ? 'border-b border-hair'
              : error
                ? 'border-b-2 border-danger focus-within:border-accent'
                : 'border-b border-edge focus-within:border-b-2 focus-within:border-accent',
          )}
        >
          {leading ? (
            <span aria-hidden className="flex h-11 shrink-0 items-center text-text-2 [&_svg]:size-5 [&_svg]:stroke-[1.75]">
              {leading}
            </span>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={cn(marker && markerId, showHint && hintId, error && errorId) || undefined}
            className={cn(
              'h-11 min-w-0 flex-1 bg-transparent p-0',
              'text-body text-text-1 caret-accent placeholder:text-text-3',
              // The line is the focus indicator (see the docblock); the global ring would draw a box
              // around a field that has none, and its radius would bend the ends of the line.
              'rounded-none outline-none focus-visible:outline-none',
              'disabled:text-text-3',
              // A masked value is drawn as 6 pt discs on an 11 pt pitch (auth-2): Geist's bullet at 16
              // is a 4 pt dot, so the masked characters are set larger and tracked out (tokens of the
              // F12 lane block). Only while there is a value — the placeholder keeps the body size —
              // and only while it is masked: a revealed value (`type="text"`) is ordinary text.
              '[&[type=password]:not(:placeholder-shown)]:text-[length:var(--field-mask-size)]',
              '[&[type=password]:not(:placeholder-shown)]:tracking-[var(--field-mask-tracking)]',
              '[&[type=password]:not(:placeholder-shown)]:pb-[var(--field-mask-lift)]',
              // Chrome paints an autofilled input with a tinted fill (`!important` in its own sheet):
              // an input box on the one screen that is never allowed one. The fill is held back for
              // ever with a transition delay — the standard, script-free way — and the value keeps
              // the ink of a typed one.
              'autofill:[transition:background-color_0s_calc(infinity*1s)] autofill:[-webkit-text-fill-color:var(--text-1)]',
            )}
            {...rest}
          />
          {trailing ? <span className="flex h-11 shrink-0 items-center">{trailing}</span> : null}
        </div>
      </div>

      {showHint ? (
        <p id={hintId} className={cn('text-cap', TONE[hintTone])}>
          {hint}
        </p>
      ) : null}

      {/* Errors sit directly under the field they belong to, never collected at the top. The 2 px
          line says it by shape as well as by colour (1 px at rest), the words say what to do. */}
      {error ? (
        <p id={errorId} role="alert" className="text-cap text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});

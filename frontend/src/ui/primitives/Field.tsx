import { forwardRef, useCallback, useId, useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
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
  /**
   * The `data-kit` name of the outer element. Default `inputField`; the siblings built on this field
   * set their own (`SearchField` -> `searchField`, `MaskedField` -> `maskedField`). Not for screens.
   */
  kit?: string;
  /**
   * A unit drawn right after the typed value — "180 g" of `nutrition-2` (gap lane G-inputs). The
   * value stays the bare number (never put the unit into the value); the input is sized to its
   * content and the unit follows it 4 pt after, in `body` `text-2`, before `trailing`. Read out with
   * the field (`aria-describedby`). A tap on the rest of the line still focuses the input.
   */
  unit?: string;
  /**
   * `line` (the default) is the underline field. `title` is the plan name of `plan-editor-1 / -2`
   * (gap lane G-inputs): one line in the `title` step (22 / 28 SemiBold, `text-1`), ellipsis when it
   * does not fit, no label on screen (it is `sr-only`, still bound), NO underline at rest; focus
   * draws the same 2 px lime line (and the lime caret) right under the 28 pt line box, an error the
   * 2 px `danger` line. Its layout box is the 28 pt line; the input is a 44 pt target that overhangs
   * it by 8 above and below. `leading`, `trailing`, `unit` and `marker` are not drawn.
   */
  variant?: FieldVariant;
}

/** The two drawings of `Field`: the underline field, or the heading-like title input. */
export type FieldVariant = 'line' | 'title';

const TONE: Record<FieldTone, string> = { plain: 'text-text-2', quiet: 'text-text-3' };

/* ═══ The frame every underline input shares (stage 2) ═══════════════════════════════════════════
 *
 * `Field`, `TextArea`, `NumberStepper`, `SelectSheet` and `DateTrigger` are the SAME kit drawing —
 * `inputField`: a `cap-m` label row, a line, a `cap` message 8 pt under it — with a different thing
 * on the line. The frame is written once, here, and the five fill the line. It is exported for
 * those siblings; a screen writes one of the five, never the frame.
 */

/** The ids a field wires together, from the control's id. */
export function fieldIds(id: string) {
  return { markerId: `${id}-marker`, hintId: `${id}-hint`, errorId: `${id}-error`, labelId: `${id}-label` };
}

/** `aria-describedby` of a field's control: marker + hint (only while it is shown) + error + extra. */
export function fieldDescribedBy(
  id: string,
  { marker, hint, error, extra }: { marker?: string; hint?: string; error?: string; extra?: string },
) {
  const ids = fieldIds(id);
  return cn(marker && ids.markerId, hint && !error && ids.hintId, error && ids.errorId, extra) || undefined;
}

/**
 * The line's border in each state: 1 px `edge` at rest, 2 px lime while anything inside has focus,
 * 2 px `danger` on an error (focus still wins), a hairline when disabled. For a row that has a
 * fixed height and aligns its children to the TOP, so a thicker line never moves the content.
 */
export function fieldLine({ disabled, error }: { disabled?: boolean; error?: boolean }) {
  return cn(
    'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
    disabled
      ? 'border-b border-hair'
      : error
        ? 'border-b-2 border-danger focus-within:border-accent'
        : 'border-b border-edge focus-within:border-b-2 focus-within:border-accent',
  );
}

/** Whether the engine sizes an input to its content by itself (`field-sizing: content`). */
const FIELD_SIZING = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');

/**
 * Sizes an `<input>` to its value (or its placeholder while empty): `field-sizing: content` where the
 * engine has it — the class `[field-sizing:content]` is the caller's — and a width in `ch` written
 * here everywhere else. Call it after every render and on every input event. For the siblings of
 * the field (`Field unit`, `NumeralField`); not for screens.
 */
export function fitInputToContent(el: HTMLInputElement | null) {
  if (!el || FIELD_SIZING) return;
  const chars = Math.max(1, (el.value || el.placeholder || '').length);
  el.style.width = `${chars + 0.25}ch`;
}

/** Hands one element to a forwarded ref (function or object). For the field's siblings. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

export interface FieldFrameProps {
  /** The `data-kit` name of the whole field. */
  kit: string;
  /** The control's id — the label's `htmlFor` and the stem of every other id. */
  controlId: string;
  label: string;
  hint?: string;
  hintTone?: FieldTone;
  error?: string;
  marker?: string;
  markerTone?: FieldTone;
  labelHidden?: boolean;
  disabled?: boolean;
  /**
   * A node at the trailing end of the label row, on the label's baseline: the character counter of
   * `compose-post` ("19897 karakter maradt", `cap` `text-3`). Takes the marker's place.
   */
  aside?: ReactNode;
  /**
   * `label` (the default) binds the label with `htmlFor`. `span` draws the same words for a control
   * that names itself with `aria-labelledby` (a trigger whose name is label + value).
   */
  labelAs?: 'label' | 'span';
  /** Space between the label row and the line: 0 (the kit) or 4 (`onboarding-3`'s 60 pt number line). */
  lineGap?: 0 | 4;
  className?: string;
  /** The line. */
  children: ReactNode;
}

/** The kit's `Field/<label>`: label row, the line, then the hint or the error 8 under it. */
export function FieldFrame({
  kit,
  controlId,
  label,
  hint,
  hintTone = 'quiet',
  error,
  marker,
  markerTone = 'plain',
  labelHidden = false,
  disabled,
  aside,
  labelAs = 'label',
  lineGap = 0,
  className,
  children,
}: FieldFrameProps) {
  const { markerId, hintId, errorId, labelId } = fieldIds(controlId);
  const showHint = !!hint && !error;
  const labelClass = cn('text-cap-m', disabled ? 'text-text-3' : 'text-text-2', labelHidden && 'sr-only');
  const labelEl =
    labelAs === 'label' ? (
      <label id={labelId} htmlFor={controlId} className={labelClass}>
        {label}
      </label>
    ) : (
      <span id={labelId} className={labelClass}>
        {label}
      </span>
    );
  const trailingNode =
    aside ??
    (marker ? (
      <span id={markerId} className={cn('text-micro shrink-0', TONE[markerTone])}>
        {marker}
      </span>
    ) : null);

  return (
    // The kit's `Field/<label>`: the labelled line, then the hint 8 under it (`gap-tight`).
    <div data-kit={kit} className={cn('flex flex-col gap-tight', className)}>
      {/* The kit's `Labelled input`: label row and line touch — the 18 pt label line box is the gap. */}
      <div className={cn('flex flex-col', lineGap === 4 && 'gap-1')}>
        {/* A ROW, not just a label, whenever there is a marker: `justify-between` parks the marker
            against the trailing edge at any width, `items-baseline` sets the mono tag on the label's
            baseline, `gap-2` lets a long label wrap before it collides.
            With no marker AND a hidden label there is nothing to lay out and the row is skipped:
            `sr-only` is `position: absolute`, so an empty row would still open 18 pt of nothing. */}
        {labelHidden && !trailingNode ? (
          labelEl
        ) : (
          <div className={cn('flex items-baseline gap-2', labelHidden ? 'justify-end' : 'justify-between')}>
            {labelEl}
            {trailingNode}
          </div>
        )}
        {children}
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
}

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
    kit = 'inputField',
    unit,
    variant = 'line',
    id,
    disabled,
    onInput,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const unitId = `${inputId}-unit`;
  const input = useRef<HTMLInputElement | null>(null);
  const setInput = useCallback(
    (el: HTMLInputElement | null) => {
      input.current = el;
      assignRef(ref, el);
    },
    [ref],
  );
  // A unit follows the value's ink, so the input hugs its content — re-measured after every
  // render: a controlled value can change from outside, and react-hook-form writes it uncontrolled.
  useLayoutEffect(() => {
    if (unit && variant === 'line') fitInputToContent(input.current);
  });

  if (variant === 'title') {
    return (
      <FieldFrame
        kit={kit}
        controlId={inputId}
        label={label}
        hint={hint}
        hintTone={hintTone}
        error={error}
        labelHidden
        disabled={disabled}
        className={className}
      >
        {/* The frames draw the plan name as a bare 22 / 28 line. The 44 pt target overhangs that
            line by 8 above and below (`-my-2`), and the focus / error line is drawn on the 2 pt right
            under the line box (6 pt above the target's bottom), so the layout box is the frame's 28. */}
        <div
          data-field-line="title"
          className={cn(
            'relative -my-2 flex h-11 items-center',
            'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-1.5 after:h-0.5',
            'after:transition-colors after:duration-[var(--duration-fast)] after:ease-[var(--ease-standard)]',
            disabled
              ? 'after:bg-transparent'
              : error
                ? 'after:bg-danger focus-within:after:bg-accent'
                : 'after:bg-transparent focus-within:after:bg-accent',
          )}
        >
          <input
            ref={setInput}
            id={inputId}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldDescribedBy(inputId, { hint, error })}
            onInput={onInput}
            className={cn(
              'h-11 min-w-0 flex-1 truncate bg-transparent p-0',
              'text-title text-text-1 caret-accent placeholder:text-text-3',
              'rounded-none outline-none focus-visible:outline-none',
              'disabled:text-text-3',
              'autofill:[transition:background-color_0s_calc(infinity*1s)] autofill:[-webkit-text-fill-color:var(--text-1)]',
            )}
            {...rest}
          />
        </div>
      </FieldFrame>
    );
  }

  return (
    <FieldFrame
      kit={kit}
      controlId={inputId}
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      marker={marker}
      markerTone={markerTone}
      labelHidden={labelHidden}
      disabled={disabled}
      className={className}
    >
      {/* The kit's `Input/underline`: 44 high, glyph · 10 · value · 10 · trailing, and the line. */}
      <div
        className={cn('flex h-11 items-start gap-2.5', fieldLine({ disabled, error: !!error }))}
        // With a unit the input hugs its value; a tap on the rest of the line still focuses it.
        onPointerDown={
          unit
            ? (e) => {
                if ((e.target as HTMLElement).dataset.fieldRest !== undefined) {
                  e.preventDefault();
                  input.current?.focus();
                }
              }
            : undefined
        }
      >
        {leading ? (
          <span aria-hidden className="flex h-11 shrink-0 items-center text-text-2 [&_svg]:size-5 [&_svg]:stroke-[1.75]">
            {leading}
          </span>
        ) : null}
        <input
          ref={setInput}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(inputId, { marker, hint, error, extra: unit ? unitId : undefined })}
          onInput={(e) => {
            if (unit) fitInputToContent(e.currentTarget);
            onInput?.(e);
          }}
          className={cn(
            'h-11 min-w-0 bg-transparent p-0',
            unit ? 'max-w-full shrink [field-sizing:content]' : 'flex-1',
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
            // `type="search"`: the engine's own cancel glyph and decoration go — `SearchField` draws
            // the kit's clear control on the trailing edge instead.
            '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
          )}
          {...rest}
        />
        {unit ? (
          <>
            {/* "180 g": the unit 4 after the digits (the row's 10 gap less 6), in the value's step,
                one tier down; then the rest of the line, which focuses the input on a tap. */}
            <span id={unitId} className={cn('-ml-1.5 flex h-11 shrink-0 items-center text-body', disabled ? 'text-text-3' : 'text-text-2')}>
              {unit}
            </span>
            <span aria-hidden data-field-rest="" className="h-11 min-w-0 flex-1" />
          </>
        ) : null}
        {trailing ? <span className="flex h-11 shrink-0 items-center">{trailing}</span> : null}
      </div>
    </FieldFrame>
  );
});

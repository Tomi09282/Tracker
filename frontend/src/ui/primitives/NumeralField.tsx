import { forwardRef, useCallback, useId, useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '../../lib/cn';
import { assignRef, fitInputToContent } from './Field';

export interface NumeralFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type' | 'size'> {
  /**
   * The field's name for assistive tech. Always rendered, always `sr-only`: the frames name these
   * figures with a column head above the rows ("Súly", "ism."), never with a label of their own.
   */
  label: string;
  /**
   * The refusal: the line becomes 2 px `danger` and the input `aria-invalid`. The words are announced
   * (`role="alert"`, `sr-only`) — a set row has no line for a message under the figure, so a screen
   * that wants them on screen prints them itself (a `NoticeLine` under the rows).
   */
  error?: string;
  /**
   * A recorded value (`workout-1` rows 1-2 "done"): the figure stays in `text-1`, the line goes, and
   * the 14 pt lock (`text-3`) follows the figure 3 pt after its box (6 after the ink). The input is
   * disabled — the value is read, not edited.
   */
  locked?: boolean;
  /** The lock's words for assistive tech, read with the value ("Rögzítve" = `workout.recorded`). */
  lockedLabel?: string;
  /**
   * Draw the lock after a locked figure. Default `true`. `workout-1` draws ONE lock per recorded row,
   * after the weight: the reps field of that row is `locked lockMark={false}` (its `lockedLabel` is
   * still read).
   */
  lockMark?: boolean;
  /**
   * Placement AND the field's width — the frames' two widths are 104 (`w-26`, the weight) and 40
   * (`w-10`, the reps). A value wider than that ("142,5") is not cut: the figure grows past the line.
   */
  className?: string;
}

/**
 * The typed figure — the set fields of `workout-1 / -2` (gap lane G-inputs, kit gap 9).
 *
 * A text input that wears the `num` step (Big Shoulders Display Black 48 / 48) inside a 64 pt row
 * box: the figure's line box 8 under the top, and the 1 pt `edge` line drawn on the pt UNDER the box
 * — exactly where a `RowStack` draws the row's rule (`Field edge` 152,551 104 × 1 on `Rule/row`
 * 24,551) — so the field's line and the row's rule are one line. The value is `text-1`, the
 * placeholder (the previous set's figure) `text-3`, the caret lime.
 *
 *   box                64   (the set row)
 *   figure line box    48   at +8 (`num` 48 / 48)
 *   line                1   `edge` at +64 · focus 2 px lime at +63 · error 2 px `danger` · none locked
 *   hit target         64 × max(width, 44) — the whole box focuses the input, and a 40 pt field
 *                      reaches 2 pt past each side
 *
 * The value is the caller's STRING (`inputMode="decimal"`): a figure is typed with the locale's comma
 * ("142,5") and parsed by the screen, which keeps its own sanitising. The figure is 48 pt, so WebKit
 * never zooms the page on focus. No − / +: a field that steps is `NumberStepper`.
 *
 * Focus is the line, as on every field (1 px grey -> 2 px lime + the caret); the global ring is off on
 * this one element, because a ring would draw the box Pulse forbids.
 */
export const NumeralField = forwardRef<HTMLInputElement, NumeralFieldProps>(function NumeralField(
  { label, error, locked = false, lockedLabel, lockMark = true, className, id, disabled, onInput, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const lockId = `${inputId}-lock`;
  const input = useRef<HTMLInputElement | null>(null);
  const setInput = useCallback(
    (el: HTMLInputElement | null) => {
      input.current = el;
      assignRef(ref, el);
    },
    [ref],
  );
  // The figure hugs its digits (the lock follows the ink); re-measured after every render.
  useLayoutEffect(() => fitInputToContent(input.current));

  const off = disabled || locked;
  const describedBy = cn(rest['aria-describedby'], error && errorId, locked && lockedLabel && lockId) || undefined;

  return (
    <div
      data-kit="numeralField"
      data-state={locked ? 'locked' : disabled ? 'disabled' : error ? 'error' : undefined}
      className={cn(
        'relative flex h-16 min-w-0 items-start',
        // The whole box is the target; a 40 pt field reaches 2 pt past each side (the 44 floor).
        'before:absolute before:inset-y-0 before:-inset-x-0.5 before:content-[""]',
        // The line, on the pt under the box (see the docblock); focus thickens it upwards by 1.
        'after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px',
        'after:transition-colors after:duration-[var(--duration-fast)] after:ease-[var(--ease-standard)]',
        locked
          ? 'after:hidden'
          : disabled
            ? 'after:bg-hair'
            : error
              ? 'after:h-0.5 after:bg-danger focus-within:after:bg-accent'
              : 'after:bg-edge focus-within:after:h-0.5 focus-within:after:bg-accent',
        className,
      )}
      onPointerDown={(e) => {
        if (off || e.target === input.current) return;
        e.preventDefault();
        input.current?.focus();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        ref={setInput}
        id={inputId}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        disabled={off}
        aria-invalid={error ? true : undefined}
        onInput={(e) => {
          fitInputToContent(e.currentTarget);
          onInput?.(e);
        }}
        {...rest}
        aria-describedby={describedBy}
        className={cn(
          'relative mt-2 h-12 bg-transparent p-0 [field-sizing:content]',
          // Editable: at least the field's width (the target), growing past it for a long figure.
          // Locked: exactly the figure, so the lock follows its ink.
          locked ? 'min-w-[1ch]' : 'min-w-full',
          'text-num tracking-normal text-text-1 caret-accent placeholder:text-text-3',
          'rounded-none outline-none focus-visible:outline-none',
          locked ? 'disabled:text-text-1' : 'disabled:text-text-3',
          'autofill:[transition:background-color_0s_calc(infinity*1s)] autofill:[-webkit-text-fill-color:var(--text-1)]',
        )}
      />
      {locked && lockMark ? (
        // `glyph/lock · Rögzítve`: 14 pt, `text-3`, 2 after the figure's box (202 in the frame, whose
        // text box starts 2 left of the field), 36 under the box's top.
        <span className="relative ml-0.5 mt-9 flex size-3.5 shrink-0 items-center justify-center text-text-3 [&_svg]:size-3.5 [&_svg]:stroke-[1.75]">
          <Lock aria-hidden />
          {lockedLabel ? (
            <span id={lockId} className="sr-only">
              {lockedLabel}
            </span>
          ) : null}
        </span>
      ) : null}
      {locked && !lockMark && lockedLabel ? (
        <span id={lockId} className="sr-only">
          {lockedLabel}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </div>
  );
});

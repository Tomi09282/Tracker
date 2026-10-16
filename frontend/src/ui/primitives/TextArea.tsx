import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';
import { FieldFrame, fieldDescribedBy, type FieldTone } from './Field';

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'rows'> {
  /** The label. Always rendered — visibly, or for assistive tech only with `labelHidden`. */
  label: string;
  hint?: string;
  hintTone?: FieldTone;
  error?: string;
  marker?: string;
  markerTone?: FieldTone;
  labelHidden?: boolean;
  /**
   * A running count at the trailing end of the label row, `cap` `text-3` ("19897 karakter maradt",
   * `compose-post`). Read out with the field (`aria-describedby`). Takes the marker's place.
   */
  counter?: string;
  /**
   * The rows the box keeps even when empty. Default 1: a 44 pt line like every field, growing a row
   * of 22 at a time (`coach-chat-2`, `onboarding-1`). `compose-post` / `compose-profile` keep 7 (176).
   */
  minRows?: number;
  /** The rows it grows to before it scrolls. Default: no limit. */
  maxRows?: number;
  /** Placement only. */
  className?: string;
}

/** One row of `body` — the line height the box grows by. */
const ROW = 22;
/** The pad above the first row and below the last: a one-row box is the field's 44. */
const PAD = 11;

/**
 * The multi-line underline field — `Textarea/underline` of `compose-post-1`, `Input/underline ·
 * multi-line` of `onboarding-1`, the composer of `coach-chat-2`.
 *
 * No box: the `inputField` frame (cap-m label, the line, a `cap` hint 8 under it) around a
 * `<textarea>` whose text is `body` 16 / 22 from 11 pt below the label row, so one row is exactly the
 * 44 pt line of a single-line field, and every row more adds 22 (66, 88 …). The underline is the
 * box's last pt: 1 px `edge`, 2 px lime + lime caret on focus, 2 px `danger` with the message under
 * it on an error, a hairline when disabled.
 *
 * WHY THE LINE IS DRAWN, NOT BORDERED. A border would make the box one pt taller on focus and push
 * the hint down; the line is a pseudo-element over the last 1 or 2 pt of the bottom pad instead, so
 * the box keeps its height in every state (the frames draw a 2 pt focus line inside the 44).
 *
 * Auto-grow: the box follows its content between `minRows` and `maxRows` — through CSS
 * `field-sizing: content` where the engine has it, and through its own measured `scrollHeight`
 * everywhere else (re-measured on every value change, controlled or not).
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    label,
    hint,
    hintTone = 'quiet',
    error,
    marker,
    markerTone = 'plain',
    labelHidden = false,
    counter,
    minRows = 1,
    maxRows,
    className,
    id,
    disabled,
    value,
    onChange,
    style,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const counterId = `${areaId}-counter`;
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => area.current as HTMLTextAreaElement);

  const min = PAD * 2 + ROW * Math.max(1, minRows);
  const max = maxRows ? PAD * 2 + ROW * Math.max(minRows, maxRows) : undefined;

  const fit = useCallback(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.max(min, Math.min(max ?? Infinity, el.scrollHeight));
    el.style.height = `${h}px`;
    el.style.overflowY = max !== undefined && el.scrollHeight > max ? 'auto' : 'hidden';
  }, [min, max]);

  // Controlled: the value can change from outside (a draft restored, a send that cleared it).
  useLayoutEffect(fit, [fit, value]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e);
    if (value === undefined) fit();
  };

  return (
    <FieldFrame
      kit="textArea"
      controlId={areaId}
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      marker={marker}
      markerTone={markerTone}
      labelHidden={labelHidden}
      disabled={disabled}
      aside={
        counter ? (
          <span id={counterId} className="text-cap shrink-0 text-text-3">
            {counter}
          </span>
        ) : undefined
      }
      className={className}
    >
      <div
        className={cn(
          'relative flex',
          // The underline, drawn over the box's bottom pad (see the docblock).
          'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px',
          'after:transition-colors after:duration-[var(--duration-fast)] after:ease-[var(--ease-standard)]',
          disabled
            ? 'after:bg-hair'
            : error
              ? 'after:h-0.5 after:bg-danger focus-within:after:bg-accent'
              : 'after:bg-edge focus-within:after:h-0.5 focus-within:after:bg-accent',
        )}
      >
        <textarea
          ref={area}
          id={areaId}
          rows={Math.max(1, minRows)}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(areaId, { marker: counter ? undefined : marker, hint, error, extra: counter ? counterId : undefined })}
          style={{ minHeight: min, maxHeight: max, ...style }}
          className={cn(
            'block w-full resize-none overflow-hidden bg-transparent px-0 py-2.75',
            'text-body text-text-1 caret-accent placeholder:text-text-3',
            '[field-sizing:content]',
            'rounded-none outline-none focus-visible:outline-none',
            'disabled:text-text-3',
          )}
          {...rest}
        />
      </div>
    </FieldFrame>
  );
});

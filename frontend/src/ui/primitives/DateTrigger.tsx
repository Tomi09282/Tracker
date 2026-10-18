import { forwardRef, useId, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { FieldFrame, fieldDescribedBy, fieldLine, type FieldTone } from './Field';

export type DateTriggerVariant = 'field' | 'inline';

export interface DateTriggerProps {
  /** The label. `field`: drawn above the line. `inline`: the trigger's name for assistive tech only. */
  label: string;
  /** The day, `YYYY-MM-DD` (the native picker's own format), or `''` for none. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest / latest selectable day, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  /**
   * `field` (the default): the underline field of `progress-1` / `progress-3` "Mikor" — the 20 pt
   * calendar glyph, the day in `body`. `inline`: the date control of `nutrition-1`'s header — the
   * day in `cap-m` `text-1` and a 16 pt chevron, 44 high, as wide as its words.
   */
  variant?: DateTriggerVariant;
  /**
   * `field` only: where the glyph stands. `calendar` (the default): the 20 pt calendar glyph 10
   * before the day (`progress-1`). `chevron`: no leading glyph, the 16 pt chevron in `text-2` flush
   * with the right edge, 10 after the day (round B `task-form` / `capture` "Dátum": a picker field).
   */
  glyph?: 'calendar' | 'chevron';
  /** How the day is written. Default: `field` "2026. okt. 9.", `inline` "Péntek, október 9." in the app's language. */
  format?: (value: string, locale: string) => string;
  /** Shown while there is no day (`field` only), in `text-3`. */
  placeholder?: string;
  hint?: string;
  hintTone?: FieldTone;
  error?: string;
  marker?: string;
  markerTone?: FieldTone;
  labelHidden?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  /** Placement only. */
  className?: string;
}

/** `YYYY-MM-DD` as a local calendar day (never through UTC, which would move it across midnight). */
function toDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** The two drawn forms, in the app's language. Weekday first and capitalised, as Home's greeting writes it. */
function defaultFormat(variant: DateTriggerVariant) {
  return (value: string, locale: string) => {
    const d = toDate(value);
    if (!d) return value;
    if (variant === 'field') return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
    const day = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(d);
    return `${weekday.charAt(0).toLocaleUpperCase(locale)}${weekday.slice(1)}, ${day}`;
  };
}

/** Opens the engine's own picker where it can be asked to (a click on the input's body otherwise only focuses a segment). */
function openPicker(input: HTMLInputElement) {
  try {
    input.showPicker();
  } catch {
    // An engine without `showPicker`, or a call outside a user gesture: the focused input still opens on its own.
  }
}

/**
 * A day, chosen with the platform's own date picker — `Field/Mikor` of `progress-1` / `progress-3`
 * and `Date control · Dátum` of `nutrition-1`.
 *
 * Pulse draws the day as words; the platform draws the picker. So the control IS the native
 * `<input type="date">` — it carries the value, the min / max, the form name, the keyboard and the
 * screen-reader semantics — laid transparently over the drawing of the day and opened with
 * `showPicker()` on a tap, Enter or Space. Nothing re-implements a calendar.
 *
 *   field   the `inputField` frame: the 20 pt calendar glyph in `text-2`, 10 before the day in
 *           `body` `text-1` (the placeholder in `text-3`); the line 1 px `edge`, 2 px lime while
 *           the picker's input has focus, 2 px `danger` on an error.
 *   inline  the header's text trigger: the day in `cap-m` `text-1`, 4 pt, the 16 pt chevron in
 *           `text-2`; 44 high, as wide as its words; pressed 60 %, keyboard focus the lime ring.
 */
export const DateTrigger = forwardRef<HTMLInputElement, DateTriggerProps>(function DateTrigger(
  {
    label,
    value,
    onChange,
    min,
    max,
    variant = 'field',
    glyph = 'calendar',
    format,
    placeholder,
    hint,
    hintTone,
    error,
    marker,
    markerTone,
    labelHidden,
    disabled,
    required,
    id,
    name,
    className,
  },
  ref,
) {
  const { i18n } = useTranslation();
  const autoId = useId();
  const inputId = id ?? autoId;
  const text = value ? (format ?? defaultFormat(variant))(value, i18n.language) : '';

  const native = (
    <input
      ref={ref}
      id={inputId}
      name={name}
      type="date"
      value={value}
      min={min}
      max={max}
      required={required}
      disabled={disabled}
      aria-label={variant === 'inline' ? label : undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={variant === 'field' ? fieldDescribedBy(inputId, { marker, hint, error }) : undefined}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e: MouseEvent<HTMLInputElement>) => openPicker(e.currentTarget)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker(e.currentTarget);
        }
      }}
      className={cn(
        // Over the whole drawing, invisible: the drawing is the look, this is the control.
        'absolute inset-0 m-0 size-full cursor-pointer appearance-none bg-transparent p-0 opacity-0',
        'outline-none focus-visible:outline-none disabled:cursor-default',
        '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0',
        '[&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer',
      )}
    />
  );

  if (variant === 'inline') {
    return (
      <span
        data-kit="dateTrigger"
        className={cn(
          'relative inline-flex h-11 items-center gap-1 self-start',
          'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
          'active:opacity-[var(--pressed-opacity)]',
          // The lime ring of every control, 2 off the box, while the picker's input has keyboard focus.
          'rounded-2 has-[input:focus-visible]:outline-solid has-[input:focus-visible]:outline-2',
          'has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[var(--focus-ring)]',
          disabled && 'pointer-events-none opacity-[var(--disabled-opacity)]',
          className,
        )}
      >
        <span aria-hidden className="text-cap-m text-text-1">
          {text}
        </span>
        <span aria-hidden className="flex size-4 items-center justify-center text-text-2 [&_svg]:size-4 [&_svg]:stroke-[1.75]">
          <ChevronDown />
        </span>
        {native}
      </span>
    );
  }

  return (
    <FieldFrame
      kit="dateTrigger"
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
      <div className={cn('relative flex h-11 items-start gap-2.5', fieldLine({ disabled, error: !!error }))}>
        {glyph === 'calendar' ? (
          <span aria-hidden className="flex h-11 shrink-0 items-center text-text-2 [&_svg]:size-5 [&_svg]:stroke-[1.75]">
            <Calendar />
          </span>
        ) : null}
        <span
          aria-hidden
          className={cn('flex h-11 min-w-0 flex-1 items-center truncate text-body', disabled ? 'text-text-3' : text ? 'text-text-1' : 'text-text-3')}
        >
          {text || placeholder}
        </span>
        {glyph === 'chevron' ? (
          <span aria-hidden className="flex h-11 shrink-0 items-center text-text-2 [&_svg]:size-4 [&_svg]:stroke-[1.75]">
            <ChevronDown />
          </span>
        ) : null}
        {native}
      </div>
    </FieldFrame>
  );
});

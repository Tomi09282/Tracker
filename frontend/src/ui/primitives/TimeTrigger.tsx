import { forwardRef, useId, type KeyboardEvent, type MouseEvent } from 'react';
import { cn } from '../../lib/cn';
import { FieldFrame, fieldDescribedBy, fieldLine, type FieldTone } from './Field';

/*
 * TimeTrigger — a time of day on the underline field (lane G-lifeos, kit gap F.2).
 *
 * Source: round B — `task-form` "Határidő ideje 20:00" (165 wide), `habit-form` "Emlékeztető ideje
 * 07:30" (full width, with a hint), `event-form` "Kezdés 16:00" / "Vége 16:45" (106 wide). Every one
 * is the kit's `inputField` (`app-kit.js` 223): a `cap-m` `text-2` label, a 44 pt line with the value
 * 1 px `edge` at rest / 2 px lime with focus / 2 px `danger` on an error, the hint `cap` `text-3`
 * 8 under the line. No leading glyph, no chevron — the frames draw none.
 *
 * The face of the value: task-form and habit-form set it in `body` (Geist 16); event-form sets the
 * clock figures in Geist Mono Medium 16, −1 % (`event-form.body.js`: "mono only for the clock
 * figures") — that is `face="mono"` (`data-l`).
 *
 * The picker is the platform's, exactly as `DateTrigger` does it: the control IS a native
 * `<input type="time">` laid transparently over the drawing and opened with `showPicker()` on a tap,
 * Enter or Space. It carries the value (`HH:MM`, 24 h), min / max / step, the form name, the
 * keyboard (the segments are typed and arrowed) and the screen-reader semantics. Nothing
 * re-implements a clock.
 *
 * Reference: docs/pipeline/pulse/kit/lifeos.md.
 */

export type TimeTriggerFace = 'body' | 'mono';

export interface TimeTriggerProps {
  label: string;
  /** `HH:MM` (24 h, the native input's own format), or `''` for none. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest / latest time, `HH:MM`. */
  min?: string;
  max?: string;
  /** Step in seconds (the native attribute). Default 60. */
  step?: number;
  /** `body` (default, task-form / habit-form) or `mono` (event-form's clock figures). */
  face?: TimeTriggerFace;
  /** Shown while there is no time, `text-3`. */
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
  /** Placement only (the width: `w-[165px]`, `flex-1`). */
  className?: string;
}

/** Opens the engine's own picker where it can be asked to. */
function openPicker(input: HTMLInputElement) {
  try {
    input.showPicker();
  } catch {
    // No `showPicker`, or not in a user gesture: the focused input still takes typed segments.
  }
}

/** The drawn value: `HH:MM` as given (a native value may carry seconds: they are not drawn). */
const drawn = (value: string) => (/^\d{2}:\d{2}/.exec(value)?.[0] ?? value);

export const TimeTrigger = forwardRef<HTMLInputElement, TimeTriggerProps>(function TimeTrigger(
  {
    label,
    value,
    onChange,
    min,
    max,
    step = 60,
    face = 'body',
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
  const autoId = useId();
  const inputId = id ?? autoId;
  const text = value ? drawn(value) : '';

  return (
    <FieldFrame
      kit="timeTrigger"
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
      <div className={cn('relative flex h-11 items-start', fieldLine({ disabled, error: !!error }))}>
        <span
          aria-hidden
          className={cn(
            'flex h-11 min-w-0 flex-1 items-center truncate',
            face === 'mono' ? 'text-data-l' : 'text-body',
            disabled ? 'text-text-3' : text ? 'text-text-1' : 'text-text-3',
          )}
        >
          {text || placeholder}
        </span>
        <input
          ref={ref}
          id={inputId}
          name={name}
          type="time"
          value={value}
          min={min}
          max={max}
          step={step}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(inputId, { marker, hint, error })}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e: MouseEvent<HTMLInputElement>) => openPicker(e.currentTarget)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker(e.currentTarget);
            }
          }}
          className={cn(
            // Over the whole drawing, invisible: the drawing is the look, this is the control. Focus
            // is the line (2 px lime, `focus-within` on the row), as on every underline field.
            'absolute inset-0 m-0 size-full cursor-pointer appearance-none bg-transparent p-0 opacity-0',
            'outline-none focus-visible:outline-none disabled:cursor-default',
            '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0',
            '[&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer',
          )}
        />
      </div>
    </FieldFrame>
  );
});

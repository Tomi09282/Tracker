import { forwardRef, useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { FieldFrame, fieldDescribedBy, fieldLine, type FieldTone } from './Field';
import { Pressable } from './Pressable';

export interface NumberStepperProps {
  /** The label. Always rendered — visibly, or for assistive tech only with `labelHidden`. */
  label: string;
  /** The number, or `null` for an empty field (`onboarding-3` "Hetente hány edzés?" before an answer). */
  value: number | null;
  /** Every change — a step, a typed number, an emptied field (`null`). Clamped to `min` / `max`. */
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** One tap of − / +. Default 1. */
  step?: number;
  /**
   * A short unit after the figure, `cap` `text-2`, 4 pt from its ink ("x / hét"). Read out with the
   * value. Additive request P10-R02 of the plan; the frames draw the unit in the label instead.
   */
  unit?: string;
  /**
   * The value is accepted — the 16 pt tick in `text-2`, 10 after the figure (`onboarding-3`
   * "Bounds tick · value in range"). The caller decides; the stepper only draws it.
   */
  valid?: boolean;
  hint?: string;
  hintTone?: FieldTone;
  error?: string;
  marker?: string;
  markerTone?: FieldTone;
  labelHidden?: boolean;
  disabled?: boolean;
  /** The − / + names. Default `common.less` ("Kevesebb") / `common.more` ("Több"), as the frame names them. */
  decreaseLabel?: string;
  increaseLabel?: string;
  /**
   * Draw − and + on the line's trailing edge. Default `true`. `false` keeps the typed figure, the
   * keyboard steps (ArrowUp / ArrowDown, PageUp / PageDown, Home / End), the tick, the hint and the
   * error, and leaves the line empty after them (gap lane G-inputs). A figure on a row's rule with
   * no label row of its own is `NumeralField`.
   */
  controls?: boolean;
  id?: string;
  name?: string;
  /** Placement only. */
  className?: string;
}

const clampTo = (n: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

/**
 * The number line — `Input/number` of `onboarding-3` (Pulse System §4: "number stepper =
 * `iconBtn('minus')` · `numeral` · `iconBtn('plus')`").
 *
 * The `inputField` frame around a 60 pt line, 4 under the label: the value in the display face's
 * `num` step (Big Shoulders Display Black 48 / 48, its cap ink 10.5 under the line's top, on the
 * gutter), the optional tick 10 after it, and on the trailing edge the two bare 44 pt icon buttons
 * of the actions kit, 4 apart, 8 under the line's top. The underline is the line's last pt — 1 px
 * `edge`, 2 px lime on focus, 2 px `danger` with the message under it on an error.
 *
 * The figure is a real input (`inputmode="numeric"`, `role="spinbutton"` with its now / min / max),
 * so it can be typed as well as stepped; ArrowUp / ArrowDown step it from the keyboard, PageUp /
 * PageDown by ten steps. The figure is 48 pt — larger than the 16 pt floor at which WebKit zooms
 * a focused input, so the display face is allowed here. Its width follows its digits.
 *
 * − and + are disabled at `min` / `max` (40 %), keep their place, and never take focus away from
 * the figure on a pointer tap.
 */
export const NumberStepper = forwardRef<HTMLInputElement, NumberStepperProps>(function NumberStepper(
  {
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    unit,
    valid = false,
    hint,
    hintTone,
    error,
    marker,
    markerTone,
    labelHidden,
    disabled,
    decreaseLabel,
    increaseLabel,
    controls = true,
    id,
    name,
    className,
  },
  ref,
) {
  const { t } = useTranslation();
  const autoId = useId();
  const inputId = id ?? autoId;
  const unitId = `${inputId}-unit`;

  // What is being typed. A half-typed "-" or an emptied field is kept as text until it is a number.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(value));

  const commit = (next: number | null) => {
    setDraft(null);
    onChange(next === null ? null : clampTo(next, min, max));
  };

  const by = (delta: number) => {
    const base = value ?? (delta > 0 ? (min ?? 0) - step : (max ?? 0) + step);
    commit(clampTo(base + delta, min, max));
  };

  const onType = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value.replace(/[^\d-]/g, '');
    if (text === '') {
      setDraft(null);
      onChange(null);
      return;
    }
    const n = Number(text);
    if (Number.isFinite(n) && text !== '-') {
      setDraft(text);
      onChange(n);
    } else setDraft(text);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const keys: Record<string, number> = { ArrowUp: step, ArrowDown: -step, PageUp: step * 10, PageDown: -step * 10 };
    if (e.key in keys) {
      e.preventDefault();
      by(keys[e.key]);
    } else if (e.key === 'Home' && min !== undefined) {
      e.preventDefault();
      commit(min);
    } else if (e.key === 'End' && max !== undefined) {
      e.preventDefault();
      commit(max);
    }
  };

  const atMin = value !== null && min !== undefined && value <= min;
  const atMax = value !== null && max !== undefined && value >= max;
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

  return (
    <FieldFrame
      kit="numberStepper"
      controlId={inputId}
      label={label}
      hint={hint}
      hintTone={hintTone}
      error={error}
      marker={marker}
      markerTone={markerTone}
      labelHidden={labelHidden}
      disabled={disabled}
      lineGap={4}
      className={className}
    >
      {/* `Input/number`: 60 high, the figure and the two buttons top-aligned so a thicker line never
          moves them. */}
      <div className={cn('flex h-15 items-start', fieldLine({ disabled, error: !!error }))}>
        <div className="flex h-15 min-w-0 flex-1 items-start">
          <input
            ref={ref}
            id={inputId}
            name={name}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            role="spinbutton"
            aria-valuenow={value ?? undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldDescribedBy(inputId, { marker, hint, error, extra: unit ? unitId : undefined })}
            disabled={disabled}
            value={shown}
            onChange={onType}
            onKeyDown={onKey}
            onBlur={() => setDraft(null)}
            // The 48 / 48 line box sits 6 under the line's top: the cap ink then starts at 10.5 (the frame).
            style={{ width: `${Math.max(1, shown.length)}ch` }}
            className={cn(
              'mt-1.5 h-12 min-w-[1ch] max-w-full bg-transparent p-0',
              'text-num text-text-1 caret-accent tabular-nums',
              'rounded-none outline-none focus-visible:outline-none',
              'disabled:text-text-3',
            )}
          />
          {unit ? (
            <span id={unitId} className="ml-1 mt-7.5 text-cap text-text-2">
              {unit}
            </span>
          ) : null}
          {valid && value !== null ? (
            // "Bounds tick": 16 pt, `text-2`, 10 after the figure, centred on the buttons' 44 (y +22).
            <span aria-hidden className="ml-2.5 mt-5.5 flex size-4 items-center justify-center text-text-2 [&_svg]:size-4 [&_svg]:stroke-2">
              <Check />
            </span>
          ) : null}
        </div>
        {/* `Stepper`: 92 × 44, 8 under the line's top, the two icon buttons 4 apart. */}
        {controls ? (
        <div className="mt-2 flex shrink-0 gap-1">
          <Pressable
            variant="link"
            shape="icon"
            aria-label={decreaseLabel ?? t('common.less')}
            aria-controls={inputId}
            disabled={disabled || atMin}
            onPointerDown={keepFocus}
            onClick={() => by(-step)}
          >
            <Minus aria-hidden />
          </Pressable>
          <Pressable
            variant="link"
            shape="icon"
            aria-label={increaseLabel ?? t('common.more')}
            aria-controls={inputId}
            disabled={disabled || atMax}
            onPointerDown={keepFocus}
            onClick={() => by(step)}
          >
            <Plus aria-hidden />
          </Pressable>
        </div>
        ) : null}
      </div>
    </FieldFrame>
  );
});

import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import { Chip, ChipRow } from './ChipRow';
import { NumberStepper } from './NumberStepper';
import { WeekdayChips } from './WeekdayChips';
import { dayKeyToDate, weekdayIndexOf } from './weekdays';

/*
 * RecurrencePicker — none / daily every N / weekly weekday mask / monthly day (lane G-lifeos,
 * kit gap F.2; used by task-form and event-form).
 *
 * Source: round B `task-form` — `figma-build/lifeos/task-form.body.js`:
 *
 *   fieldGroup('Ismétlődés', RecurrencePicker, 'Minden vasárnap 20:00')
 *     label        cap-m, text-2                                  18
 *     gap                                                          4
 *     Chips/recurrence   chipRow Nincs · Naponta · Hetente · Havonta (one chosen, lime mark)   44
 *     Chips/weekdays     WeekdayChips, directly under it (gap 0) — only for Hetente            44
 *     gap                                                          4
 *     hint         cap, text-3 (the caller's summary line)        18
 *
 * The frames draw only the weekly state. Daily and monthly carry one number each (every N days,
 * day of the month), and the kit's own field for a number is `NumberStepper` — so that is what
 * stands in the weekday row's place for them, 8 under the chips (the field's own label row then
 * names the number). `none` draws only the chip row.
 *
 * The value is f_app's `Recurrence` (`src/domain/recurrence.ts`), the JSON stored on a task or
 * an event, or `null` for none. Switching the kind keeps what it can: weekly starts on the
 * anchor's weekday, monthly on the anchor's day of the month, daily on every 1 day.
 *
 * The kind chips are radios in a radiogroup (←/→ move the choice, as `Segmented`); the weekday
 * chips are checkboxes. Every word is the caller's (already translated): the kit holds no copy.
 *
 * Reference: docs/pipeline/pulse/kit/lifeos.md.
 */

/** f_app `Recurrence` (bit 0 of `weekdayMask` = Monday). `null` = does not repeat. */
export type Recurrence =
  | { type: 'daily'; interval?: number }
  | { type: 'weekly'; weekdayMask: number }
  | { type: 'monthly'; day: number };

export type RecurrenceKind = 'none' | Recurrence['type'];

export interface RecurrencePickerLabels {
  /** The four kind words, as the frame writes them: "Nincs", "Naponta", "Hetente", "Havonta". */
  none: string;
  daily: string;
  weekly: string;
  monthly: string;
  /** The daily number's field label ("every N days"). */
  interval: string;
  /** The monthly number's field label ("day of the month"). */
  monthDay: string;
  /** The accessible name of the weekday row. Default: `label`. */
  weekdays?: string;
}

export interface RecurrencePickerProps {
  /** The group label above the chips ("Ismétlődés"), cap-m text-2. */
  label: string;
  value: Recurrence | null;
  onChange: (next: Recurrence | null) => void;
  labels: RecurrencePickerLabels;
  /** `YYYY-MM-DD` — the first occurrence; seeds the weekday / the month day when the kind changes. */
  anchor?: string;
  /** The summary line under the picker ("Minden vasárnap 20:00"), cap text-3. The caller writes it. */
  hint?: string;
  /** An error under the picker instead of the hint (danger). */
  error?: string;
  /** Hide the label row (the name stays for assistive tech). */
  labelHidden?: boolean;
  /** Whole picker unavailable: 40 %. */
  disabled?: boolean;
  /** A change is being saved: the chosen kind chip shows three dots. */
  busy?: boolean;
  /** Placement only. */
  className?: string;
}

const KINDS: readonly RecurrenceKind[] = ['none', 'daily', 'weekly', 'monthly'];

/** The value a kind starts with, from the anchor day. */
export function recurrenceFor(kind: RecurrenceKind, anchor?: string, previous?: Recurrence | null): Recurrence | null {
  if (kind === 'none') return null;
  if (previous && previous.type === kind) return previous;
  const date = (anchor && dayKeyToDate(anchor)) || new Date();
  if (kind === 'daily') return { type: 'daily', interval: 1 };
  if (kind === 'weekly') return { type: 'weekly', weekdayMask: 1 << weekdayIndexOf(date) };
  return { type: 'monthly', day: date.getDate() };
}

export function RecurrencePicker({
  label,
  value,
  onChange,
  labels,
  anchor,
  hint,
  error,
  labelHidden = false,
  disabled = false,
  busy = false,
  className,
}: RecurrencePickerProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const kind: RecurrenceKind = value ? value.type : 'none';
  const chips = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (next: RecurrenceKind) => {
    if (disabled || next === kind) return;
    onChange(recurrenceFor(next, anchor, value));
  };

  // A radiogroup: the arrows move the choice and the focus with it (as `Segmented` does).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const at = KINDS.indexOf(kind);
    const to = (at + dir + KINDS.length) % KINDS.length;
    const next = KINDS[to];
    if (next === undefined) return;
    choose(next);
    chips.current[to]?.focus();
  };

  const words: Record<RecurrenceKind, string> = { none: labels.none, daily: labels.daily, weekly: labels.weekly, monthly: labels.monthly };

  return (
    <div
      data-kit="recurrencePicker"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint || error ? hintId : undefined}
      className={cn('flex flex-col gap-1', className)}
    >
      <span id={labelId} className={cn('text-cap-m', disabled ? 'text-text-3' : 'text-text-2', labelHidden && 'sr-only')}>
        {label}
      </span>
      <div className="flex flex-col">
        <div onKeyDown={onKeyDown}>
          <ChipRow label={label} role="radiogroup">
            {KINDS.map((k, i) => (
              <Chip
                key={k}
                ref={(el) => {
                  chips.current[i] = el;
                }}
                role="radio"
                selected={k === kind}
                busy={busy && k === kind}
                disabled={disabled}
                // Roving tab stop: the chosen kind is the group's one stop.
                tabIndex={k === kind ? 0 : -1}
                onClick={() => choose(k)}
              >
                {words[k]}
              </Chip>
            ))}
          </ChipRow>
        </div>
        {value?.type === 'weekly' ? (
          <WeekdayChips
            label={labels.weekdays ?? label}
            value={value.weekdayMask}
            disabled={disabled}
            // A weekly rule needs at least one day (f_app: mask > 0): the last chosen day stays.
            onChange={(mask) => onChange({ type: 'weekly', weekdayMask: mask === 0 ? value.weekdayMask : mask })}
          />
        ) : null}
        {value?.type === 'daily' ? (
          <NumberStepper
            className="mt-2"
            label={labels.interval}
            value={value.interval ?? 1}
            min={1}
            max={365}
            disabled={disabled}
            onChange={(n) => onChange({ type: 'daily', interval: n ?? 1 })}
          />
        ) : null}
        {value?.type === 'monthly' ? (
          <NumberStepper
            className="mt-2"
            label={labels.monthDay}
            value={value.day}
            min={1}
            max={31}
            disabled={disabled}
            onChange={(n) => onChange({ type: 'monthly', day: n ?? 1 })}
          />
        ) : null}
      </div>
      {error ? (
        <p id={hintId} role="alert" className="text-cap text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-cap text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

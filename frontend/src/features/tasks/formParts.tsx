import { useId, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { DateTrigger } from '../../ui/primitives/DateTrigger';
import { TimeTrigger } from '../../ui/primitives/TimeTrigger';
import type { DayKey } from '../../lib/lifeos-api';
import { addDays, fieldDay } from './tasksData';

/**
 * The pieces the two LifeOS sheets of this package share — `TaskSheet` (frame `task-form`) and
 * `CaptureSheet` (frame `capture`) — composed from the kit only.
 */

/**
 * A labelled group (round B's `fieldGroup`): the label in `cap-m` `text-2`, 4 under it the control
 * (a segmented switch, a chip row), and an optional hint 4 under that in `cap` `text-3`. The label
 * names the control for assistive tech (`labelledBy` gets its id).
 */
export function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (labelId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <span id={id} className="text-cap-m text-text-2">
        {label}
      </span>
      {children(id)}
      {hint ? <span className="text-cap text-text-3">{hint}</span> : null}
    </div>
  );
}

/** The deadline choices of both sheets: none (task-form only), today, tomorrow, a date. */
export type DueChoice = 'none' | 'today' | 'tomorrow' | 'date';

/** The day a choice means, from the logical today (a day starts at the user's day start, not at midnight). */
export function dueOnFor(choice: DueChoice, today: DayKey, date: string): DayKey | null {
  if (choice === 'today') return today;
  if (choice === 'tomorrow') return addDays(today, 1);
  if (choice === 'date') return date || null;
  return null;
}

/**
 * The deadline as a lime-marked chip row (task-form "Határidő": Nincs · Ma · Holnap · Dátum;
 * capture "Mikor?": Ma · Holnap · Dátum, with Bármikor last — see CaptureSheet). One choice, so
 * the chips are radios.
 */
export function DueChips({
  label,
  choices,
  value,
  onChange,
  words,
}: {
  label: string;
  choices: readonly DueChoice[];
  value: DueChoice;
  onChange: (next: DueChoice) => void;
  /** A word in place of the default one (capture writes "Bármikor" for no deadline). */
  words?: Partial<Record<DueChoice, string>>;
}) {
  const { t } = useTranslation();
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  // A radiogroup: one tab stop (the chosen chip); the arrows move the choice and the focus with it.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const to = (choices.indexOf(value) + dir + choices.length) % choices.length;
    const next = choices[to];
    if (next === undefined) return;
    onChange(next);
    chips.current[to]?.focus();
  };
  return (
    <div onKeyDown={onKeyDown}>
      <ChipRow role="radiogroup" label={label}>
        {choices.map((c, i) => (
          <Chip
            key={c}
            ref={(el) => {
              chips.current[i] = el;
            }}
            role="radio"
            selected={value === c}
            tabIndex={value === c ? 0 : -1}
            onClick={() => onChange(c)}
          >
            {words?.[c] ?? t(`tasks.due.${c}`)}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}

/** Below 376 pt (the gutter's own break) the two fields of a pair are about 144 wide each. */
const NARROW_QUERY = '(max-width: 375px)';
function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
const isNarrow = () => window.matchMedia(NARROW_QUERY).matches;

/**
 * The pair under the deadline (task-form "Dátum · Határidő ideje", capture "Dátum · Kezdés"): two
 * 165 pt fields 24 apart. The date field appears only for "Dátum" (drawn as its day in words with
 * the trailing chevron); the time field whenever there is a day. An empty time = due by the end of
 * the day.
 */
export function DueFields({
  date,
  onDate,
  time,
  onTime,
  showDate,
  showTime,
  timeLabel,
  min,
  dateError,
  timeError,
  timeOptional = true,
}: {
  date: string;
  onDate: (next: string) => void;
  time: string;
  onTime: (next: string) => void;
  showDate: boolean;
  showTime: boolean;
  timeLabel: string;
  /** The earliest day the picker offers (a new task: the logical today). An edited rule keeps its own first day, which may be past. */
  min?: DayKey;
  dateError?: string;
  timeError?: string;
  /** An empty time is allowed (task-form: due by the end of the day): "opcionális" stands in it. */
  timeOptional?: boolean;
}) {
  const { t } = useTranslation();
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  if (!showDate && !showTime) return null;
  return (
    <div className="flex items-start gap-6">
      {showDate ? (
        <DateTrigger
          label={t('tasks.date')}
          value={date}
          onChange={onDate}
          min={min}
          glyph="chevron"
          format={(value, locale) => fieldDay(value, locale, narrow)}
          error={dateError}
          className="w-[165px] min-w-0 shrink"
        />
      ) : null}
      {showTime ? (
        <TimeTrigger
          label={timeLabel}
          value={time}
          onChange={onTime}
          placeholder={timeOptional ? t('tasks.optional') : undefined}
          error={timeError}
          className="w-[165px] min-w-0 shrink"
        />
      ) : null}
    </div>
  );
}

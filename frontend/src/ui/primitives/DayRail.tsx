import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { dayKeyToDate, weekdayIndexOf, weekdayShort } from './weekdays';

/*
 * DayRail — a week of days to choose from, with a dot on the busy ones (lane G-lifeos, kit gap F.2;
 * used by calendar-1 / calendar-2 and the tasks list).
 *
 * Source: round B `calendar-1` — `figma-build/lifeos/calendar-1.body.js` `dayRail`:
 *
 *   the rail     354 (the content width) × 76, seven equal cells; a 1 pt hairline (white 8 %) at y 75
 *   a cell       a column, 4 from the top, items centred, 6 between:
 *                  weekday   `data` (Geist Mono 13 / 18)   today `text-1`, every other day `text-3`
 *                  date      `data-l` (Geist Mono 16 / 20, −1 %)   selected `text-1`, other `text-2`
 *                  dot       4 × 4, `text-1` under the selected day, `text-2` elsewhere; only on a busy day
 *   selection    a 2 pt INK bar the full width of the cell at y 74, on the hairline (README
 *                naptar-fokusz-kihivas, open question 1: the `segSwitch` rule — choosing a day changes
 *                the VIEW, so the mark is ink, not lime).
 *
 * A cell is a 50.6 × 76 button (above the 44 pt floor). The rail is a `radiogroup` of `radio`s: the
 * selected day is the one tab stop, ←/→ move the choice and the focus (Home / End: first / last).
 * Pressed 60 %, the lime focus ring 2 off the cell, disabled 40 %. Busy (the week's dots are being
 * read): the dots are held back and the rail says `aria-busy` — a dot never claims a day is free
 * before the answer is in.
 *
 * The accessible name of a day is its full date in the app language ("szerda, október 21."), plus
 * the caller's `busyLabel` on a busy day. The weekday words are the platform's short names: in
 * Hungarian exactly the frame's "H K Sze Cs P Szo V".
 *
 * Reference: docs/pipeline/pulse/kit/lifeos.md.
 */

export interface DayRailDay {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Something is on this day: the 4 pt dot. */
  busy?: boolean;
}

export interface DayRailProps {
  /** The accessible name of the rail ("Október 2026 · 43. hét"). */
  label: string;
  /** The days, in order — a week is seven; fewer or more share the width equally. */
  days: readonly DayRailDay[];
  /** The selected day, `YYYY-MM-DD`. */
  value: string;
  onChange: (date: string) => void;
  /** Today, `YYYY-MM-DD`: its weekday is drawn in `text-1`. */
  today?: string;
  /** Added to a busy day's accessible name ("van program"). Without it the dot is decoration. */
  busyLabel?: string;
  /** The busy dots are being read: none is drawn, `aria-busy`. */
  busy?: boolean;
  /** The rail is unavailable: 40 %. */
  disabled?: boolean;
  /** Placement only. */
  className?: string;
}

/**
 * Pressed and focus without a finger or a keyboard, for the kit specimen and the captures (the idiom
 * of `control()` and `Segment`). Nothing in the product sets the attribute.
 */
const FORCED = [
  'data-[force=pressed]:opacity-[var(--pressed-opacity)]',
  'data-[force=focus]:outline-2 data-[force=focus]:outline-solid data-[force=focus]:outline-offset-2 data-[force=focus]:outline-[var(--focus-ring)]',
].join(' ');

export function DayRail({ label, days, value, onChange, today, busyLabel, busy = false, disabled = false, className }: DayRailProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = days.findIndex((d) => d.date === value);
  const stop = selected === -1 ? 0 : selected;

  const fullDate = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' });

  const moveTo = (to: number) => {
    const day = days[to];
    if (!day || disabled) return;
    onChange(day.date);
    cells.current[to]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = days.length;
    if (!n) return;
    const map: Record<string, number> = {
      ArrowRight: (stop + 1) % n,
      ArrowDown: (stop + 1) % n,
      ArrowLeft: (stop - 1 + n) % n,
      ArrowUp: (stop - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const to = map[e.key];
    if (to === undefined) return;
    e.preventDefault();
    moveTo(to);
  };

  return (
    <div
      data-kit="dayRail"
      role="radiogroup"
      aria-label={label}
      aria-busy={busy || undefined}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn('relative flex h-[76px] w-full', disabled && 'pointer-events-none opacity-[var(--disabled-opacity)]', className)}
    >
      {days.map((day, i) => {
        const date = dayKeyToDate(day.date);
        const on = i === selected;
        const isToday = day.date === today;
        const dot = !busy && !!day.busy;
        const name = date ? fullDate.format(date) : day.date;
        return (
          <button
            key={day.date}
            ref={(el) => {
              cells.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={dot && busyLabel ? `${name}, ${busyLabel}` : name}
            aria-current={isToday ? 'date' : undefined}
            tabIndex={i === stop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(day.date)}
            className={cn(
              'relative flex h-[76px] min-w-0 flex-1 basis-0 cursor-pointer select-none flex-col items-center gap-1.5 pt-1',
              'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
              'active:opacity-[var(--pressed-opacity)]',
              'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
              FORCED,
            )}
          >
            <span aria-hidden className={cn('text-data', isToday ? 'text-text-1' : 'text-text-3')}>
              {date ? weekdayShort(weekdayIndexOf(date), locale) : ''}
            </span>
            <span aria-hidden className={cn('text-data-l', on ? 'text-text-1' : 'text-text-2')}>
              {date ? date.getDate() : ''}
            </span>
            <span aria-hidden className={cn('size-1 rounded-full', on ? 'bg-text-1' : 'bg-text-2', dot ? 'opacity-100' : 'opacity-0')} />
            {/* The ink mark: 2 pt, the cell's width, on the hairline (y 74). It ignites where it lands. */}
            <span
              aria-hidden
              data-kit-part="mark"
              className={cn(
                'pointer-events-none absolute inset-x-0 top-[74px] z-10 h-0.5 bg-text-1',
                'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                on ? 'opacity-100' : 'opacity-0',
              )}
            />
          </button>
        );
      })}
      <span aria-hidden data-kit-part="rule" className="pointer-events-none absolute inset-x-0 top-[75px] h-px bg-hair" />
    </div>
  );
}

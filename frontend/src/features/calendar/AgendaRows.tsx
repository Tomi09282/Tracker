import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Repeat } from 'lucide-react';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { cn } from '../../lib/cn';
import type { Task } from '../../lib/lifeos-api';

/**
 * The rows of the Naptár agenda — `cfk.common.js` `agendaRow`, `taskRow` and the rest-day line
 * (frames `lifeos/calendar-1`, `calendar-2`), composed of kit tokens only.
 *
 *   agenda row   64 high (10 above and below), 12 between the slots, on the gutter:
 *                a 72 pt time column (the start in mono `data` `text-1`, 2 under it the end in
 *                `text-3`; an all-day event writes "EGÉSZ NAP" in `micro` `text-2`), the title in
 *                `body-m` (+ the 14 pt repeat glyph 6 after it for a recurring event), 2 under it the
 *                sub line in `cap` `text-2` (the place, then the rule), a `micro` tag ("EDZÉS"), the
 *                16 pt chevron in `text-3` with its ink on the right edge. The whole row is the action.
 *   rest line    56 high: "—" in the time column, the sentence in `cap` `text-2`. Not an action.
 *   task row     64 high: the kit `setCheck` in its 44 slot, the title over the meta line (the due
 *                in `cap` `text-2`, the 12 pt repeat glyph and its word), the "+N" coin preview in
 *                mono `data`. The check completes / reopens; the rest of the row opens the task.
 */

const PRESS =
  'transition-opacity duration-[var(--duration-fast)] active:opacity-[var(--pressed-opacity)] motion-reduce:transition-none';

export interface AgendaRowProps {
  /** The first line of the time column ("10:00", "EGÉSZ NAP", "18:00", "—"). */
  start: string;
  /** The second line ("10:45", "~60 perc"), or nothing. */
  end?: string | null;
  /** The start is a word (all-day), not a clock figure: `micro` `text-2` instead of `data` `text-1`. */
  startIsWord?: boolean;
  title: string;
  repeat?: boolean;
  sub?: string | null;
  tag?: string;
  /** A route (an event) or an action (a workout). */
  to?: string;
  onClick?: () => void;
  /** The whole row's accessible name when the visible words are not enough. */
  label?: string;
}

export function AgendaRow({ start, end, startIsWord = false, title, repeat = false, sub, tag, to, onClick, label }: AgendaRowProps) {
  const { t } = useTranslation();
  const body = (
    <>
      <span className="flex w-[72px] shrink-0 flex-col gap-0.5">
        <span className={startIsWord ? 'text-micro text-text-2' : 'text-data text-text-1'}>{start}</span>
        {end ? <span className="text-data text-text-3">{end}</span> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-body-m text-text-1">{title}</span>
          {repeat ? (
            <>
              <Repeat aria-hidden className="size-3.5 shrink-0 text-text-2" strokeWidth={2} />
              <span className="sr-only">{t('calendar.recurring')}</span>
            </>
          ) : null}
        </span>
        {sub ? <span className="truncate text-cap text-text-2">{sub}</span> : null}
      </span>
      {tag ? <span className="shrink-0 text-micro text-text-2">{tag}</span> : null}
      <ChevronRight aria-hidden className="-me-1.25 size-4 shrink-0 text-text-3" strokeWidth={1.75} />
    </>
  );
  const cls = cn('flex min-h-16 w-full items-center gap-3 py-2.5 text-start', PRESS);
  return (
    <div className="w-full">
      {to ? (
        <Link to={to} aria-label={label} className={cls}>
          {body}
        </Link>
      ) : (
        <button // token-lint-disable: the agenda row's own action (the time column, the title block, the tag, the chevron), the kit agendaRow; ListRow's 16 pt slot gap cannot draw the frame's 12 and has no 72 pt time column
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cls}
        >
          {body}
        </button>
      )}
    </div>
  );
}

/** calendar-2's "— Pihenőnap – nincs ütemezett edzés." — a line, not an action. */
export function AgendaLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-14 w-full items-center gap-3 py-2.5">
      <span aria-hidden className="w-[72px] shrink-0 text-data text-text-3">
        —
      </span>
      <span className="min-w-0 flex-1 text-cap text-text-2">{children}</span>
    </div>
  );
}

/** "+10" — whole coins with a sign (1 coin = 100 minor). */
export function coinsLabel(minor: number): string {
  const coins = Math.trunc(minor / 100);
  return coins < 0 ? `−${Math.abs(coins)}` : `+${coins}`;
}

/** What the coin column says: a done task its award, an open one what completing it NOW pays. */
export function rowCoinsMinor(task: Task): number | null {
  if (task.completedAt !== null) return task.paidMinor;
  return task.payoutNowMinor ?? task.valueMinor;
}

export function CalendarTaskRow({
  task,
  due,
  busy = false,
  onToggle,
  onOpen,
}: {
  task: Task;
  /** The due words of this row: "Határidő 15:00", "Bármikor", or nothing. */
  due: string | null;
  busy?: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const done = task.completedAt !== null;
  const coins = rowCoinsMinor(task);
  const late = !done && task.lateNow;
  return (
    <div className={cn('flex min-h-16 w-full items-center gap-3 py-2.5', busy && 'opacity-60')} aria-busy={busy || undefined}>
      <button // token-lint-disable: the host of the kit setCheck (CheckMark is a picture; its host carries role, state, pressed 60 % and focus); Pressable's bare-glyph look would redraw the 2.5 lime tick at 1.75
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t('calendar.taskDone', { title: task.title })}
        disabled={busy}
        onClick={onToggle}
        className={cn('relative size-11 shrink-0 rounded-full', PRESS, busy && 'cursor-progress')}
      >
        <CheckMark done={done} />
      </button>
      <button // token-lint-disable: the row's own action (title + meta + coins) beside the check, as ListRow's action; two targets side by side, never one inside the other
        type="button"
        onClick={onOpen}
        disabled={busy}
        aria-haspopup="dialog"
        className={cn('flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left', PRESS)}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn('truncate text-body-m', done ? 'text-text-3' : 'text-text-1')}>{task.title}</span>
          {due || task.recurrence ? (
            <span className="flex min-w-0 items-center gap-2">
              {due ? <span className={cn('shrink-0 text-cap', late ? 'text-danger' : 'text-text-2')}>{due}</span> : null}
              {task.recurrence ? (
                <span className="flex min-w-0 items-center gap-1 text-cap text-text-2">
                  <Repeat aria-hidden className="size-3 shrink-0" strokeWidth={2} />
                  <span className="truncate">{t(`calendar.repeat.${task.recurrence.type}`)}</span>
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        {coins !== null ? <span className={cn('shrink-0 text-data', done ? 'text-text-3' : 'text-text-2')}>{coinsLabel(coins)}</span> : null}
      </button>
    </div>
  );
}

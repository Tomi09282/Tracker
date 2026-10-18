import { useTranslation } from 'react-i18next';
import { Repeat } from 'lucide-react';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { cn } from '../../lib/cn';
import type { DayKey, Task } from '../../lib/lifeos-api';
import { PRIORITY_KEY, clockOf, coinsLabel, recurrenceWord, rowCoinsMinor, shortDay } from './tasksData';

/** What the due slot of a row shows: decided by the list the row stands in. */
export type DueForm =
  /** Ma: the time, or "ma" for a task due by the end of today (tasks-1). */
  | 'today'
  /** A day list under its own day head (Közelgő): the time only. */
  | 'time'
  /** Lejárt / Bármikor / any list without a day head: the short day, then the time. */
  | 'day'
  /** A completed row: the wall clock of the completion (tasks-1 "Kész ma": "09:12"). */
  | 'completed';

/**
 * One task — the row of frame `lifeos/tasks-1` (`ma.common.js` `taskRow`): check · title over a
 * meta line (priority tag · due · repeat glyph + word) · the coin preview. 64 high (10 above and
 * below), 12 between the slots, on the gutter; the hairline between two rows is `RowStack`'s.
 *
 *   check     the kit `setCheck` in its 44 slot: the ring to do, the lime tick done. A `checkbox`:
 *             a tap completes an open task (`POST /tasks/:id/complete`) or reopens a completed
 *             one (`/reopen`, while its day is open — the server says when it is not).
 *   title     `body-m`, one line cut with an ellipsis; `text-3` once done.
 *   meta      the priority as a mono `micro` tag (FONTOS in `text-1`, the others `text-2`), the
 *             due in `cap` (`danger` when completing it now would be late), the 12 pt repeat glyph
 *             and its word for an instance of a recurring rule. Once done the tag turns `text-3`;
 *             the due and the repeat word stay `text-2`, as tasks-1 draws them.
 *   coins     "+20" in mono `data`, `text-2` (`text-3` once done): what completing it NOW pays,
 *             or what the completion paid.
 *
 * The row's own action (the title, the meta and the coins together) opens the task in the sheet.
 * Two targets side by side, never one inside the other (the `ListRow` rule for a row with a
 * control).
 */
export function TaskRow({
  task,
  today,
  due,
  busy = false,
  onToggle,
  onOpen,
}: {
  task: Task;
  today: DayKey | null;
  due: DueForm;
  busy?: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const done = task.completedAt !== null;
  const coins = rowCoinsMinor(task);
  const late = !done && task.lateNow;

  let dueText: string | null = null;
  if (due === 'completed') dueText = task.completedAt !== null ? clockOf(task.completedAt) : null;
  else if (task.dueOn !== null) {
    if (due === 'today') dueText = task.dueTime ?? (task.dueOn === today ? t('tasks.dueToday') : shortDay(task.dueOn, i18n.language));
    else if (due === 'time') dueText = task.dueTime;
    else dueText = [shortDay(task.dueOn, i18n.language), task.dueTime].filter(Boolean).join(' ');
  }

  return (
    <div data-kit="taskRow" className={cn('flex min-h-16 items-center gap-3 py-2.5', busy && 'opacity-60')} aria-busy={busy || undefined}>
      <button // token-lint-disable: the host of the kit setCheck (CheckMark is a picture, its host carries role, state, pressed 60 % and focus); Pressable's bare-glyph look sets stroke 1.75 on every svg inside and would redraw the 2.5 lime tick
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${t('tasks.tab.done')}: ${task.title}`}
        disabled={busy}
        onClick={onToggle}
        className={cn(
          'relative size-11 shrink-0 rounded-full',
          'transition-opacity duration-[var(--duration-fast)] active:opacity-[var(--pressed-opacity)] motion-reduce:transition-none',
          busy && 'cursor-progress',
        )}
      >
        <CheckMark done={done} />
      </button>

      <button // token-lint-disable: the row's own action (title + meta line + coins, as ListRow's action) beside the check; ListRow cannot draw a completed title in text-3 nor the frame's 4 pt under the title, and Pressable's link look would set cap-m on the whole row
        type="button"
        onClick={onOpen}
        disabled={busy}
        aria-haspopup="dialog"
        className={cn(
          'flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left',
          'transition-opacity duration-[var(--duration-fast)] active:opacity-[var(--pressed-opacity)] motion-reduce:transition-none',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn('truncate text-body-m', done ? 'text-text-3' : 'text-text-1')}>{task.title}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn('shrink-0 text-micro uppercase', done ? 'text-text-3' : task.priority === 3 ? 'text-text-1' : 'text-text-2')}>
              {t(`tasks.priority.${PRIORITY_KEY[task.priority]}`)}
            </span>
            {dueText ? (
              <span className={cn('shrink-0 text-cap', late ? 'text-danger' : 'text-text-2')}>{dueText}</span>
            ) : null}
            {task.recurrence ? (
              <span className="flex min-w-0 items-center gap-1 text-cap text-text-2">
                <Repeat aria-hidden className="size-3 shrink-0" strokeWidth={2} />
                <span className="truncate">{t(`tasks.repeat.${recurrenceWord(task.recurrence)}`)}</span>
              </span>
            ) : null}
          </span>
        </span>
        {coins !== null ? (
          <span className={cn('shrink-0 text-data', done ? 'text-text-3' : 'text-text-2')}>{coinsLabel(coins)}</span>
        ) : null}
      </button>
    </div>
  );
}

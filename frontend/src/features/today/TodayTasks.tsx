import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Plus, Repeat } from 'lucide-react';
import type { LifeosToday, Task } from '../../lib/lifeos-api';
import { ListRow } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Section } from '../../ui/data/SectionHeader';
import { useToast } from '../../ui/feedback/ToastHost';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { TextLink } from '../../ui/primitives/TextLink';
import { clockOf, coins, recurrenceWord, signed, taskCoinsMinor } from './model';
import { TodayEmpty } from './TodayEmpty';
import { useCompleteTask, useReopenTask } from './useTodayActions';

/**
 * FELADATOK — frames ma-1, ma-2, ma-4 (rows) and ma-3 (empty), `taskRow` of
 * `figma-build/lifeos/ma.common.js`:
 *
 *   [check 44]  12  Befizetni a villanyszámlát                 +20    the coin preview, mono, text-2
 *                   FONTOS  ma 17:00  ⟲ hetente                       priority tag (micro; FONTOS in ink)
 *                                                                     · due (cap) · recurrence (12 pt glyph + word)
 *
 * Which rows (README-ma fix round 1, "ma-1 Feladatok shows only the open tasks + Kész ma · 2 ›"):
 * the open tasks of today — the overdue ones first, their due line in `danger` — then the link to
 * the done ones. With nothing open, today's completed tasks are the rows themselves (ma-2), quiet
 * (`text-3`), "kész 12:40" as their due line. Nothing at all: the empty state (ma-3).
 *
 * TAP TO COMPLETE (f_app's TaskRow, B-habits-tasks api.md): an open task completes now (the server
 * pays it, half when late, inside the daily cap); a completed one reopens (the award reversed
 * exactly while its day is open — after that the server refuses with DAY_LOCKED and the toast says
 * it failed). The row's coin figure is the server's: what completing it now pays, or what it paid.
 *
 * "Rögzítés +" and the empty state's "+ Rögzítés" open where a task is captured: `onCapture`.
 */
export function TodayTasks({
  tasks,
  today,
  timeZone,
  onCapture,
}: {
  tasks: LifeosToday['tasks'] | null;
  today: string | null;
  timeZone: string | null;
  onCapture: CaptureDoor;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const complete = useCompleteTask();
  const reopen = useReopenTask();

  if (tasks === null) return null;

  const open = [...tasks.overdue, ...tasks.due];
  const doneToday = tasks.completedToday;
  const rows = open.length > 0 ? open : doneToday;
  const failed = () => toast(t('today.failed'), 'error');

  const tap = (task: Task) => {
    if (task.completedAt !== null) reopen.mutate(task.id, { onError: failed });
    else complete.mutate(task.id, { onError: failed });
  };
  const busyId = (complete.isPending ? complete.variables : undefined) ?? (reopen.isPending ? reopen.variables : undefined);

  const captureLink = (lead: boolean) => {
    const label = t('today.tasks.capture');
    const glyph = <Plus />;
    if ('to' in onCapture) {
      return lead ? (
        <TextLink text="body" to={onCapture.to} lead={glyph} className="self-start">
          {label}
        </TextLink>
      ) : (
        <TextLink to={onCapture.to} trail={glyph}>
          {label}
        </TextLink>
      );
    }
    return lead ? (
      <TextLink text="body" onClick={onCapture.onClick} lead={glyph} className="self-start">
        {label}
      </TextLink>
    ) : (
      <TextLink onClick={onCapture.onClick} trail={glyph}>
        {label}
      </TextLink>
    );
  };

  if (rows.length === 0) {
    return (
      <Section title={t('today.tasks.title')}>
        <TodayEmpty
          title={t('today.tasks.emptyTitle')}
          body={t('today.tasks.emptyBody')}
          action={t('today.tasks.capture')}
          {...('to' in onCapture ? { to: onCapture.to } : { onClick: onCapture.onClick })}
        />
      </Section>
    );
  }

  return (
    <Section title={t('today.tasks.title')} trailing={captureLink(false)}>
      <div className="flex flex-col gap-4">
        <RowStack>
          {rows.map((task) => (
            <TaskRow key={task.id} task={task} today={today} timeZone={timeZone} busy={busyId === task.id} onTap={() => tap(task)} />
          ))}
        </RowStack>
        {open.length > 0 && doneToday.length > 0 ? (
          <TextLink text="body" to="/tasks" trail={<ChevronRight />} className="self-start">
            {t('today.tasks.doneToday', { count: doneToday.length })}
          </TextLink>
        ) : null}
      </div>
    </Section>
  );
}

/** Where "Rögzítés" goes: a route, or a sheet the page opens. */
export type CaptureDoor = { to: string } | { onClick: () => void };

const PRIORITY = { 1: 'today.task.low', 2: 'today.task.mid', 3: 'today.task.high' } as const;
const WEEKDAY_WORD = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function TaskRow({ task, today, timeZone, busy, onTap }: { task: Task; today: string | null; timeZone: string | null; busy: boolean; onTap: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const done = task.completedAt !== null;
  const late = !done && task.dueOn !== null && today !== null && task.dueOn < today;

  let due: string | null = null;
  if (done && task.completedAt !== null) due = t('today.task.doneAt', { time: clockOf(task.completedAt, lang, timeZone) });
  else if (task.dueOn !== null && task.dueOn === today) due = task.dueTime ? t('today.task.todayAt', { time: task.dueTime }) : t('today.task.today');
  else if (task.dueOn !== null) {
    const date = new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${task.dueOn}T12:00:00Z`));
    due = task.dueTime ? `${date} ${task.dueTime}` : date;
  }

  let repeat: string | null = null;
  if (task.recurrence) {
    const word = recurrenceWord(task.recurrence);
    repeat = word.kind === 'weekday' ? t(`today.task.every.${WEEKDAY_WORD[word.index]}`) : t(`today.task.${word.kind}`);
  }

  const quiet = 'text-text-2';
  const meta: ReactNode = (
    <span className="relative top-0.5 inline-flex items-center gap-2 align-middle">
      <span className={`text-micro uppercase ${done ? 'text-text-3' : task.priority === 3 ? 'text-text-1' : 'text-text-2'}`}>
        {t(PRIORITY[task.priority])}
      </span>
      {due ? <span className={late ? 'text-danger' : quiet}>{due}</span> : null}
      {repeat ? (
        <span className={`inline-flex items-center gap-1 ${quiet}`}>
          <Repeat aria-hidden className="size-3" strokeWidth={2} />
          {repeat}
        </span>
      ) : null}
    </span>
  );

  const value = signed(coins(taskCoinsMinor(task)), lang);
  return (
    <ListRow
      lead={<CheckMark done={done} className="-mr-1" />}
      title={done ? <span className="text-text-3">{task.title}</span> : task.title}
      sub={meta}
      value={done ? <span className="text-data text-text-3">{value}</span> : value}
      onClick={onTap}
      busy={busy}
      role="checkbox"
      aria-checked={done}
    />
  );
}

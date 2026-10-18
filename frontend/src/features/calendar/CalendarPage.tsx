import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRowSkeleton } from '../../ui/data/ListRow';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { useToast } from '../../ui/feedback/ToastHost';
import { DayRail } from '../../ui/primitives/DayRail';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import type { CalendarDay, CalendarResponse, DayKey, EventOccurrence, Task } from '../../lib/lifeos-api';
import { TaskSheet, type TaskSheetTarget } from '../tasks/TaskSheet';
import { priorityValues, useTasks } from '../tasks/tasksData';
import { AgendaLine, AgendaRow, CalendarTaskRow } from './AgendaRows';
import { useCalendarWeek, useToggleCalendarTask } from './calendarApi';
import { addDays, agendaSub, deviceToday, isoWeek, mondayOf, monthYear, ruleText, shortDay, weekdayMonthDay, weekdayOf } from './calendarFormat';
import { EventSheet, type EventSheetTarget } from './EventSheet';
import { TightSection } from './TightSection';

/**
 * Naptár — the fourth tab, at `/calendar`. Frames `lifeos/calendar-1` (Wednesday 21 selected: two
 * events, the scheduled workout, two tasks) and `calendar-2` (Saturday 24: an all-day yearly event, a
 * weekly one, a dinner, the rest-day line, a weekly task under the fade), design round B (approved
 * 2026-10-18). No pill.
 *
 * ═══ THE COMPOSITION (`cfk.common.js` `calDay` on the kit) ═════════════════════════════════════
 *
 *   ScreenHeader root     "NAPTÁR", no trailing icon
 *   week line (44)        "Október 2026 · 43. hét" in `body-m` `text-2`, the ‹ › week steppers (44 each)
 *   DayRail (4 under)     seven mono cells; today's weekday `text-1`, a busy day's 4 pt dot, the 2 pt
 *                         INK mark under the chosen day (it changes the view)
 *   the day's section     "SZERDA, OKTÓBER 21." + "+ Esemény" / "+ Teendő" (text links, 16 apart); the
 *                         agenda 8 under it: all-day events, then timed events and the plan's workout
 *                         by start, then the rest-day line
 *   TEENDŐK               "N nyitott"; the day's task rows (overdue on today, due, anytime, done)
 *
 * ═══ DATA ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `GET /calendar?from=<Monday>&days=7` per week. The first week asked for is the device's; the
 * server's `today` (the user's zone) then decides the week and the chosen day — so a device clock in
 * another zone shows the right week after the first answer. The calendar pays nothing (api.md); the
 * workout row's "+30 érme" is the workout award (`workoutPointsFull`).
 *
 * Behaviour the frames do not draw, in the same language: loading (the rail's dots wait, skeleton
 * rows), a failed read (the danger line with "Újra"), a day with nothing on it (one quiet line in
 * the rest-day grammar), no tasks, a done task (dimmed, the check reopens it), an overdue task on
 * today (its due in `danger`), a multi-day event (the dash in the column on the days it continues).
 */
export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigate = useNavigate();
  const { toast } = useToast();

  // The week on screen (its Monday) and the chosen day. Null until the server says what today is.
  const [weekFrom, setWeekFrom] = useState<DayKey | null>(null);
  const [chosen, setChosen] = useState<DayKey | null>(null);
  const from = weekFrom ?? mondayOf(deviceToday());
  const week = useCalendarWeek(from);
  const data = week.data;

  // The first answer fixes the week to the server's today (the user's zone, not the device's).
  if (data && weekFrom === null) {
    setWeekFrom(mondayOf(data.today));
    setChosen(data.today);
  }

  const toggle = useToggleCalendarTask();
  const tasks = useTasks();
  const [eventTarget, setEventTarget] = useState<EventSheetTarget | null>(null);
  const [taskTarget, setTaskTarget] = useState<TaskSheetTarget | null>(null);

  const today = data?.today ?? null;
  const sel = chosen ?? today ?? deviceToday();
  const shownWeek = data;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from]);
  const byDate = useMemo(() => new Map((shownWeek?.days ?? []).map((d) => [d.date, d] as const)), [shownWeek]);
  const day = byDate.get(sel);

  const step = (dir: -1 | 1) => {
    const next = addDays(from, dir * 7);
    setWeekFrom(next);
    // The same weekday in the new week — today when the new week holds it.
    const nextSel = today && mondayOf(today) === next ? today : addDays(next, weekdayOf(sel));
    setChosen(nextSel);
  };

  const weekLabel = t('calendar.weekLine', { month: monthYear(sel, locale), week: isoWeek(from) });

  const newTask = () => {
    const logical = data?.logicalToday ?? null;
    setTaskTarget({ mode: 'new', due: logical && sel === logical ? 'today' : logical && sel === addDays(logical, 1) ? 'tomorrow' : 'date' });
  };

  return (
    <Screen top="root">
      <ScreenHeader kind="root" title={t('calendar.title')} />

      <div className="flex w-full flex-col gap-1">
        <div className="flex min-h-11 w-full items-center justify-between gap-4">
          <span className="min-w-0 truncate text-body-m text-text-2">{weekLabel}</span>
          <div className="flex shrink-0">
            <Pressable variant="link" shape="icon" aria-label={t('calendar.prevWeek')} onClick={() => step(-1)}>
              <ChevronLeft aria-hidden />
            </Pressable>
            <Pressable variant="link" shape="icon" aria-label={t('calendar.nextWeek')} onClick={() => step(1)}>
              <ChevronRight aria-hidden />
            </Pressable>
          </div>
        </div>
        <DayRail
          label={weekLabel}
          days={days.map((date) => ({ date, busy: byDate.get(date)?.busy ?? false }))}
          value={sel}
          onChange={setChosen}
          today={today ?? ''}
          busyLabel={t('calendar.busyDay')}
          busy={!shownWeek || week.isPlaceholderData}
        />
      </div>

      {week.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void week.refetch()} busy={week.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('calendar.failed')}
        </NoticeLine>
      ) : (
        <>
          <TightSection
            title={weekdayMonthDay(sel, locale)}
            trailing={
              <span className="flex items-center gap-4">
                <TextLink lead={<Plus />} aria-haspopup="dialog" onClick={() => setEventTarget({ mode: 'new', date: sel })}>
                  {t('calendar.addEvent')}
                </TextLink>
                <TextLink lead={<Plus />} aria-haspopup="dialog" disabled={!data?.logicalToday} onClick={newTask}>
                  {t('calendar.addTask')}
                </TextLink>
              </span>
            }
          >
            {!day ? (
              <RowStack as="div">
                {[0, 1, 2].map((i) => (
                  <ListRowSkeleton key={i} sub index={i} />
                ))}
              </RowStack>
            ) : (
              <Agenda day={day} data={shownWeek as CalendarResponse} onWorkout={() => void navigate('/workout')} />
            )}
          </TightSection>

          {day ? (
            <DayTasks
              day={day}
              anytime={shownWeek?.anytime ?? []}
              busyId={toggle.isPending ? (toggle.variables?.id ?? null) : null}
              onToggle={(task) =>
                toggle.mutate({ id: task.id, done: task.completedAt === null }, { onError: () => toast(t('calendar.failed'), 'error') })
              }
              onOpen={(task) => setTaskTarget({ mode: 'edit', task })}
            />
          ) : null}
        </>
      )}

      <EventSheet target={eventTarget} onClose={() => setEventTarget(null)} />
      <TaskSheet target={taskTarget} onClose={() => setTaskTarget(null)} today={data?.logicalToday ?? null} values={priorityValues(tasks.data)} />
    </Screen>
  );
}

/** The chosen day's agenda: all-day events, then the timed events and the plan's workout by start, then the rest-day line. */
function Agenda({ day, data, onWorkout }: { day: CalendarDay; data: CalendarResponse; onWorkout: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const items: { key: string; order: string; node: ReactNode }[] = [];
  for (const ev of day.events) {
    items.push({
      key: `e${ev.eventId}-${ev.occurrenceDate}`,
      order: ev.allDay ? '0' : `1${ev.startsBefore ? '00:00' : (ev.startTime ?? '')}`,
      node: <EventRow ev={ev} locale={locale} />,
    });
  }
  day.workouts.forEach((w, i) => {
    if (w.isRest) return;
    items.push({
      key: `w${w.dayId}-${i}`,
      order: w.startTime ? `1${w.startTime}` : '2',
      node: (
        <AgendaRow
          start={w.startTime ?? '—'}
          end={w.estMinutes ? t('calendar.aboutMinutes', { count: w.estMinutes }) : null}
          title={w.dayName}
          sub={[
            t('calendar.exerciseCount', { count: w.exerciseCount }),
            w.logStatus === 'completed' ? t('calendar.workoutDone') : t('calendar.coins', { coins: data.workoutPointsFull }),
          ].join(' · ')}
          tag={t('calendar.workoutTag')}
          onClick={onWorkout}
        />
      ),
    });
  });
  items.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  const rest = day.workouts.some((w) => w.isRest) && !day.workouts.some((w) => !w.isRest);
  return (
    <RowStack>
      {items.map((it) => (
        <Fragment key={it.key}>{it.node}</Fragment>
      ))}
      {rest ? <AgendaLine key="rest">{t('calendar.restDay')}</AgendaLine> : null}
      {items.length === 0 && !rest ? <AgendaLine key="none">{t('calendar.nothing')}</AgendaLine> : null}
    </RowStack>
  );
}

/** One event occurrence on the chosen day; a tap opens event-detail on that day's occurrence. */
function EventRow({ ev, locale }: { ev: EventOccurrence; locale: string }) {
  const { t } = useTranslation();
  const rule = ev.recurrence ? ruleText(ev.recurrence, ev.occurrenceDate, locale, t) : null;
  const start = ev.allDay ? t('calendar.allDay') : ev.startsBefore ? '—' : (ev.startTime ?? '—');
  const end = ev.allDay ? null : ev.endsAfter ? '—' : ev.endTime;
  return (
    <AgendaRow
      start={start}
      startIsWord={ev.allDay}
      end={end}
      title={ev.title}
      repeat={ev.recurrence !== null}
      sub={agendaSub([ev.location, rule], locale)}
      to={`/calendar/events/${ev.eventId}?on=${ev.date}`}
    />
  );
}

/** TEENDŐK — the chosen day's tasks: overdue (on today), due, anytime, then the ones done that day. */
function DayTasks({
  day,
  anytime,
  busyId,
  onToggle,
  onOpen,
}: {
  day: CalendarDay;
  anytime: Task[];
  busyId: number | null;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  const { t, i18n } = useTranslation();
  const open = [...day.tasks.overdue, ...day.tasks.due, ...anytime];
  const rows: { task: Task; due: string | null }[] = [
    ...day.tasks.overdue.map((task) => ({
      task,
      due: t('calendar.due', { when: [task.dueOn ? shortDay(task.dueOn, i18n.language) : null, task.dueTime].filter(Boolean).join(' ') }),
    })),
    ...day.tasks.due.map((task) => ({ task, due: task.dueTime ? t('calendar.due', { when: task.dueTime }) : null })),
    ...anytime.map((task) => ({ task, due: t('calendar.anytime') })),
    ...day.tasks.completed.map((task) => ({ task, due: task.dueTime ? t('calendar.due', { when: task.dueTime }) : null })),
  ];
  return (
    <TightSection title={t('calendar.tasks')} trailing={<span className="text-data text-text-2">{t('calendar.openCount', { count: open.length })}</span>}>
      {rows.length === 0 ? (
        <p className="py-2.5 text-cap text-text-2">{t('calendar.noTasks')}</p>
      ) : (
        <RowStack>
          {rows.map(({ task, due }) => (
            <CalendarTaskRow key={task.id} task={task} due={due} busy={busyId === task.id} onToggle={() => onToggle(task)} onOpen={() => onOpen(task)} />
          ))}
        </RowStack>
      )}
    </TightSection>
  );
}

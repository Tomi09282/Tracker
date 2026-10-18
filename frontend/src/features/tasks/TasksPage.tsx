import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRowSkeleton } from '../../ui/data/ListRow';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { TextLink } from '../../ui/primitives/TextLink';
import type { DayKey, Task, TasksResponse } from '../../lib/lifeos-api';
import { CaptureSheet } from '../capture/CaptureSheet';
import { TaskRow, type DueForm } from './TaskRow';
import { TaskSheet, type TaskSheetTarget } from './TaskSheet';
import type { DueChoice } from './formParts';
import {
  TASK_TABS,
  coinsLabel,
  monthDay,
  priorityValues,
  retryable,
  useTasks,
  useToggleTask,
  weekdayMonthDay,
  type TaskTab,
} from './tasksData';

/**
 * Feladatok, pushed from Ma — frame `lifeos/tasks-1` (design round B; `tasks-1.body.js`).
 *
 * Composition, as the body script: the pushed header ("‹ MA" from `app/routeMeta.ts`) and, 16
 * under it, the five tabs as the hug segmented switch (INK mark under the chosen word: a tab changes
 * the view) — one block; then 32 apart:
 *
 *   the overdue notice   (Ma, while an open task is past its day) the warning dot and
 *                        "1 lejárt teendő · −5 érme levonva", "Megnézem ›" opens Lejárt
 *   MA, OKTÓBER 19.      "Új teendő +" at the end of the head; the open tasks due today as task rows
 *   KÉSZ MA              the tasks completed today
 *   the closing line     "Késve teljesítve az érme fele jár." in `cap` `text-2`
 *
 * No pill: the add is a text link (the frame). The other tabs are the same grammar on their lists
 * (api.md `GET /tasks`): Közelgő = the next 7 days under a head per day, Lejárt = the open tasks
 * past their day, Bármikor = no deadline, Kész = the last 7 days under a head per day. Each tab's
 * first head carries "Új teendő +", so adding is one tap away everywhere (a new task from Bármikor
 * starts with no deadline, from every other tab with today).
 *
 * A row's check completes / reopens it (coins move on the server; the lists, Ma and the wallet
 * re-read). The row opens the task sheet; a recurring task opens its rule.
 *
 * Undrawn states, in the same language: loading (row skeletons under the first head), a failed
 * read (a danger line with "Újra"), a failed check (a danger line under the tabs, "Újra" when a
 * retry can help), an empty tab ("Nincs teendő", ma-3's empty words).
 *
 * `?capture=1` opens the capture sheet over the page — the way in until the Ma page mounts it at
 * its "Rögzítés +" (package S-ma).
 */
export function TasksPage() {
  const { t } = useTranslation();
  const tasks = useTasks();
  const toggle = useToggleTask();
  const [tab, setTab] = useState<TaskTab>('today');
  const [sheet, setSheet] = useState<TaskSheetTarget | null>(null);
  const [params, setParams] = useSearchParams();
  const capturing = params.get('capture') === '1';

  const data = tasks.data;
  const today = data?.today ?? null;
  const togglingId = toggle.isPending ? toggle.variables?.id : undefined;

  const openNew = (due: DueChoice) => setSheet({ mode: 'new', due });
  const openTask = (task: Task) => {
    // A recurring instance is edited as its rule: the server redraws the open instances from today.
    const rule = task.parentTaskId !== null ? data?.templates.find((x) => x.id === task.parentTaskId) : undefined;
    setSheet({ mode: 'edit', task: rule ?? task });
  };
  const row = (task: Task, due: DueForm) => (
    <TaskRow
      key={task.id}
      task={task}
      today={today}
      due={due}
      busy={togglingId === task.id}
      onToggle={() => toggle.mutate({ id: task.id, done: task.completedAt === null })}
      onOpen={() => openTask(task)}
    />
  );
  const addLink = (due: DueChoice) => (
    <TextLink trail={<Plus />} aria-haspopup="dialog" onClick={() => openNew(due)}>
      {t('tasks.add')}
    </TextLink>
  );

  return (
    <Screen top="push">
      <div className="flex flex-col gap-4">
        <ScreenHeader kind="push" title={t('tasks.title')} />
        {/* A TAB IS A FILTER, NOT A NEW SCREEN: one route, local state (R20). */}
        {/* tasks-1 draws the filter as the hug switch (words 24 apart from the gutter, the ink mark
            under the chosen word), not as equal cells. Five words in German or English are wider
            than the column, so the row scrolls sideways inside itself past the right gutter (the
            chip row's bleed) instead of cutting the last tab off; 4 above and below keep the focus
            ring inside the scroll box. */}
        <div className="-my-1 -mr-4 overflow-x-auto py-1 pr-4 [scrollbar-width:none] min-[376px]:-mr-6 min-[376px]:pr-6">
          <Segmented
            className="shrink-0"
            label={t('tasks.title')}
            value={tab}
            onChange={setTab}
            options={TASK_TABS.map((k) => ({ value: k, label: t(`tasks.tab.${k}`) }))}
          />
        </div>
      </div>

      {toggle.isError ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            retryable(toggle.error) && toggle.variables ? (
              <TextLink className="min-w-11" onClick={() => toggle.variables && toggle.mutate(toggle.variables)}>
                {t('common.retry')}
              </TextLink>
            ) : undefined
          }
        >
          {t('tasks.failed')}
        </NoticeLine>
      ) : null}

      {tasks.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void tasks.refetch()} busy={tasks.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('tasks.failed')}
        </NoticeLine>
      ) : !data ? (
        <Section title={t(`tasks.tab.${tab}`)}>
          <RowStack as="div" role="status" aria-label={t('common.loading')}>
            {[0, 1, 2].map((i) => (
              <ListRowSkeleton key={i} sub index={i} />
            ))}
          </RowStack>
        </Section>
      ) : (
        <TabBody tab={tab} data={data} row={row} addLink={addLink} onOverdue={() => setTab('overdue')} />
      )}

      <TaskSheet target={sheet} onClose={() => setSheet(null)} today={today} values={priorityValues(data)} />
      <CaptureSheet
        open={capturing}
        onClose={() => {
          const next = new URLSearchParams(params);
          next.delete('capture');
          setParams(next, { replace: true });
        }}
      />
    </Screen>
  );
}

/** Tasks under a head per day, in day order (Közelgő by due day, Kész by completion day). */
function byDay(list: readonly Task[], dayOf: (task: Task) => DayKey | null): [DayKey, Task[]][] {
  const groups = new Map<DayKey, Task[]>();
  for (const task of list) {
    const day = dayOf(task);
    if (!day) continue;
    const g = groups.get(day);
    if (g) g.push(task);
    else groups.set(day, [task]);
  }
  return [...groups.entries()];
}

function TabBody({
  tab,
  data,
  row,
  addLink,
  onOverdue,
}: {
  tab: TaskTab;
  data: TasksResponse;
  row: (task: Task, due: DueForm) => ReactNode;
  addLink: (due: DueChoice) => ReactNode;
  onOverdue: () => void;
}) {
  const { t, i18n } = useTranslation();
  const today = data.today;
  const dayHead = (day: DayKey) =>
    day === today ? t('tasks.todayHead', { date: monthDay(day, i18n.language) }) : weekdayMonthDay(day, i18n.language);
  const empty = <EmptyState title={t('tasks.emptyTitle')} body={t('tasks.emptyBody')} />;
  const lateLine = <p className="text-cap text-text-2">{t('tasks.lateRule')}</p>;

  if (tab === 'today') {
    const penalty = data.overdue.reduce((sum, task) => sum + (task.overduePenaltyMinor ?? 0), 0);
    return (
      <>
        {data.overdue.length > 0 ? (
          <NoticeLine
            tone="warn"
            action={
              <TextLink trail={<ChevronRight />} onClick={onOverdue}>
                {t('tasks.overdueOpen')}
              </TextLink>
            }
          >
            {penalty < 0
              ? t('tasks.overdueCharged', { n: data.overdue.length, coins: coinsLabel(penalty) })
              : t('tasks.overdueCount', { n: data.overdue.length })}
          </NoticeLine>
        ) : null}
        <Section title={today ? dayHead(today) : t('tasks.tab.today')} trailing={addLink('today')}>
          {data.due.length ? <RowStack>{data.due.map((task) => row(task, 'today'))}</RowStack> : empty}
        </Section>
        {data.completedToday.length ? (
          <Section title={t('tasks.doneToday')}>
            <RowStack>{data.completedToday.map((task) => row(task, 'completed'))}</RowStack>
          </Section>
        ) : null}
        {data.due.length ? lateLine : null}
      </>
    );
  }

  if (tab === 'upcoming' || tab === 'done') {
    const groups = tab === 'upcoming' ? byDay(data.upcoming, (x) => x.dueOn) : byDay(data.done, (x) => x.completedOn);
    if (!groups.length) {
      return (
        <Section title={t(`tasks.tab.${tab}`)} trailing={addLink('today')}>
          {empty}
        </Section>
      );
    }
    return (
      <>
        {groups.map(([day, list], i) => (
          <Section key={day} title={dayHead(day)} trailing={i === 0 ? addLink('today') : undefined}>
            <RowStack>{list.map((task) => row(task, tab === 'upcoming' ? 'time' : 'completed'))}</RowStack>
          </Section>
        ))}
        {tab === 'upcoming' ? lateLine : null}
      </>
    );
  }

  const list = tab === 'overdue' ? data.overdue : data.anytime;
  return (
    <>
      <Section title={t(`tasks.tab.${tab}`)} trailing={addLink(tab === 'anytime' ? 'none' : 'today')}>
        {list.length ? <RowStack>{list.map((task) => row(task, 'day'))}</RowStack> : empty}
      </Section>
      {tab === 'overdue' && list.length ? lateLine : null}
    </>
  );
}

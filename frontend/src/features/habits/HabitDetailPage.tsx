import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { LedgerRow } from '../../ui/data/LedgerRow';
import { StatBlock } from '../../ui/data/StatBlock';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { Habit, HabitDay, HabitDetailResponse } from '../../lib/lifeos-api';
import { useArchiveHabit, useHabitDetail, useHabitLog, useHabits } from './habitsApi';
import { addDays, clockOf, daysBetween, isCounted, longDay, multiplierLabel, shortDay, signedCoins, streakOf, todayOf } from './habitFormat';
import { FigUnit, FreezeLine, MultiplierLine, scheduleWord } from './HabitRow';
import { HabitSheet } from './HabitSheet';

/**
 * One habit, pushed from Szokások — frame `lifeos/habit-detail` (design round B, Figma 190:864).
 *
 * Composition, as `habit-detail.part.js` on the kit:
 *
 *   header      pushed: "‹ SZOKÁSOK", the habit's name as the title
 *   hero        SOROZAT + the giant streak figure with its unit ("31 NAP"); on the right, bottom
 *               aligned, 10 apart: the multiplier, the freezes, "Leghosszabb 45 nap"
 *   status      one cap line: today's state · the reminder · what today pays
 *   pill        "Kész mára" — the screen's one lime pill (a good habit due today, not done yet)
 *   ELMÚLT 12 HÉT  the consistency strip (12 week columns Monday..Sunday, 4 apart): lime = the live
 *               streak, text-1 45 % = done earlier, track = not done, outlined = today, the future
 *               faint; the axis (the first Monday · "ez a hét") and the legend
 *   ledger      ÉRME (net coins of the 12 weeks) and NAPOK (done / counted days), display figures
 *   ELŐZMÉNYEK  the latest settled days: the day, what happened, the coins
 *   BEÁLLÍTÁSOK Ütemezés · Emlékeztető · Érme (each opens the habit sheet) · Archiválás (danger)
 *
 * Behaviour the frame does not draw, in the same language: a done day (the status says "Kész ·
 * 07:40" and "Visszavonás" undoes it), a counted habit part-way ("5/8 pohár"; the pill fills it),
 * a bad habit (no pill: "Visszaestem" in danger behind a confirmation, "Visszavonás" takes one
 * back; no schedule rows), an archived habit (no day actions; "Visszaállítás" instead of
 * "Archiválás"), a habit not due today (no pill), loading,
 * a failed read and a habit that is not there (404: another account's habit looks the same).
 */
export function HabitDetailPage() {
  const { id: idParam } = useParams();
  const id = idParam && /^\d{1,9}$/.test(idParam) ? Number(idParam) : null;
  const { t } = useTranslation();
  const detail = useHabitDetail(id);
  // The list answers what "today" is (the detail has no day of its own); usually already cached.
  const list = useHabits();
  const notFound = id === null || (detail.error instanceof ApiError && detail.error.status === 404);

  const data = detail.data;
  return (
    <Screen top="push">
      <ScreenHeader kind="push" title={data?.habit.name ?? (notFound ? undefined : '')} />
      {notFound ? (
        // A habit that is not there and another account's habit are the same 404 (anti-IDOR): one
        // honest line in the app's "not available" form and the way back to the list — nothing to
        // retry, so no "Próbáld újra" (review S-habits, D7).
        <NoticeLine tone="danger" role="alert" action={<TextLink to="/habits">{t('habits.title')}</TextLink>}>
          {t('habits.gone')}
        </NoticeLine>
      ) : detail.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void detail.refetch()} busy={detail.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('habits.failed')}
        </NoticeLine>
      ) : !data ? (
        <DetailSkeleton />
      ) : (
        <HabitDetail data={data} today={list.data?.today ?? data.habit.log?.date ?? null} />
      )}
    </Screen>
  );
}

function HabitDetail({ data, today }: { data: HabitDetailResponse; today: string | null }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { habit } = data;
  const log = useHabitLog();
  const archive = useArchiveHabit();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [askArchive, setAskArchive] = useState(false);
  const [askRelapse, setAskRelapse] = useState(false);

  const day = todayOf(habit);
  const streak = streakOf(habit);
  const good = habit.kind === 'good';
  const live = !habit.archived;
  const failed = () => toast(t('habits.failed'), 'error');

  const writeLog = (count: number) =>
    log.mutate(good ? { kind: 'log', habitId: habit.id, count } : { kind: 'relapse', habitId: habit.id, count }, { onError: failed });

  // The status line: today's state · the reminder · what today pays.
  const status: string[] = [];
  if (good) {
    if (!habit.scheduledToday) status.push(scheduleWord(habit, t, locale));
    else if (day.done) status.push(habit.log?.doneAt ? t('habits.detail.doneAt', { time: clockOf(habit.log.doneAt, locale) }) : t('habits.outcome.done'));
    else if (day.skipped) status.push(t('habits.skipped'));
    else if (isCounted(habit) && day.count > 0) status.push(`${day.count}/${habit.targetCount}${habit.unit ? ` ${habit.unit}` : ''}`);
    else status.push(t('habits.detail.notYet'));
    if (habit.scheduleType === 'times_per_week') status.push(t('habits.weekDone', { done: habit.weekDone ?? 0, target: habit.timesPerWeek ?? 0 }));
    if (habit.reminderTime && habit.scheduledToday && !day.done) status.push(t('habits.reminderAt', { time: habit.reminderTime }));
    if (habit.scheduledToday && live) status.push(t('habits.detail.coins', { coins: signedCoins(day.done ? habit.previewMinor : habit.fullMinor, locale) }));
  } else {
    status.push(
      day.relapses > 0
        ? t('habits.relapseToday', { count: day.relapses, coins: signedCoins(habit.previewMinor, locale) })
        : t('habits.cleanFor', { count: habit.streak.current }),
    );
  }

  const canTick = good && live && habit.scheduledToday && !day.done;
  const canUndo = good && live && habit.scheduledToday && (day.done || day.count > 0);

  const history = data.days.filter((d) => d.outcome !== 'open' && d.outcome !== 'lapsed');
  // The five latest settled days, as the frame draws; the strip above holds the 12 weeks.
  const shownHistory = history.slice(0, 5);
  const percent = data.totals.scheduled > 0 ? `${Math.round((data.totals.done / data.totals.scheduled) * 100)} %` : '—';

  return (
    <>
      {/* hero: the streak, its facts on the right, the status line, the one pill */}
      <div className="flex w-full flex-col gap-6">
        <div className="flex w-full items-end justify-between gap-4">
          <StatBlock label={t('habits.detail.streak')}>
            <FigUnit
              value={streak.value}
              unit={streak.weeks ? t('habits.unitWeek') : t('habits.unitDay')}
              size="giant"
              unitClass="text-eyebrow"
              quiet={streak.value === 0}
            />
          </StatBlock>
          <div className="flex shrink-0 flex-col items-end gap-2.5">
            {habit.streak.multiplierBp > 10000 ? <MultiplierLine bp={habit.streak.multiplierBp} /> : null}
            {habit.streak.freezes > 0 ? <FreezeLine count={habit.streak.freezes} /> : null}
            <span className="text-cap text-text-2">{t('habits.detail.best', { count: habit.streak.best })}</span>
          </div>
        </div>
        <p className="text-cap text-text-2">{status.join(' · ')}</p>
        {canTick ? (
          <Pressable variant="primary" size="lg" className="w-full" busy={log.isPending} onClick={() => writeLog(habit.targetCount)}>
            {t('habits.detail.doneToday')}
          </Pressable>
        ) : null}
        {canUndo || (!good && live) ? (
          <div className="flex flex-wrap gap-6">
            {canUndo ? (
              <TextLink text="body" busy={log.isPending} onClick={() => writeLog(0)}>
                {t('common.undo')}
              </TextLink>
            ) : null}
            {!good && live ? (
              <>
                <TextLink text="body" tone="danger" aria-haspopup="dialog" onClick={() => setAskRelapse(true)}>
                  {t('habits.detail.relapse')}
                </TextLink>
                {day.relapses > 0 ? (
                  <TextLink text="body" busy={log.isPending} onClick={() => writeLog(day.relapses - 1)}>
                    {t('common.undo')}
                  </TextLink>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <Section title={t('habits.detail.weeks')} trailing={<span className="text-data text-text-1">{percent}</span>}>
        <ConsistencyStrip data={data} today={today} />
        <div className="flex w-full justify-between">
          <span className="text-micro text-text-3">{shortDay(data.from, locale)}</span>
          <span className="text-micro text-text-3">{t('habits.detail.thisWeek')}</span>
        </div>
        <div aria-hidden className="flex w-full flex-wrap items-center gap-4">
          <LegendKey swatch="bg-accent" label={t('habits.detail.keyStreak')} />
          <LegendKey swatch="bg-text-1/45" label={t('habits.detail.keyDone')} />
          <LegendKey swatch="bg-track" label={t('habits.detail.keyMissed')} />
          <LegendKey swatch="border border-text-1" label={t('habits.detail.keyToday')} />
        </div>
      </Section>

      <RowStack close>
        <LedgerRow
          label={t('habits.detail.coinsLabel')}
          note={t('habits.detail.coinsNote')}
          value={<span className="text-display text-text-1">{Math.trunc(data.totals.coinsMinor / 100).toLocaleString(locale)}</span>}
          srText={t('habits.detail.coinsSr', { coins: Math.trunc(data.totals.coinsMinor / 100) })}
        />
        <LedgerRow
          label={t('habits.detail.daysLabel')}
          note={t('habits.detail.daysNote')}
          value={
            <span className="text-display">
              <span className="text-text-1">{data.totals.done}</span>
              <span className="text-text-3">/{data.totals.scheduled}</span>
            </span>
          }
          srText={t('habits.detail.daysSr', { done: data.totals.done, count: data.totals.scheduled })}
        />
      </RowStack>

      {history.length > 0 ? (
        <Section title={t('habits.detail.history')} rule={false}>
          <RowStack>
            {shownHistory.map((d) => (
              <ListRow key={d.id} title={longDay(d.date, locale)} sub={outcomeLine(d, habit, t, locale)} value={signedCoins(d.coinsMinor, locale)} />
            ))}
          </RowStack>
        </Section>
      ) : null}

      <Section title={t('habits.detail.settings')}>
        <RowStack>
          {good ? (
            <ListRow title={t('habits.form.schedule')} value={scheduleWord(habit, t, locale)} chevron aria-haspopup="dialog" onClick={() => setSheetOpen(true)} />
          ) : null}
          {good ? (
            <ListRow title={t('habits.detail.reminder')} value={habit.reminderTime ?? '—'} chevron aria-haspopup="dialog" onClick={() => setSheetOpen(true)} />
          ) : null}
          <ListRow
            title={t('habits.detail.coinsLabel')}
            value={`+${habit.pointsSuccess} / −${habit.pointsPenalty}`}
            chevron
            aria-haspopup="dialog"
            onClick={() => setSheetOpen(true)}
          />
          {live ? (
            <ListRow title={t('habits.detail.archive')} tone="danger" aria-haspopup="dialog" onClick={() => setAskArchive(true)} />
          ) : (
            <ListRow
              title={t('habits.detail.restore')}
              busy={archive.isPending}
              onClick={() => archive.mutate({ id: habit.id, archive: false }, { onError: failed })}
            />
          )}
        </RowStack>
      </Section>

      <HabitSheet open={sheetOpen} onClose={() => setSheetOpen(false)} habit={habit} />
      <ConfirmSheet
        open={askArchive}
        onClose={() => setAskArchive(false)}
        title={t('habits.detail.archiveTitle')}
        message={t('habits.detail.archiveBody')}
        confirmLabel={t('habits.detail.archive')}
        tone="danger"
        busy={archive.isPending}
        status={archive.isError ? 'error' : 'idle'}
        onConfirm={() =>
          archive.mutate(
            { id: habit.id, archive: true },
            {
              onSuccess: () => {
                setAskArchive(false);
                navigate('/habits', { replace: true });
              },
            },
          )
        }
      />
      <ConfirmSheet
        open={askRelapse}
        onClose={() => setAskRelapse(false)}
        title={habit.name}
        message={t('habits.detail.relapseBody')}
        confirmLabel={t('habits.detail.relapseYes')}
        tone="danger"
        busy={log.isPending}
        status={log.isError ? 'error' : 'idle'}
        onConfirm={() =>
          log.mutate({ kind: 'relapse', habitId: habit.id, count: day.relapses + 1 }, { onSuccess: () => setAskRelapse(false) })
        }
      />
    </>
  );
}

/** "Kész · 21:40 · ×1,5", "Kész · ×1,5 · 30 napos bónusz · +1 fagyasztás", "Mulasztás". */
function outcomeLine(d: HabitDay, habit: Habit, t: (k: string, o?: Record<string, unknown>) => string, locale: string) {
  const parts = [t(`habits.outcome.${d.outcome}`)];
  if (d.doneAt && (d.outcome === 'done' || d.outcome === 'clean')) parts.push(clockOf(d.doneAt, locale));
  if (d.multiplierBp > 10000 && (d.outcome === 'done' || d.outcome === 'clean')) parts.push(multiplierLabel(d.multiplierBp, locale));
  if (habit.kind === 'good' && isCounted(habit) && d.outcome === 'missed' && d.count > 0) parts.push(`${d.count}/${d.targetCount}`);
  if (d.milestoneDays) parts.push(t('habits.detail.milestone', { count: d.milestoneDays }));
  if (d.freezeEarned) parts.push(t('habits.detail.freezeEarned'));
  return parts.join(' · ');
}

type Cell = 'streak' | 'done' | 'off' | 'today' | 'future';

/**
 * The 12-week strip. Column = a Monday..Sunday week from `from`, cell = a day, 4 apart, 10 tall.
 * A day is lime while it belongs to the live streak: walking back from the newest settled day, the
 * run continues through done / clean days and through days that keep a streak (skipped, frozen,
 * not scheduled) and ends at a miss, a relapse or a lapse.
 */
function ConsistencyStrip({ data, today }: { data: HabitDetailResponse; today: string | null }) {
  const { t } = useTranslation();
  const cells = useMemo(() => {
    const byDate = new Map(data.days.map((d) => [d.date, d] as const));
    const todayIndex = today ? daysBetween(data.from, today) : 84;
    const out: Cell[] = [];
    for (let i = 0; i < 84; i++) {
      const d = byDate.get(addDays(data.from, i));
      if (i === todayIndex) out.push('today');
      else if (i > todayIndex) out.push('future');
      else out.push(d && (d.outcome === 'done' || d.outcome === 'clean') ? 'done' : 'off');
    }
    if (data.habit.streak.current > 0) {
      for (let i = Math.min(todayIndex, 84) - 1; i >= 0; i--) {
        const d = byDate.get(addDays(data.from, i));
        if (d && (d.outcome === 'missed' || d.outcome === 'relapse' || d.outcome === 'lapsed')) break;
        if (out[i] === 'done') out[i] = 'streak';
      }
    }
    return out;
  }, [data, today]);

  const FILL: Record<Cell, string> = {
    streak: 'bg-accent',
    done: 'bg-text-1/45',
    off: 'bg-track',
    today: 'border border-text-1',
    future: 'bg-track opacity-30',
  };
  return (
    <div role="img" aria-label={t('habits.detail.stripSr', { done: data.totals.done, count: data.totals.scheduled })} className="flex w-full gap-1">
      {Array.from({ length: 12 }, (_, w) => (
        <div key={w} className="flex flex-1 flex-col gap-1">
          {Array.from({ length: 7 }, (_, d) => (
            <span key={d} className={cn('h-2.5 w-full rounded-bar', FILL[cells[w * 7 + d] ?? 'off'])} />
          ))}
        </div>
      ))}
    </div>
  );
}

function LegendKey({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-1.5 w-3 rounded-bar', swatch)} />
      <span className="text-micro text-text-2">{label}</span>
    </span>
  );
}

function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="flex w-full flex-col gap-section">
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-32" />
        <Skeleton className="mt-4 h-3 w-64" />
      </div>
      <Skeleton className="h-28 w-full" />
      <RowStack as="div">
        {[0, 1, 2].map((i) => (
          <ListRowSkeleton key={i} sub index={i} />
        ))}
      </RowStack>
    </div>
  );
}

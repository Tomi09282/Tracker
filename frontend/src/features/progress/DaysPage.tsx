import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Section, SectionHeader } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { StatBlock } from '../../ui/data/StatBlock';
import { Numeral } from '../../ui/data/Numeral';
import { SegmentBar, type SegmentState } from '../../ui/data/SegmentBar';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { TextLink } from '../../ui/primitives/TextLink';
import { cn } from '../../lib/cn';
import type { HabitCellState, LifeosStatsResponse } from '../../lib/lifeos-api';
import { FreezeLine, MultiplierLine } from '../habits/HabitRow';
import { useLifeosStats } from './days/daysApi';
import { DayColumns, type DayColumn } from './days/DayColumns';
import { KcalHistory } from './days/KcalHistory';
import { coinsOf, dayOfMonth, dayRange, hungarianBackVowel, shortDay, signedFigure, spokenDay } from './days/format';

/**
 * Haladás > Napok at /progress/days — frame `lifeos/progress-days` (design round B, Figma
 * 190:1321): what the days earned, week by week, how steady the habits were, and the kcal history.
 *
 * ═══ THE COMPOSITION (figma-build/lifeos/progress-days.part.js, on the kit) ═══════════════════
 *
 *   Screen top="root"            Haladás is a tab root: the root header at y 72, blocks 32 apart
 *   Header + switch              `ScreenHeader kind="root"` "Haladás" and, 8 under it, the page
 *                                switch as `Segmented layout="cells"`: Test · Napok · Fotók ·
 *                                Megosztás, Napok lit. Napok is its own route (it reads its own
 *                                API); the other three are the views of /progress, so choosing one
 *                                goes back there with that view open (replace: a switch is not a
 *                                step in the history).
 *   Hero                         `StatBlock` EZEN A HÉTEN: the giant net of the week + "érme" 12
 *                                after its ink, the caption "átlag 70 / nap · előző hét 339";
 *                                24 under it the 14 day columns (`DayColumns`)
 *   HETEK                        strong rule · 8 · eyebrow · 8 · the week rows (`ListRow`: "42.
 *                                hét", the range + one fact, the net in data-l ink on the right)
 *   SZOKÁSOK  okt. 5–17.         strong rule · 8 · eyebrow + the settled window · 8 · one row per
 *                                live habit (name, the streak figure + NAP, the multiplier, the
 *                                freezes; the 112 pt SegmentBar of the settled days, 2 apart),
 *                                closed by the strong rule · 8 · the legend
 *   KALÓRIA   cél 2200 kcal      `Section` (16 / 16) · the plot (`KcalHistory`) · 16 · the axis
 *                                (first and last settled day) · 16 · the caption, its count in warn
 *
 * No lime pill on this screen (the frame has none). Nothing is enclosed: rows on the gutter,
 * hairlines between them, the strong rule where a block opens.
 *
 * ═══ EVERY FIGURE IS THE SERVER'S ═════════════════════════════════════════════════════════════
 *
 * One GET /lifeos/stats answer carries every block, computed over the same window and after the
 * due days have settled. Nothing here is summed or guessed on the client: the week's net and
 * average, each week's perfect days and penalties, the habit cells and the kcal outcome (a dot is
 * "over" because the server says so) are read as sent.
 *
 * Undrawn states, in the same language: loading (skeletons where the blocks will stand), a failed
 * read (the danger line with "Újra"), LifeOS not started (no zone yet: the door row to "Nap és
 * időzóna"), no live habit (SZOKÁSOK is left out), no kcal data and no target (KALÓRIA is left out).
 */

type ProgressView = 'body' | 'days' | 'photos' | 'sharing';

export function DaysPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const stats = useLifeosStats();
  const arrival = useLocation().state as { switchFocus?: boolean } | null;
  const switchRef = useRef<HTMLDivElement>(null);
  // Arriving by the page switch (from Test / Fotók / Megosztás): the keyboard stays on the switch (review D3).
  useLayoutEffect(() => {
    if (arrival?.switchFocus) switchRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (view: ProgressView) => {
    if (view === 'days') return;
    navigate('/progress', { replace: true, state: { tab: view, switchFocus: true } });
  };

  const data = stats.data;

  return (
    <Screen top="root">
      <div className="flex flex-col gap-2">
        <ScreenHeader kind="root" title={t('progress.title')} />
        <div ref={switchRef}>
        <Segmented
          layout="cells"
          label={t('progress.title')}
          value={'days' as ProgressView}
          onChange={choose}
          options={[
            { value: 'body', label: t('progress.tab.body') },
            { value: 'days', label: t('progressDays.tab') },
            { value: 'photos', label: t('progress.tab.photos') },
            { value: 'sharing', label: t('progress.tab.sharing') },
          ]}
        />
        </div>
      </div>

      {stats.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void stats.refetch()} busy={stats.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('progressDays.failed')}
        </NoticeLine>
      ) : !data ? (
        <DaysSkeleton />
      ) : !data.started ? (
        // Before a zone is set LifeOS has no days: the one thing to do is to set the day.
        <RowStack>
          <ListRow title={t('settings.day.title')} to="/settings/day" chevron />
        </RowStack>
      ) : (
        <DaysContent data={data} />
      )}
    </Screen>
  );
}

/* ── THE DAYS ───────────────────────────────────────────────────────────────────────────────── */

function DaysContent({ data }: { data: LifeosStatsResponse }) {
  return (
    <>
      <Hero data={data} />
      <WeeksSince data={data} />
      {data.habits && data.habits.rows.length > 0 ? <Habits habits={data.habits} /> : null}
      {data.kcal && (data.kcal.targetKcal !== null || data.kcal.trackedDays > 0) ? <Kcal kcal={data.kcal} /> : null}
    </>
  );
}

/** A figure without a sign unless it is negative: "490", "−20". */
const plainFigure = (coins: number, locale: string) => (coins < 0 ? signedFigure(coins, locale) : coins.toLocaleString(locale));

function Hero({ data }: { data: LifeosStatsResponse }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const week = data.week;
  const days = data.days;

  // The figures over the bars, as the frame shows them: the best day, every day that lost coins,
  // and today. The other days carry their figure for a screen reader only.
  // A lapsed day (its catch-up window passed unsettled) has no figure to draw: like a day before the start, no bar (review D5).
  const nets = days.map((d) => (d.status === 'before_start' || d.status === 'future' || d.status === 'lapsed' ? null : coinsOf(d.netMinor)));
  const best = nets.reduce<number>((m, v) => (v !== null && v > m ? v : m), 0);
  const bestIndex = best > 0 ? nets.indexOf(best) : -1;
  const columns: DayColumn[] = days.map((d, i) => {
    const coins = nets[i] ?? null;
    const today = d.date === data.today;
    const figure = coins === null ? '' : signedFigure(coins, locale);
    return {
      coins,
      label: dayOfMonth(d.date),
      srText: coins === null ? spokenDay(d.date, locale) : `${spokenDay(d.date, locale)}: ${figure}`,
      today,
      showFigure: coins !== null && (today || i === bestIndex || coins < 0),
      figure,
    };
  });

  return (
    <div className="flex w-full flex-col gap-6">
      {week ? (
        <StatBlock
          label={t('progressDays.week.label')}
          caption={t('progressDays.week.caption', {
            avg: plainFigure(coinsOf(week.avgPerDayMinor), locale),
            prev: plainFigure(coinsOf(week.prevWeekNetMinor), locale),
          })}
        >
          <span className="inline-flex items-end gap-3 whitespace-nowrap">
            <Numeral size="giant" value={plainFigure(coinsOf(week.netMinor), locale)} />
            <span className="font-body text-cap normal-case tracking-normal text-text-2 [text-box:trim-both_cap_alphabetic]">{t('progressDays.coins')}</span>
          </span>
        </StatBlock>
      ) : null}
      {columns.length > 0 ? <DayColumns days={columns} label={dayRange(days[0].date, days[days.length - 1].date, locale)} /> : null}
    </div>
  );
}

/** A section whose rule, eyebrow and content stand 8 apart (the frame's `sect(…, { gap: 8 })`). */
function TightSection({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex w-full flex-col gap-2">
      <Rule strong />
      <SectionHeader rule={false} title={title} titleId={id} trailing={trailing} />
      {children}
    </section>
  );
}

/**
 * HETEK without the weeks LifeOS did not exist in: a week that ended before the start day is not a "0"
 * row (review D4). The current week always stays.
 */
function WeeksSince({ data }: { data: LifeosStatsResponse }) {
  const since = data.startedOn ?? null;
  const rows = since ? data.weeks.filter((w, i) => i === 0 || w.weekEnd >= since) : data.weeks;
  return rows.length > 0 ? <Weeks weeks={rows} /> : null;
}

function Weeks({ weeks }: { weeks: LifeosStatsResponse['weeks'] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  return (
    <TightSection title={t('progressDays.weeks.label')}>
      <RowStack>
        {weeks.map((w) => {
          // One fact after the range, as the frame writes it: the perfect days when there were
          // any, otherwise the penalties when there were any.
          const fact =
            w.perfectDays > 0
              ? t('progressDays.weeks.perfect', { count: w.perfectDays })
              : w.penalties > 0
                ? t('progressDays.weeks.penalties', { count: w.penalties })
                : null;
          const range = dayRange(w.weekStart, w.weekEnd, locale);
          return (
            <ListRow
              key={w.weekStart}
              title={t('progressDays.weeks.title', { week: w.isoWeek })}
              sub={fact ? `${range} · ${fact}` : range}
              trailing={<span className="text-data-l text-text-1">{signedFigure(coinsOf(w.netMinor), locale)}</span>}
            />
          );
        })}
      </RowStack>
    </TightSection>
  );
}

/** The light level of a settled habit day: lit = done, half = partial or frozen, off = the rest. */
const LEVEL: Record<HabitCellState, SegmentState> = {
  done: 'on',
  partial: 'half',
  frozen: 'half',
  missed: 'off',
  relapse: 'off',
  skipped: 'off',
  open: 'off',
  lapsed: 'off',
  none: 'off',
};

function Habits({ habits }: { habits: NonNullable<LifeosStatsResponse['habits']> }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const word: Record<SegmentState, string> = {
    on: t('progressDays.legend.done'),
    half: t('progressDays.legend.partial'),
    off: t('progressDays.legend.missed'),
  };
  return (
    <TightSection title={t('habits.title')} trailing={<span className="text-data text-text-2">{dayRange(habits.from, habits.to, locale)}</span>}>
      <RowStack close>
        {habits.rows.map((h) => {
          const weeks = h.scheduleType === 'times_per_week' && h.streak.weekStreak !== null;
          const streak = weeks ? (h.streak.weekStreak ?? 0) : h.streak.current;
          return (
            <div key={h.id} className="flex min-h-16 w-full items-center gap-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate text-body-m text-text-1">{h.name}</p>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-end gap-1 whitespace-nowrap">
                    <span className={cn('text-data [text-box:trim-both_cap_alphabetic]', streak === 0 ? 'text-text-3' : 'text-text-1')}>{streak}</span>
                    <span className="text-micro text-text-2 [text-box:trim-both_cap_alphabetic]">{weeks ? t('habits.unitWeek') : t('habits.unitDay')}</span>
                  </span>
                  {h.streak.multiplierBp > 10000 ? <MultiplierLine bp={h.streak.multiplierBp} /> : null}
                  {h.streak.freezes > 0 ? <FreezeLine count={h.streak.freezes} /> : null}
                </div>
              </div>
              <SegmentBar
                label={h.name}
                className="w-28 shrink-0 gap-0.5"
                segments={h.cells.map((c) => ({ state: LEVEL[c.state], srText: `${shortDay(c.date, locale)}: ${word[LEVEL[c.state]]}` }))}
              />
            </div>
          );
        })}
      </RowStack>
      <ul className="flex items-center gap-4">
        {(['on', 'half', 'off'] as const).map((level) => (
          <li key={level} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('h-1.5 w-2.5 rounded-bar', level === 'on' ? 'bg-accent' : level === 'half' ? 'bg-text-1/50' : 'bg-track')} />
            <span className="text-cap text-text-2">{word[level]}</span>
          </li>
        ))}
      </ul>
    </TightSection>
  );
}

function Kcal({ kcal }: { kcal: NonNullable<LifeosStatsResponse['kcal']> }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const first = kcal.days[0]?.date;
  const last = kcal.days[kcal.days.length - 1]?.date;
  const penalty = coinsOf(Math.abs(kcal.penaltyMinor));
  const label = kcal.targetKcal !== null ? `${t('nutrition.macro.kcal')} · ${t('progressDays.kcal.target', { kcal: kcal.targetKcal })}` : t('nutrition.macro.kcal');
  return (
    <Section
      title={t('nutrition.macro.kcal')}
      trailing={kcal.targetKcal !== null ? <span className="text-data text-text-2">{t('progressDays.kcal.target', { kcal: kcal.targetKcal })}</span> : null}
    >
      <KcalHistory days={kcal.days.map((d) => ({ date: d.date, eatenKcal: d.eatenKcal, outcome: d.outcome }))} target={kcal.targetKcal} label={label} />
      {first && last ? (
        <div aria-hidden className="relative h-[18px] w-full">
          <span className="absolute left-0 top-0 text-data text-text-3">{shortDay(first, locale)}</span>
          {/* The kit puts the last date by its INK on the line's end (310 of 354): the mono full
              stop's right bearing (~0.28 em) stands past it. */}
          <span className="absolute top-0 text-data text-text-3" style={{ right: 'calc(44px - 0.28em)' }}>
            {shortDay(last, locale)}
          </span>
        </div>
      ) : null}
      {kcal.trackedDays > 0 && kcal.targetKcal !== null ? (
        <p className="text-cap text-text-2">
          {/* Warn only when a day really was over the target; with none over the line is plain and the penalty tail goes (review D2). */}
          <span className={kcal.overDays > 0 ? 'text-warning' : undefined}>{t('progressDays.kcal.over', { n: kcal.overDays })}</span>{' '}
          {t(hungarianBackVowel(kcal.trackedDays) ? 'progressDays.kcal.ofBack' : 'progressDays.kcal.ofFront', { n: kcal.trackedDays })}
          {penalty > 0 && kcal.overDays > 0 ? ` · ${t('progressDays.kcal.perDay', { coins: signedFigure(-penalty, locale) })}` : null}
        </p>
      ) : null}
    </Section>
  );
}

/* ── LOADING ────────────────────────────────────────────────────────────────────────────────── */

/** Where the blocks will stand while GET /lifeos/stats answers: eyebrow, giant, caption, columns, rows. */
function DaysSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="flex w-full flex-col gap-8">
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-[102px] w-44" />
          <Skeleton className="h-[18px] w-44" />
        </div>
        <Skeleton className="h-[122px] w-full" />
      </div>
      <div className="flex w-full flex-col gap-2">
        <Rule strong />
        <Skeleton className="h-5 w-16" />
        <RowStack>
          {[0, 1, 2, 3].map((i) => (
            <ListRowSkeleton key={i} sub index={i} />
          ))}
        </RowStack>
      </div>
    </div>
  );
}

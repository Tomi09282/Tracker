import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Dot } from '../../ui/data/Dot';
import { Fraction, Numeral } from '../../ui/data/Numeral';
import { RowStack } from '../../ui/data/RowStack';
import { Rule } from '../../ui/data/Rule';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { SplitBar, type SplitPart } from '../../ui/data/SplitBar';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Sparkline } from '../../ui/feedback/Sparkline';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Pressable } from '../../ui/primitives/Pressable';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { hasRole, useSession } from '../auth/useSession';
import { AdminForbidden } from './AdminShell';
import { DayBars } from './DayBars';
import {
  DEFAULT_WINDOW,
  STATISTICS_WINDOWS,
  parseWindow,
  toTrend,
  toWholeCoins,
  useAdminStatistics,
  type AdminStatistics,
  type StatisticsDays,
} from './statisticsModel';

/*
 * Statisztika (`/admin/stats`) — the detail page behind "Részletek ›" on Moderáció
 * (admin-statistics-1 / -2).
 *
 * Pushed from Moderáció (back "‹ Moderáció"; the Moderáció tab stays lit), a window switch
 * 7 · 30 · 90 nap and six blocks that share one grammar: the eyebrow, a numeral (the `hero` step,
 * with a curve on its baseline where one fits), an optional proportional split bar, then hairline
 * lines — and a series line carries its own day bars. One lime shape at most: the end dot of the
 * activity curve (the error state's one pill replaces it).
 *
 * ═══ WHAT THE NUMBERS ARE NOT ══════════════════════════════════════════════════════════════════
 *
 * There is no daily-active-user number, on purpose: the product stores no last login. "Naplózó ember"
 * counts the people who logged a workout or a meal that day, and the block says so in a note. The
 * page draws counts only — no name, e-mail or id comes from `GET /admin/statistics`.
 *
 * The window is `?days=` of the URL, so a reload or a shared link keeps it; the server answers only
 * 7, 30 or 90 and the page never asks for anything else.
 */

/** A figure line: label (+ sub) on the left, the value on the right, the day bars (when it has them) under. */
function StatLine({ label, sub, value, node, bars }: { label: string; sub?: string; value?: string; node?: ReactNode; bars?: ReactNode }) {
  return (
    <div data-row-pad className="flex flex-col gap-3 py-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-body text-text-1">{label}</p>
          {sub ? <p className="text-cap text-text-3">{sub}</p> : null}
        </div>
        {node ?? <span className="shrink-0 whitespace-nowrap text-data-l text-text-1">{value}</span>}
      </div>
      {bars}
    </div>
  );
}

/** One block: the eyebrow, the hero row, the split, the lines, an optional note. */
function Block({
  title,
  figure,
  unit,
  curve,
  split,
  lines,
  note,
}: {
  title: string;
  figure: ReactNode;
  unit: string;
  curve?: ReactNode;
  split?: ReactNode;
  lines: ReactNode;
  note?: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={title} />
      <div className="flex items-end justify-between gap-4">
        <div className="flex shrink-0 flex-col gap-1.5">
          {figure}
          <p className="text-cap text-text-2">{unit}</p>
        </div>
        {curve ? <div className="mb-6 w-full min-w-0 max-w-44">{curve}</div> : null}
      </div>
      {split}
      <RowStack open>{lines}</RowStack>
      {note ? <p className="text-cap text-text-3">{note}</p> : null}
    </section>
  );
}

/** The loading state (admin-statistics-2, left): the real section labels, blocks where the figures, curves and lines will stand. */
function StatisticsSkeleton() {
  const { t } = useTranslation();
  const sections = ['users', 'activity', 'coins'] as const;
  return (
    <div role="status" className="flex flex-col gap-8">
      <span className="sr-only">{t('common.loading')}</span>
      {sections.map((key) => (
        <section key={key} className="flex flex-col gap-4">
          <SectionHeader title={t(`adminStats.section.${key}`)} />
          <div aria-hidden className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-18 w-24" />
                <Skeleton className={key === 'activity' ? 'h-3 w-38' : 'h-3 w-22'} />
              </div>
              {key === 'activity' ? <Skeleton className="mb-6 h-14 w-44" /> : null}
            </div>
            {key === 'users' ? <Skeleton className="h-1.5 w-full" /> : null}
            <RowStack open as="div">
              {[0, 1].map((i) => (
                <div key={i} data-row-pad className="flex min-h-13 items-center justify-between gap-4 py-3">
                  <Skeleton className={i === 0 ? 'h-4 w-35' : 'h-4 w-44'} />
                  <Skeleton className="h-4 w-11" />
                </div>
              ))}
            </RowStack>
          </div>
        </section>
      ))}
    </div>
  );
}

/** The six blocks, from one answer. */
function Blocks({ data }: { data: AdminStatistics }) {
  const { t, i18n } = useTranslation();
  const n = (value: number) => value.toLocaleString(i18n.language);
  const days = data.window.days;
  const span = t('adminStats.days', { count: days });
  const { users, activity, coins, marketplace, coaches, system } = data;

  const roles: SplitPart[] = [
    { label: t('admin.legend.members'), count: users.byRole.user },
    { label: t('admin.legend.coaches'), count: users.byRole.coach },
    { label: t('admin.legend.admins'), count: users.byRole.admin },
  ];
  const posts = marketplace.posts;
  const states: SplitPart[] = [
    { label: t('adminStats.market.published'), count: posts.live },
    { label: t('adminStats.market.scheduled'), count: posts.scheduled },
    { label: t('adminStats.market.draft'), count: posts.draft },
    { label: t('adminStats.market.withdrawn'), count: posts.withdrawn },
    { label: t('adminStats.market.removed'), count: posts.removed },
  ];
  const minus = '−';

  return (
    <>
      <Block
        title={t('adminStats.section.users')}
        figure={<Numeral size="hero" value={users.total} />}
        unit={t('adminStats.users.unit')}
        split={users.total > 0 ? <SplitBar legend="inline" parts={roles} label={t('adminStats.section.users')} /> : null}
        lines={
          <>
            <StatLine
              label={t('adminStats.users.signups')}
              sub={span}
              value={n(users.signups.total)}
              bars={<DayBars values={users.signups.daily.map((d) => d.n)} />}
            />
            <StatLine label={t('adminStats.users.disabled')} value={n(users.disabled)} />
          </>
        }
      />

      <Block
        title={t('adminStats.section.activity')}
        figure={<Numeral size="hero" value={activity.loggedPeople.inWindow} />}
        unit={t('adminStats.activity.people', { count: days })}
        curve={<Sparkline series={toTrend(activity.loggedPeople.daily, (d) => d.n)} width={176} height={56} tone="live" fluid />}
        lines={
          <>
            <StatLine label={t('adminStats.activity.today')} value={n(activity.loggedPeople.today)} />
            <StatLine
              label={t('adminStats.activity.workouts')}
              sub={span}
              value={n(activity.completedWorkouts.total)}
              bars={<DayBars values={activity.completedWorkouts.daily.map((d) => d.n)} />}
            />
            <StatLine
              label={t('adminStats.activity.nutrition')}
              sub={span}
              value={n(activity.nutritionLog.totalEntries)}
              bars={<DayBars values={activity.nutritionLog.daily.map((d) => d.entries)} />}
            />
          </>
        }
        note={t('adminStats.activity.note')}
      />

      <Block
        title={t('adminStats.section.coins')}
        figure={<Numeral size="hero" value={toWholeCoins(coins.movedMinor)} />}
        unit={t('adminStats.coins.moved', { count: days })}
        curve={<Sparkline series={toTrend(coins.daily, (d) => toWholeCoins(d.mintedMinor + d.spentMinor))} width={140} height={56} tone="ink" fluid />}
        lines={
          <>
            <StatLine label={t('adminStats.coins.minted')} sub={t('adminStats.coins.mintedSub')} value={`+${n(toWholeCoins(coins.mintedMinor))}`} />
            <StatLine label={t('adminStats.coins.spent')} sub={t('adminStats.coins.spentSub')} value={`${minus}${n(toWholeCoins(coins.spentMinor))}`} />
            <StatLine
              label={t('adminStats.coins.integrity')}
              sub={t('adminStats.coins.integritySub')}
              node={
                <span className="flex shrink-0 items-center gap-2 text-data-l text-text-1">
                  <Dot tone={coins.integrity.ok ? 'ink' : 'warn'} />
                  {coins.integrity.ok ? t('adminStats.coins.integrityOk') : t('adminStats.coins.integrityDrift')}
                </span>
              }
            />
          </>
        }
      />

      <Block
        title={t('adminStats.section.marketplace')}
        figure={<Numeral size="hero" value={posts.total} />}
        unit={t('adminStats.market.unit')}
        split={posts.total > 0 ? <SplitBar legend="inline" parts={states} label={t('adminStats.section.marketplace')} /> : null}
        lines={
          <>
            <StatLine label={t('adminStats.market.openReports')} value={n(marketplace.reports.open)} />
            <StatLine label={t('adminStats.market.resolved')} sub={span} value={n(marketplace.reports.resolvedInWindow)} />
          </>
        }
      />

      <Block
        title={t('adminStats.section.coaches')}
        figure={<Fraction size="hero" value={coaches.withClients} of={coaches.withRole} />}
        unit={t('adminStats.coaches.withClients')}
        lines={
          <>
            <StatLine
              label={t('adminStats.coaches.perCoach')}
              sub={t('adminStats.coaches.perCoachSub')}
              value={coaches.clientsPerCoach === null ? '—' : coaches.clientsPerCoach.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}
            />
            <StatLine label={t('adminStats.coaches.links')} value={n(coaches.activeLinks)} />
          </>
        }
      />

      <Block
        title={t('adminStats.section.system')}
        figure={<Numeral size="hero" value={system.liveSessions.people} />}
        unit={t('adminStats.system.sessions')}
        lines={<StatLine label={t('adminStats.system.audit')} sub={t('adminStats.system.auditSub')} value={n(system.auditEvents24h)} />}
      />
    </>
  );
}

export function StatisticsPage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const admin = hasRole(user, 'admin');
  const [params, setParams] = useSearchParams();
  const days = parseWindow(params.get('days'));
  const stats = useAdminStatistics(days, admin);

  // The server enforces the role on the endpoint too; this only explains the refusal.
  if (user && !admin) return <AdminForbidden />;

  const pick = (next: StatisticsDays) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev);
        if (next === DEFAULT_WINDOW) copy.delete('days');
        else copy.set('days', String(next));
        return copy;
      },
      { replace: true },
    );

  return (
    <Screen top="push" width="wide">
      {/* The switch stands 12 under the title (admin-statistics-1), not a section's 32. */}
      <div className="flex flex-col gap-3">
        <ScreenHeader kind="push" title={t('adminStats.title')} />
        <Segmented
          layout="cells"
          label={t('adminStats.window')}
          value={String(days)}
          onChange={(next) => pick(parseWindow(next))}
          options={STATISTICS_WINDOWS.map((value) => ({ value: String(value), label: t('adminStats.days', { count: value }) }))}
        />
      </div>

      {stats.data ? (
        <Blocks data={stats.data} />
      ) : stats.isPending ? (
        <StatisticsSkeleton />
      ) : (
        // Any failure — the server, the network, a refusal — is the same page: the sentence names the
        // connection, one pill, "Újra". The tab bar's offline strip says the rest.
        <div className="flex flex-col gap-6 pt-10">
          <Rule strong />
          <EmptyState
            title={t('adminStats.errorTitle')}
            body={t('adminStats.errorBody')}
            action={
              <Pressable variant="primary" size="lg" busy={stats.isFetching} onClick={() => void stats.refetch()}>
                {t('common.retry')}
              </Pressable>
            }
          />
        </div>
      )}
    </Screen>
  );
}

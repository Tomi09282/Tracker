import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Activity, UserPlus, Dumbbell, Coins } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { CountUp } from '../../ui/feedback/CountUp';
import { TrendChart, type TrendPoint } from '../../ui/feedback/TrendChart';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

interface Series {
  clock: 'local_date' | 'utc';
  daily: { day: string; people?: number; n?: number; movedMinor?: number; entries?: number }[];
}

interface Metrics {
  window: { days: number };
  loggedPeople: Series & { last30d: number; last1d: number };
  signups: Series;
  completedWorkouts: Series;
  coinVelocity: Series;
  coaches: { withRole: number; withClients: number };
}

/**
 * The admin dashboard's numbers.
 *
 * ═══ THE CARD DOES NOT SAY "DAU" ═══════════════════════════════════════════════════════════════
 *
 * The server cannot produce daily active users — there is no session table and no `last_seen_at`,
 * and adding one would mean a write on every authenticated request. What it can produce is people
 * who LOGGED something, which is a real engagement number and a smaller one. The label says that,
 * so nobody reads a lower figure as a drop in usage that never happened.
 *
 * ═══ AND THE TWO CLOCKS ARE NEVER ON ONE AXIS ══════════════════════════════════════════════════
 *
 * Activity buckets on the user's own day; signups and coin movement bucket on UTC. Each chart
 * carries its clock in the caption and they are separate charts, because a UTC bar beside a
 * local-date one quietly claims a shared day boundary — and near midnight they disagree by a day.
 */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  sub?: string;
  /** Signed change against the comparison window, or undefined when there is nothing to compare. */
  delta?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-chip bg-accent-subtle text-accent">
          <Icon size={20} strokeWidth={2} aria-hidden />
        </span>
        <span className="text-micro uppercase text-text-3">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-display text-text-1">
          <CountUp to={value} />
        </p>
        {/*
          The delta chip is ABSENT when there is nothing to compare against, rather than showing
          a green +0%. A zero delta on a window with no prior data is a claim about stability that
          the data cannot support, and it is the reassuring direction to be wrong in.
        */}
        {delta !== undefined ? (
          <span
            className={`text-micro tabular-nums rounded-chip px-1.5 ${
              delta > 0 ? 'bg-ok-subtle text-ok' : delta < 0 ? 'bg-danger-subtle text-danger' : 'bg-surface-2 text-text-3'
            }`}
          >
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        ) : null}
      </div>
      {sub ? <p className="text-caption mt-1 text-text-3">{sub}</p> : null}
      <span className="sr-only">{t('adminMetrics.cardHint')}</span>
    </div>
  );
}

const toPoints = (daily: Series['daily'], key: 'people' | 'n' | 'movedMinor'): TrendPoint[] =>
  daily.map((d) => ({ date: d.day, value: d[key] ?? 0 }));

export function AdminMetrics({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const metrics = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: () => apiWithRefresh<Metrics>('/admin/metrics?days=30'),
    enabled,
  });

  if (metrics.isPending) {
    return (
      <section className="mt-8">
        <h2 className="text-title-3 text-text-1">{t('adminMetrics.title')}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-card" />
          ))}
        </div>
      </section>
    );
  }
  if (!metrics.data) return null;
  const m = metrics.data;

  // Completed workouts have a chart and no card, deliberately: four cards fill the row, and the
  // number that changes a decision is how many PEOPLE logged, not how many sessions. The chart
  // carries the shape, which is what a volume series is read for.
  const totalSignups = m.signups.daily.reduce((a, d) => a + (d.n ?? 0), 0);
  const totalCoins = m.coinVelocity.daily.reduce((a, d) => a + (d.movedMinor ?? 0), 0);

  const charts: { key: string; series: TrendPoint[]; clock: Series['clock'] }[] = [
    { key: 'loggedPeople', series: toPoints(m.loggedPeople.daily, 'people'), clock: m.loggedPeople.clock },
    { key: 'signups', series: toPoints(m.signups.daily, 'n'), clock: m.signups.clock },
    { key: 'completedWorkouts', series: toPoints(m.completedWorkouts.daily, 'n'), clock: m.completedWorkouts.clock },
    { key: 'coinVelocity', series: toPoints(m.coinVelocity.daily, 'movedMinor'), clock: m.coinVelocity.clock },
  ];

  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2">
        <h2 className="text-title-3 text-text-1">{t('adminMetrics.title')}</h2>
        <span className="text-caption text-text-3">{t('adminMetrics.window', { days: m.window.days })}</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label={t('adminMetrics.loggedPeople')}
          value={m.loggedPeople.last30d}
          sub={t('adminMetrics.loggedPeopleSub', { today: m.loggedPeople.last1d })}
        />
        <StatCard icon={UserPlus} label={t('adminMetrics.signups')} value={totalSignups} />
        <StatCard
          icon={Dumbbell}
          label={t('adminMetrics.activeCoaches')}
          value={m.coaches.withClients}
          sub={t('adminMetrics.activeCoachesSub', { withRole: m.coaches.withRole })}
        />
        <StatCard
          icon={Coins}
          label={t('adminMetrics.coinVelocity')}
          value={totalCoins}
          sub={t('adminMetrics.coinVelocitySub')}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {/*
          A DIV, not a figure — and it was a figure for one render.

          `TrendChart` renders its own `<figure>` with its own `<figcaption>` carrying the label and
          the latest value. Wrapping it in a second figure produced nested figures and read out the
          label twice: "Naplózó emberek · saját nap" followed by "Naplózó emberek · 1". Measured in
          the browser, not reasoned about — the caption list showed both.

          So the chart owns its caption. This adds exactly one thing the chart does not know: which
          clock its days were bucketed by, which is the difference between two series that can be
          compared and two that cannot.
        */}
        {charts.map((c) => (
          <div key={c.key} className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
            <p className="text-micro uppercase text-right text-text-3">
              {t(`adminMetrics.clock.${c.clock}`)}
            </p>
            {/* TrendChart refuses to draw fewer than three points and says so — a two-point line is
                a slope with no evidence behind it. */}
            <TrendChart
              series={c.series}
              unit=""
              label={t(`adminMetrics.${c.key}`)}
              emptyKey="adminMetrics.notEnough"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

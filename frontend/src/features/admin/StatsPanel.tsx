import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UseQueryResult } from '@tanstack/react-query';
import { Numeral } from '../../ui/data/Numeral';
import { ListRow } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Rule } from '../../ui/data/Rule';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Sparkline } from '../../ui/feedback/Sparkline';
import { TextLink } from '../../ui/primitives/TextLink';
import { toTrend, type AdminStats } from './statisticsModel';

/**
 * A translated sentence with some of its figures in ink.
 *
 * The figures are interpolated as markers and the sentence is cut around them, so the words stay
 * the bundle's (in every language, in its own order) and only the figures change colour — "3
 * várakozik", "9 ma" (admin-moderation-v2: the figure in ink, the word in text-2).
 */
export function inked(
  sentence: (marks: Record<string, string>) => string,
  figures: Record<string, string>,
  figureClass = 'text-text-1',
): ReactNode[] {
  const names = Object.keys(figures);
  const marks = Object.fromEntries(names.map((name, i) => [name, `\u0001${i}\u0001`]));
  return sentence(marks)
    .split(/\u0001(\d+)\u0001/)
    .map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} className={figureClass}>
          {figures[names[Number(part)]]}
        </span>
      ) : (
        part
      ),
    );
}

/** One of the six: a figure at the `stat` step over its caption (mono micro, upper case, at most two lines). */
function Cell({ figure, caption }: { figure: ReactNode; caption: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-2.5">
      {figure}
      <p className="whitespace-pre-line text-micro text-text-2">{caption}</p>
    </li>
  );
}

/** Where the six figures and the curve will stand while `GET /admin/stats` loads. */
function PanelSkeleton() {
  const { t } = useTranslation();
  const cell = (key: number) => (
    <li key={key} className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-11 w-14" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    </li>
  );
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{t('common.loading')}</span>
      <div aria-hidden className="flex flex-col gap-6">
        <ul className="grid grid-cols-3 gap-x-2 gap-y-6">{[0, 1, 2].map(cell)}</ul>
        <Rule />
        <ul className="grid grid-cols-3 gap-x-2 gap-y-6">{[3, 4, 5].map(cell)}</ul>
      </div>
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-4 w-45" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

/**
 * STATISZTIKA — the compact panel at the top of Moderáció (`admin-moderation-v2`).
 *
 * Six figures in a quiet 3 x 2 grid (no boxes, one hairline between the two rows), the 30-day curve
 * of the people who logged something, and the doors: "Részletek ›" to the Statistics page and
 * "Szabályok ›" to the point rules, in ONE closed stack. All of it from ONE read, the additive
 * `panel` of `GET /admin/stats`.
 *
 * ═══ THE NUMBERS ARE THE SERVER'S, WORD FOR WORD ═══════════════════════════════════════════════
 *
 * "Aktív edző" is `panel.activeCoaches` (the coach ROLE with a live client — not the metrics'
 * `withClients`), "Várakozó moderáció" is `panel.moderationPending` (exactly what the queue lists,
 * orphans left out), "Edzés ma / 7 nap" is completed workouts. The end of the curve is the one lime
 * shape of the screen: the last reading IS today's figure. A figure that failed to arrive is not
 * drawn as 0: the whole panel falls back to one line with "Újra", and the doors stay.
 */
export function StatsPanel({ stats }: { stats: UseQueryResult<AdminStats> }) {
  const { t, i18n } = useTranslation();
  const panel = stats.data?.panel;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="admin-stats-panel" className="flex flex-col gap-6">
        <SectionHeader title={t('adminStats.title')} titleId="admin-stats-panel" />
        {stats.isPending ? (
          <PanelSkeleton />
        ) : !panel ? (
          <NoticeLine
            tone="danger"
            role="alert"
            action={
              <TextLink busy={stats.isFetching} onClick={() => void stats.refetch()}>
                {t('common.retry')}
              </TextLink>
            }
          >
            {t('adminStats.errorTitle')}
          </NoticeLine>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <ul className="grid grid-cols-3 gap-x-2">
                <Cell figure={<Numeral size="stat" value={panel.users.total} mode="roll" from={0} />} caption={t('adminStats.panel.users')} />
                <Cell figure={<Numeral size="stat" value={panel.users.new7d} />} caption={t('adminStats.panel.new7d')} />
                <Cell figure={<Numeral size="stat" value={panel.activeCoaches} />} caption={t('adminStats.panel.activeCoaches')} />
              </ul>
              <Rule />
              <ul className="grid grid-cols-3 gap-x-2">
                <Cell
                  figure={
                    <span className="flex items-baseline gap-2">
                      <Numeral size="stat" value={panel.workouts.today} />
                      <span className="text-data-l leading-none text-text-2">/ {panel.workouts.last7d.toLocaleString(i18n.language)}</span>
                    </span>
                  }
                  caption={t('adminStats.panel.workouts')}
                />
                <Cell figure={<Numeral size="stat" value={panel.moderationPending} />} caption={t('adminStats.panel.pending')} />
                <Cell figure={<Numeral size="stat" value={panel.openReports} />} caption={t('adminStats.panel.openReports')} />
              </ul>
            </div>
            <figure className="-mt-2 flex flex-col gap-2.5">
              <figcaption className="flex items-baseline justify-between gap-4 text-cap text-text-2">
                <span>{t('adminStats.panel.curve', { count: panel.loggedPeople.daily.length })}</span>
                <span>
                  {inked(
                    (m) => t('adminStats.panel.curveToday', { count: panel.loggedPeople.today, replace: { count: m.count } }),
                    { count: String(panel.loggedPeople.today) },
                    'text-data-l text-text-1',
                  )}
                </span>
              </figcaption>
              <Sparkline series={toTrend(panel.loggedPeople.daily, (d) => d.n)} width={354} height={56} tone="live" fluid />
            </figure>
          </>
        )}
      </section>

      {/* The doors, one closed stack (admin-moderation-v2). They stand when the figures fail. */}
      <RowStack open close>
        <ListRow title={t('adminStats.details')} sub={t('adminStats.detailsSub')} to="/admin/stats" chevron />
        <ListRow title={t('adminRules.title')} to="/admin/rules" chevron />
      </RowStack>
    </div>
  );
}

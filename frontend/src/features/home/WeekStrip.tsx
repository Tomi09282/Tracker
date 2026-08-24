import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Dumbbell } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { Gauge } from '../../ui/feedback/Gauge';
import { CountUp } from '../../ui/feedback/CountUp';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

interface Occurrence {
  date: string;
  day_id: number;
  day_name: string;
  is_rest: 0 | 1;
  start_time: string | null;
  exercise_count: number;
  plan_name: string;
  moved?: boolean;
  log_id: number | null;
  log_status: string | null;
}

/** Monday-first, because a training week is a training week. */
function mondayOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * The week panel — Home's anchor ([[55-Screens/01 Home]]).
 *
 * ═══ ONE OBJECT, NOT TWO STACKED SECTIONS ══════════════════════════════════════════════════════
 *
 * The ring and the seven-cell row live inside the SAME panel: the ring is the claim ("two of five
 * this week") and the row is the evidence for it. Stacked as two sections they read as two
 * unrelated readouts, which is what the previous layout did.
 *
 * ═══ WHAT THIS LOST, AND WHY ═══════════════════════════════════════════════════════════════════
 *
 * The `‹ ›` pager, the date range sub-header and the day NUMBERS are gone. The strip is *this
 * week*, full stop — a client standing in the gym does not browse to March, and the history screen
 * owns that journey properly. Losing the numbers is what let seven cells fit inside the panel
 * instead of needing a section of their own.
 *
 * ═══ THE DENOMINATOR IS NOT A CONSTANT ═════════════════════════════════════════════════════════
 *
 * It is the number of days this week the plan actually prescribes a session for, counted from the
 * SERVER's window response. A client on a three-day plan sees `2 / 3`. Hardcoding five would be a
 * ring that lies to two thirds of the userbase.
 *
 * The dates still come from the server rather than being generated here. The schedule is
 * `starts_on + k*cycle_days + day_index` with skip and move exceptions layered on it, and a second
 * implementation of that in the browser is a second implementation that will disagree.
 */
export function WeekStrip({ today }: { today: string }) {
  const { t, i18n } = useTranslation();
  const weekStart = useMemo(() => mondayOf(today), [today]);

  const week = useQuery({
    queryKey: ['week', weekStart],
    queryFn: () =>
      apiWithRefresh<{ occurrences: Occurrence[] }>(`/my-plans/week?from=${weekStart}&days=7`),
  });

  const byDate = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of week.data?.occurrences ?? []) {
      map.set(o.date, [...(map.get(o.date) ?? []), o]);
    }
    return map;
  }, [week.data]);

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // A day counts once, however many occurrences sit on it: the ring counts SESSIONS DONE against
  // sessions prescribed, and a day with two blocks on it is still one training day.
  const planned = dates.filter((d) => (byDate.get(d) ?? []).some((o) => !o.is_rest)).length;
  const trainedCount = dates.filter((d) => (byDate.get(d) ?? []).some((o) => o.log_id != null)).length;

  const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });

  return (
    <Surface as="section" aria-labelledby="week-heading" className="flex flex-col gap-group">
      <div className="flex flex-col items-center gap-tight">
        {week.isPending ? (
          <Skeleton className="size-40 rounded-chip" />
        ) : week.isError ? (
          // The frame stays and the ring is simply absent. A client who cannot be told how their
          // week is going needs a way to ask again, not a red card where the number should be.
          <div className="grid size-40 place-items-center">
            <Pressable onClick={() => void week.refetch()}>{t('common.retry')}</Pressable>
          </div>
        ) : (
          <Gauge
            className="size-40"
            label={t('nav.workout')}
            value={planned > 0 ? trainedCount / planned : 0}
          >
            <p className="text-display font-display text-text-1">
              <CountUp to={trainedCount} />
              <span className="text-title-2 tabular-nums text-text-3"> / {planned}</span>
            </p>
          </Gauge>
        )}

        {/* A caption, and the panel's accessible name. It renders in every state so the section
            never loses its heading while the numbers are in flight. */}
        <h2 id="week-heading" className="text-micro font-body uppercase text-text-3">
          {t('nav.workout')}
        </h2>
      </div>

      {week.isPending ? (
        <Skeleton className="h-14 w-full rounded-field" />
      ) : week.isError ? (
        // Seven empty bordered cells read as a rendering failure, which is exactly what this is —
        // so the evidence row is absent rather than blank, and the retry above speaks for both.
        null
      ) : (
        // Display-only: these cells are EVIDENCE, not navigation. Making them tappable would put
        // seven 44px targets under the anchor for a journey the history screen already owns.
        <ol className="grid grid-cols-7 gap-1">
          {dates.map((date) => {
            const items = byDate.get(date) ?? [];
            const isToday = date === today;
            const trained = items.some((o) => o.log_id != null);
            const scheduled = items.some((o) => !o.is_rest);
            return (
              <li key={date}>
                <div
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-tight p-1',
                    'rounded-field border-[length:var(--border-width)]',
                    isToday
                      ? 'border-[var(--accent)] bg-accent-subtle'
                      : 'border-[var(--surface-border)]',
                    trained && !isToday && 'bg-success-subtle',
                  )}
                >
                  <span className="text-micro uppercase text-text-3">
                    {dayLabel.format(new Date(`${date}T00:00:00Z`))}
                  </span>
                  {/* ONE glyph, in strict priority: done beats scheduled beats blank. A rest day
                      and a free day both read as blank here — the cell says whether training
                      happened, and a moon in a seven-cell row at this size is noise. */}
                  {trained ? (
                    <CheckCircle2 className="size-icon-s text-success" aria-hidden />
                  ) : scheduled ? (
                    <Dumbbell className="size-icon-s text-accent" aria-hidden />
                  ) : (
                    <span className="size-icon-s" aria-hidden />
                  )}
                  <span className="sr-only">
                    {items.length
                      ? items.map((o) => o.day_name).join(', ')
                      : t('home.nothingScheduled')}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Surface>
  );
}

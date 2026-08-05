import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Moon, CheckCircle2, Dumbbell } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
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
 * The week strip — blueprint 2's calendar row.
 *
 * The dates come from the SERVER's window endpoint rather than being generated here. The schedule
 * is `starts_on + k*cycle_days + day_index` with skip and move exceptions layered on it, and a
 * second implementation of that in the browser is a second implementation that will disagree —
 * which is exactly what happened when the rule existed twice on the server.
 */
export function WeekStrip({ today }: { today: string }) {
  const { t, i18n } = useTranslation();
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));

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

  const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const rangeLabel = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' });

  return (
    <section aria-labelledby="week-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="week-heading" className="text-label uppercase tracking-wide text-text-2">
          {rangeLabel.format(new Date(`${weekStart}T00:00:00Z`))} –{' '}
          {rangeLabel.format(new Date(`${addDays(weekStart, 6)}T00:00:00Z`))}
        </h2>
        <div className="flex gap-1">
          <Pressable
            shape="icon"
            variant="ghost"
            aria-label={t('home.prevWeek')}
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            <ChevronLeft className="size-icon-s" aria-hidden />
          </Pressable>
          <Pressable
            shape="icon"
            variant="ghost"
            aria-label={t('home.nextWeek')}
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            <ChevronRight className="size-icon-s" aria-hidden />
          </Pressable>
        </div>
      </div>

      {week.isPending ? (
        <Skeleton className="h-20 w-full rounded-card" />
      ) : (
        <ol className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => {
            const date = addDays(weekStart, i);
            const items = byDate.get(date) ?? [];
            const isToday = date === today;
            const trained = items.some((o) => o.log_id != null);
            const rest = items.length > 0 && items.every((o) => o.is_rest);
            return (
              <li key={date}>
                <div
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-card border p-1',
                    isToday ? 'border-[var(--accent)] bg-accent-subtle' : 'border-[var(--surface-border)]',
                    trained && !isToday && 'bg-success/10',
                  )}
                >
                  <span className="text-micro uppercase text-text-3">{dayLabel.format(new Date(`${date}T00:00:00Z`))}</span>
                  <span className="text-body-s tabular-nums">{Number(date.slice(8))}</span>
                  {/* One glyph per day, in priority order: done beats rest beats scheduled. An empty
                      day stays empty rather than getting a placeholder dot — nothing scheduled is
                      information too. */}
                  {trained ? (
                    <CheckCircle2 className="size-icon-s text-success" aria-hidden />
                  ) : rest ? (
                    <Moon className="size-icon-s text-text-3" aria-hidden />
                  ) : items.length ? (
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
    </section>
  );
}

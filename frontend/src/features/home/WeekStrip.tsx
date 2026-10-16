import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import { Fraction, Numeral } from '../../ui/data/Numeral';
import { SegmentBar, type Segment } from '../../ui/data/SegmentBar';
import { StatBlock } from '../../ui/data/StatBlock';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pic } from '../../ui/media/Pic';
import { TextLink } from '../../ui/primitives/TextLink';

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
 * The week, as Home's hero — frames `home-1` / `home-2` ("Hero stage").
 *
 * ═══ THE COMPOSITION OF THE FRAME ══════════════════════════════════════════════════════════════
 *
 * One column, 20 between its two parts, exactly as `home-1.body.js` builds it:
 *
 *   StatBlock   "HETI EDZÉS" eyebrow -> 8 -> the giant fraction "2 / 4" on the gutter (ink-tight)
 *   SegmentBar  seven 6 pt segments 8 apart, the mono weekday under each, today's dot
 *
 * and the fist (`hero-grip`, 216 pt) glowing out of the black behind them: absolute, pinned to the
 * column's right end and its top, 24 above the eyebrow and 41 past the right gutter — so it runs
 * 17 pt off the screen edge and is cut there by the scaffold's clip. The numerals end at x 194 and
 * the image's lit part starts at 203: no text sits on it. The two text parts are `relative` so they
 * paint above the picture, as the frame paints them (the image is its first layer).
 *
 * ═══ WHAT EACH SEGMENT SAYS ════════════════════════════════════════════════════════════════════
 *
 * The light levels of Pulse, one per day in strict priority: trained = lit (`on`), scheduled and
 * not yet trained = pending (`half`), a rest day or a free day = off. Today carries the ink label
 * and the dot. Display-only — no pager, no day numbers, nothing to tap.
 *
 * ═══ THE DENOMINATOR IS NOT A CONSTANT ═════════════════════════════════════════════════════════
 *
 * It is the number of days this week the plan actually prescribes a session for, counted from the
 * SERVER's window response. A client on a three-day plan sees `2 / 3`. The dates come from the
 * server too: the schedule is `starts_on + k*cycle_days + day_index` with skip and move exceptions
 * layered on it, and a second implementation of that in the browser would disagree with it.
 *
 * ═══ A FAILED READ PRINTS A DASH, NEVER A ZERO ═════════════════════════════════════════════════
 *
 * "0 / 4" would be a claim about the week; the week is unknown. The figure becomes "—" in the
 * pending ink and "Újra" takes the bar's place. The today list under it does not depend on this
 * query and stays.
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

  // A day counts once, however many occurrences sit on it: the figure counts SESSIONS DONE against
  // sessions prescribed, and a day with two blocks on it is still one training day.
  const planned = dates.filter((d) => (byDate.get(d) ?? []).some((o) => !o.is_rest)).length;
  const trainedCount = dates.filter((d) => (byDate.get(d) ?? []).some((o) => o.log_id != null)).length;

  const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const dayName = new Intl.DateTimeFormat(i18n.language, { weekday: 'long' });

  const weekLabel = t('home.weeklyWorkouts');

  const segments: Segment[] = dates.map((date) => {
    const items = byDate.get(date) ?? [];
    const when = new Date(`${date}T00:00:00Z`);
    const trained = items.some((o) => o.log_id != null);
    const scheduled = items.some((o) => !o.is_rest);
    return {
      state: trained ? 'on' : scheduled ? 'half' : 'off',
      label: dayLabel.format(when),
      today: date === today,
      // The letter alone says nothing to a screen reader; the day and what it holds do.
      srText: `${dayName.format(when)}: ${
        items.length ? items.map((o) => o.day_name).join(', ') : t('home.nothingScheduled')
      }`,
    };
  });

  return (
    <div className="relative flex flex-col gap-5">
      {/* The hero image is withheld while the week loads: a skeleton never draws a picture. */}
      {week.isPending ? null : (
        <Pic slot="hero-grip" width={216} priority bleed className="absolute -right-[41px] -top-6" />
      )}

      <StatBlock label={weekLabel} className="relative">
        {week.isPending ? (
          // One block at the numeral's cap height, as wide as "2 / 4" — never a spinner.
          <Skeleton className="h-[99px] w-[170px]" />
        ) : week.isError ? (
          <Numeral size="giant" tone="pending" value="—" />
        ) : (
          <Fraction size="giant" value={trainedCount} of={planned} mode="roll" />
        )}
      </StatBlock>

      {week.isPending ? (
        <Skeleton className="relative h-1.5 w-full" />
      ) : week.isError ? (
        <TextLink text="body" className="relative self-start" onClick={() => void week.refetch()}>
          {t('common.retry')}
        </TextLink>
      ) : (
        <SegmentBar label={weekLabel} segments={segments} className="relative" />
      )}
    </div>
  );
}

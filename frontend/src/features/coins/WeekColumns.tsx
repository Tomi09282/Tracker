import { cn } from '../../lib/cn';
import { signed } from './statement';

/**
 * THIS WEEK AS DAY COLUMNS — coins-1v2 "Chart/this week · coins per day" (design round B,
 * `figma-build/lifeos/c.common.js` `dayCols`). Not a kit component: the frame composes it on the
 * page from rects and mono figures, and so does this file.
 *
 *          +157                         a mono figure 4 over each bar (text-2; today text-1)
 *   +93     ▌      +57                  8 pt bars, square-ended to 1 pt: ink above the baseline,
 *    ▌  +68 ▌       ▌  +40              text-3 below it (a day that lost coins), lime for TODAY —
 *  ──▌───▌──▌───▌───▌───▌──             the screen's one live datum; the baseline is the strong hairline
 *    H   K SZE  CS  P  SZO  V           the mono weekday (text-3; today text-1) 8 under the lowest bar
 *                           ·           and the 4 pt today dot 2 under the weekday
 *
 * The scale is the frame's: 72 pt cover the week's largest gain plus its largest loss; the
 * baseline stands 24 + (gain share) under the top, so the tallest bar's figure fits above it.
 * A day after today has no bar and no figure (the server says `future`), only its weekday.
 */
export interface WeekColumn {
  /** Whole coins, or null for a day that has not happened yet. */
  coins: number | null;
  /** The drawn weekday ("H", "SZE"). */
  label: string;
  /** What a screen reader says for the day ("hétfő"). */
  name: string;
  today: boolean;
}

/** The frame's constants (`dayCols`): bar zone, headroom for the figure, bar width. */
const ZONE = 72;
const HEAD = 24;
const BAR = 8;
/** Under the lowest point: 8 → the weekday's 18 pt line → 8. */
const FOOT = 8 + 18 + 8;

export function WeekColumns({ days, label }: { days: readonly WeekColumn[]; label: string }) {
  const values = days.map((d) => d.coins ?? 0);
  const gain = Math.max(1, ...values);
  const loss = Math.max(0, ...values.map((v) => -v));
  const k = ZONE / (gain + loss);
  const base = HEAD + Math.round(gain * k);
  const below = Math.round(loss * k);
  const n = days.length;

  return (
    <ul aria-label={label} className="relative w-full" style={{ height: base + below + FOOT }}>
      {/* The baseline: the strong hairline across the whole width. */}
      <li aria-hidden className="absolute inset-x-0 h-px bg-hair-strong" style={{ top: base }} />
      {days.map((day, i) => {
        const centre = `${((i + 0.5) / n) * 100}%`;
        const v = day.coins;
        const h = v === null ? 0 : Math.max(2, Math.round(Math.abs(v) * k));
        const top = v === null ? base : v >= 0 ? base - h : base + 1;
        // The figure stands 4 over the bar's top — over the baseline for a loss.
        const figureTop = (v === null ? base : v >= 0 ? base - h : base) - 4 - 18;
        return (
          <li key={i} className="contents">
            <span className="sr-only">{v === null ? day.name : `${day.name}: ${signed(v)}`}</span>
            {v === null ? null : (
              <>
                <span
                  aria-hidden
                  className={cn('absolute rounded-bar', day.today ? 'bg-accent' : v < 0 ? 'bg-text-3' : 'bg-text-1')}
                  style={{ left: `calc(${centre} - ${BAR / 2}px)`, top, width: BAR, height: h }}
                />
                <span
                  aria-hidden
                  className={cn('absolute -translate-x-1/2 whitespace-nowrap text-data', day.today ? 'text-text-1' : 'text-text-2')}
                  style={{ left: centre, top: figureTop }}
                >
                  {signed(v)}
                </span>
              </>
            )}
            <span
              aria-hidden
              className={cn('absolute -translate-x-1/2 text-data uppercase', day.today ? 'text-text-1' : 'text-text-3')}
              style={{ left: centre, top: base + below + 8 }}
            >
              {day.label}
            </span>
            {day.today ? (
              <span aria-hidden className="absolute size-1 -translate-x-1/2 rounded-full bg-text-1" style={{ left: centre, top: base + below + 28 }} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

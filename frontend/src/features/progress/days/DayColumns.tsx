import { cn } from '../../../lib/cn';

/**
 * THE 14 DAYS AS COLUMNS — progress-days "Chart/14 days · coins per day" (design round B,
 * `figma-build/lifeos/c.common.js` `dayCols` with { bw: 6, h: 64, show: [...] }). Not a kit
 * component: the frame composes it on the page from rects and mono figures, as coins' own
 * `WeekColumns` does for seven days, and so does this file.
 *
 *                                 +157            a mono figure 4 over a bar (text-2; today text-1),
 *                     ▌            ▌        +40   only on the days that carry the story: the best
 *        ▌  −20   ▌   ▌   ▌    ▌   ▌   ▌     ▌    day, a day that lost coins, and today
 *   ─────▌───▄────▌───▌───▌────▌───▌───▌─────▌──  6 pt bars square-ended to 1 pt: ink above the
 *        5   6    7   8   9   10  …  17    18     baseline, text-3 below it (a day that lost coins),
 *                                          ·      lime for TODAY (the screen's one live datum)
 *
 * The scale is the frame's: 64 pt cover the window's largest gain plus its largest loss; the
 * baseline stands 24 + (the gain's share) under the top so the tallest figure fits above it. The
 * day of the month stands 8 under the lowest point (text-3; today text-1), the 4 pt today dot 2
 * under its line. A day before LifeOS started, or after today, has no bar and no figure.
 */
export interface DayColumn {
  /** Whole coins, or null for a day without a bar (before the start, in the future). */
  coins: number | null;
  /** The drawn label: the day of the month. */
  label: string;
  /** What a screen reader says for the day ("október 18., vasárnap: +40"). */
  srText: string;
  today: boolean;
  /** Draw the figure over the bar. */
  showFigure: boolean;
  /** The figure as drawn ("+157", "−20"). */
  figure: string;
}

/** `dayCols` constants: bar zone, headroom for the figure, bar width. */
const ZONE = 64;
const HEAD = 24;
const BAR = 6;
/** Under the lowest point: 8 → the label's 18 pt line → 8. */
const FOOT = 8 + 18 + 8;

export function DayColumns({ days, label }: { days: readonly DayColumn[]; label: string }) {
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
            <span className="sr-only">{day.srText}</span>
            {v === null ? null : (
              <>
                <span
                  aria-hidden
                  className={cn('absolute rounded-bar', day.today ? 'bg-accent' : v < 0 ? 'bg-text-3' : 'bg-text-1')}
                  style={{ left: `calc(${centre} - ${BAR / 2}px)`, top, width: BAR, height: h }}
                />
                {day.showFigure ? (
                  <span
                    aria-hidden
                    className={cn('absolute -translate-x-1/2 whitespace-nowrap text-data', day.today ? 'text-text-1' : 'text-text-2')}
                    style={{ left: centre, top: figureTop }}
                  >
                    {day.figure}
                  </span>
                ) : null}
              </>
            )}
            <span
              aria-hidden
              className={cn('absolute -translate-x-1/2 text-data', day.today ? 'text-text-1' : 'text-text-3')}
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

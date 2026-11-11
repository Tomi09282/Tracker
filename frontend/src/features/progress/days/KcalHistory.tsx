import type { LifeosDay } from '../../../lib/lifeos-api';
import { cn } from '../../../lib/cn';

/**
 * THE KCAL HISTORY — progress-days "Plot" (design round B, `progress-days.part.js`): the settled
 * days' eaten kcal as a 1.5 pt ink line with a dot per day, drawn as progress-1 draws its chart,
 * against the dashed target.
 *
 *   ─────────────────────────────────────────   2400   gridline (hair) + its mono value (text-3)
 *        ●                         ●
 *   ╌╌╌╌/╌╲╌╌╌╌╌●╌╌╌╌●╌╌╌╌╌╌╌╌╌╌╌╱╌╲╌╌╌╌╌╌╌╌   2200   the target: dashed 2 / 4 in text-3, value text-2
 *   ●/     ╲  /    ╲/  ╲●──●──●/   ╲●
 *   ─────────●──────────────────────────────   2000
 *
 * The plot is 120 tall; the line takes the width minus the 44 pt value column (310 of 354), 3 pt
 * in from both ends and 5 pt from top and bottom. The scale is centred on the target: it reaches
 * 300 above and below (more when a day lies further out, in steps of 100), and the two gridlines
 * stand 100 inside its ends (2400 / 2000 in the frame). A day OVER the target is a 6 pt warn dot,
 * every other day a 4 pt ink dot — the server's outcome decides, not a client comparison. A day
 * without data has no dot and breaks the line. Without a nutrition target the scale is centred on
 * the days' own mean and there is no target line.
 *
 * The line is an SVG stretched to the plot's width (the stroke keeps its 1.5 pt); the dots are
 * placed in percent so that they stay round at every width.
 */
export interface KcalPoint {
  date: string;
  eatenKcal: number | null;
  outcome: LifeosDay['kcalOutcome'];
}

const PLOT_H = 120;
/** The value column right of the line: 354 − 310. */
const VALUE_COL = 44;
const PAD_X = 3;
const PAD_Y = 5;
const LINE_W = 310;

export function KcalHistory({ days, target, label }: { days: readonly KcalPoint[]; target: number | null; label: string }) {
  const eaten = days.map((d) => d.eatenKcal).filter((v): v is number => v !== null);
  const centre = target ?? (eaten.length ? Math.round(eaten.reduce((s, v) => s + v, 0) / eaten.length / 100) * 100 : 2000);
  const furthest = eaten.reduce((m, v) => Math.max(m, Math.abs(v - centre)), 0);
  const span = Math.max(300, Math.ceil((furthest + 30) / 100) * 100);
  const hi = centre + span;
  const lo = centre - span;
  const n = days.length;

  const yOf = (v: number) => PAD_Y + ((PLOT_H - 2 * PAD_Y) * (hi - v)) / (hi - lo);
  const xOf = (i: number) => PAD_X + ((LINE_W - 2 * PAD_X) * (n > 1 ? i / (n - 1) : 0.5));
  /** The same x in percent of the line's box, for the HTML dots. */
  const leftOf = (i: number) => `calc(${PAD_X}px + (100% - ${2 * PAD_X}px) * ${n > 1 ? i / (n - 1) : 0.5})`;

  // The line, broken where a day has no data.
  let path = '';
  let pen = false;
  days.forEach((d, i) => {
    if (d.eatenKcal === null) {
      pen = false;
      return;
    }
    path += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(d.eatenKcal).toFixed(1)}`;
    pen = true;
  });

  const grid = [centre + span - 100, centre - span + 100];

  return (
    <div role="img" aria-label={label} className="relative w-full" style={{ height: PLOT_H }}>
      {grid.map((v) => (
        <div key={v} aria-hidden>
          <span className="absolute left-0 h-px bg-hair" style={{ top: Math.round(yOf(v) - 0.5), width: `calc(100% - ${VALUE_COL}px)` }} />
          <span className="absolute right-0 text-data text-text-3" style={{ top: yOf(v) - 9 }}>
            {v}
          </span>
        </div>
      ))}
      {target !== null ? (
        <span aria-hidden className="absolute right-0 text-data text-text-2" style={{ top: yOf(target) - 9 }}>
          {target}
        </span>
      ) : null}
      <div aria-hidden className="absolute inset-y-0 left-0" style={{ width: `calc(100% - ${VALUE_COL}px)` }}>
        <svg className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${LINE_W} ${PLOT_H}`} preserveAspectRatio="none" fill="none">
          {target !== null ? (
            <path d={`M0 ${yOf(target).toFixed(1)}H${LINE_W}`} className="stroke-text-3" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          ) : null}
          {path ? (
            <path d={path} className="stroke-text-1" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        {days.map((d, i) => {
          if (d.eatenKcal === null) return null;
          const over = d.outcome === 'over';
          const r = over ? 3 : 2;
          return (
            <span
              key={d.date}
              className={cn('absolute rounded-full', over ? 'bg-warning' : 'bg-text-1')}
              style={{ left: `calc(${leftOf(i)} - ${r}px)`, top: yOf(d.eatenKcal) - r, width: 2 * r, height: 2 * r }}
            />
          );
        })}
      </div>
    </div>
  );
}

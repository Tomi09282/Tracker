import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { plot, linePath, areaPath, longestGapDays } from './chartGeometry';

export interface TrendPoint {
  date: string;
  value: number;
}

/**
 * How to colour a change. **The app does not always know which way is good**, and pretending it
 * does is a way to be wrong at somebody about their own body.
 *
 *   'up'      — more is better (a lift, a distance). Green up, grey down.
 *   'down'    — less is better (a time). Green down, grey up.
 *   'neutral' — the app has no opinion, so neither does the colour.
 *
 * Body measurements default to `neutral` and that is not a cop-out: a person gaining 3 kg may be
 * bulking on purpose or dieting badly, and a green number is the app telling them which. Only the
 * user's own goal decides, and this component does not have it. Colouring weight loss green by
 * default is also the single easiest way for a fitness app to say something harmful to someone
 * with a disordered relationship to food.
 */
export type TrendDirection = 'up' | 'down' | 'neutral';

/**
 * ONE line chart, for every series in the product.
 *
 * PLAIN SVG, no charting library. The whole thing is a path, a dot and two labels — a dependency
 * for that would cost more in bundle size than the entire workout player.
 *
 * TWO POINTS IS NOT A TREND. It refuses to draw below three, and says so rather than rendering a
 * line between two dots that a reader will interpret as a direction.
 *
 * ACCESSIBILITY IS NOT THE SVG. A line is unreadable to a screen reader whatever you put in its
 * title, so the same data renders as a real (visually hidden) table. That is the actual content;
 * the drawing is a summary of it.
 *
 * This was extracted FROM `ProgressChart`, which is now a thin mapper over it. Body measurements
 * needed the same picture and the alternative was a second chart — where the x axis would
 * eventually go back to being an index, because the reason it is time lives in a comment on the
 * one that exists.
 */
export function TrendChart({
  series,
  unit,
  label,
  direction = 'neutral',
  className,
}: {
  series: TrendPoint[];
  unit: string;
  label: string;
  direction?: TrendDirection;
  className?: string;
}) {
  const { t } = useTranslation();
  const gradientId = useId();

  if (series.length < 3) {
    return (
      <p className="text-caption text-text-3">{t('progress.notEnough', { count: series.length })}</p>
    );
  }

  // The viewBox is fixed and the SVG scales; nothing here depends on measured pixels, so it renders
  // identically before and after layout and needs no resize observer.
  const W = 300;
  const H = 90;
  const PAD = 4;

  // Geometry lives in a pure module so the one thing a chart can silently get wrong — where the
  // points go — is testable without a DOM. See `chartGeometry.ts` for why x is TIME, not index.
  const pts = plot(series, { w: W, h: H, pad: PAD });
  const line = linePath(pts);
  const area = areaPath(pts, H);
  const gap = longestGapDays(series);

  const first = series[0];
  const last = series[series.length - 1];
  const lastPt = pts[pts.length - 1];
  const delta = last.value - first.value;

  const good =
    direction === 'neutral' ? false : direction === 'up' ? delta > 0 : delta < 0;

  return (
    <figure className={className}>
      <figcaption className="text-caption flex items-baseline justify-between gap-2 text-text-2">
        <span>{label}</span>
        <span className="tabular-nums text-text-1">
          {round(last.value)} {unit}
          {/* The change over the WHOLE window, not since the previous point. A single-session dip
              is noise; where they started versus where they are is the question being asked. */}
          {delta !== 0 ? (
            <span className={good ? 'ml-1 text-success' : 'ml-1 text-text-3'}>
              {delta > 0 ? '+' : ''}
              {round(delta)}
            </span>
          ) : null}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full"
        preserveAspectRatio="none"
        role="presentation"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          // `preserveAspectRatio="none"` stretches the box, which would stretch the stroke with it.
          // This keeps the line one consistent weight at every screen width.
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lastPt.x} cy={lastPt.y} r="3" fill="var(--accent)" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="text-caption flex justify-between gap-2 text-text-3">
        <span>{first.date}</span>
        {/* A break that dominates the window is NAMED, not merely drawn. The honest x axis makes the
            gap visible; saying how long it was is what stops a reader interpreting the drop after it
            as lost progress rather than as two weeks off. Two weeks because a week is ordinary. */}
        {gap >= 14 ? <span className="truncate text-warning">{t('progress.gap', { count: gap })}</span> : null}
        <span>{last.date}</span>
      </div>

      {/* THE ACTUAL CONTENT for anyone not looking at the picture. */}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{t('progress.date')}</th>
            <th scope="col">{label}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.date}>
              <th scope="row">{p.date}</th>
              <td>
                {round(p.value)} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Whole numbers past 10, one decimal below it — 2.5 kg matters, 102.5 kg does not. */
const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

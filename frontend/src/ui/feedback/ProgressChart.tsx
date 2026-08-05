import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface ProgressPoint {
  date: string;
  e1rm_kg: number | null;
  top_load_kg: number | null;
  best_seconds: number | null;
  best_distance_m: number | null;
  volume_kg: number | null;
  sets: number;
}

/** The four things a client might actually be progressing at. */
export type Measure = 'e1rm_kg' | 'top_load_kg' | 'best_seconds' | 'best_distance_m' | 'volume_kg';

/**
 * A per-exercise progress line.
 *
 * PLAIN SVG, no charting library. The whole thing is a path, four ticks and a label — a dependency
 * for that would cost more in bundle size than the entire workout player.
 *
 * TWO POINTS IS NOT A TREND. The chart refuses to draw below three, and says so rather than
 * rendering a line between two dots that a reader will interpret as a direction. That has been this
 * codebase's position since before there was an endpoint to draw from; the endpoint did not change
 * the honesty requirement, it only made the chart possible.
 *
 * ACCESSIBILITY IS NOT THE SVG. A line is unreadable to a screen reader whatever you put in its
 * title, so the same data is rendered as a real (visually hidden) table. That is the actual
 * content; the drawing is a summary of it.
 */
export function ProgressChart({
  points,
  measure,
  unit,
  label,
  className,
}: {
  points: ProgressPoint[];
  measure: Measure;
  unit: string;
  label: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const gradientId = useId();

  const series = points
    .map((p) => ({ date: p.date, value: p[measure] }))
    .filter((p): p is { date: string; value: number } => typeof p.value === 'number');

  if (series.length < 3) {
    return (
      <p className="text-caption text-text-3">
        {t('progress.notEnough', { count: series.length })}
      </p>
    );
  }

  // The viewBox is fixed and the SVG scales; nothing here depends on measured pixels, so it
  // renders identically before and after layout and needs no resize observer.
  const W = 300;
  const H = 90;
  const PAD = 4;

  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero and, worse, draw a line at the top of the box implying a
  // peak. A single horizontal line through the middle is the honest picture of "no change".
  const span = max - min || 1;
  const flat = max === min;

  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (series.length - 1);
  const y = (v: number) => (flat ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2));

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

  const first = series[0];
  const last = series[series.length - 1];
  const delta = last.value - first.value;

  return (
    <figure className={className}>
      <figcaption className="text-caption flex items-baseline justify-between gap-2 text-text-2">
        <span>{label}</span>
        <span className="tabular-nums text-text-1">
          {round(last.value)} {unit}
          {/* The change over the WHOLE window, not since the previous point. A single-session dip
              is noise; where they started versus where they are is the question being asked. */}
          {delta !== 0 ? (
            <span className={delta > 0 ? 'ml-1 text-success' : 'ml-1 text-text-3'}>
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
        <circle cx={x(series.length - 1)} cy={y(last.value)} r="3" fill="var(--accent)" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="text-caption flex justify-between text-text-3">
        <span>{first.date}</span>
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

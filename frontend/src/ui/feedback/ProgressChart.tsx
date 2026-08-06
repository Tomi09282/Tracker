import { TrendChart } from './TrendChart';

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
 * NOW A MAPPER, not a chart. Everything below the `{date, value}` shape moved to `TrendChart` when
 * body measurements needed the same picture — because the alternative was a second SVG, and a
 * second SVG is where the x axis quietly goes back to being an index. The reason it is TIME lives
 * in a comment on one component, and there must only be one.
 *
 * A time measure is the one place where DOWN is progress, which is why direction is derived here
 * rather than defaulted: this mapper knows what the numbers mean and `TrendChart` does not.
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
  const series = points
    .map((p) => ({ date: p.date, value: p[measure] }))
    .filter((p): p is { date: string; value: number } => typeof p.value === 'number');

  return (
    <TrendChart
      series={series}
      unit={unit}
      label={label}
      direction={measure === 'best_seconds' ? 'down' : 'up'}
      className={className}
    />
  );
}

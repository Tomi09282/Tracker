import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ProgressChart, type ProgressPoint } from '../../../ui/feedback/ProgressChart';
import { Sparkline } from '../../../ui/feedback/Sparkline';
import { TrendChart, type TrendPoint } from '../../../ui/feedback/TrendChart';

/*
 * The charts lane's page of the kit specimen (`/playground`, kit section): `Sparkline`,
 * `TrendChart` in its two forms, and `ProgressChart`, the mapper the coach screen uses.
 *
 * The kit host collects every file in this folder with `import.meta.glob`. This one offers both
 * shapes a host can want: `specimens` — one entry per cell, a mono label and the nodes — and a
 * default component that lays those cells out itself.
 *
 * The first cell IS the cell of the Figma component board (`Pulse — Components`, column 3,
 * `sparkline`), label for label: a 140 x 32 sparkline and a full-width 96 pt one, 20 apart and 20
 * under the label (`app-components.body.js` 84, `_components.json` 80:614). The cells after it are
 * the two charts as the frames compose them, on the frames' own sample data:
 * `client-detail-3` "Chart/Bench Press" and `progress-1` "Chart" under "Stat/Testsúly".
 *
 * The board draws its sparkline by INDEX with nulls for the pause; the product draws by TIME
 * (`chartGeometry.plot`). The sample dates are spaced so that both give the same picture: readings
 * three days apart with a 21-day pause on the board, weekly with a 14-day pause on the coach frame,
 * and the progress frame's own day offsets.
 *
 * A chart has no pressed, disabled, busy or focus state: nothing in it is interactive. The states
 * it HAS are shown instead: with and without a break, flat, too few readings, a measure where
 * less is better.
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. The first one is the label of the Figma board, verbatim. */
  label: string;
  node: ReactNode;
  /** The board's gap between the label and the first node, in pt (the board's `cell()` gap). Absent = 12. */
  gap?: number;
}

const DAY = 86400000;
const day = (start: string, offset: number) => new Date(Date.parse(`${start}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
/** The board's index series (null = no reading) as dated readings `step` days apart. */
const dated = (start: string, step: number, values: (number | null)[]): TrendPoint[] =>
  values.flatMap((value, i) => (value == null ? [] : [{ date: day(start, i * step), value }]));

/** `app-components.body.js` 73 — the Profil weight row's series, a six-reading pause in the middle. */
const WEIGHT = dated('2026-07-17', 3, [
  88.4, 88.1, 87.9, 87.5, 87.6, 87.2, 87, null, null, null, null, null, null, 85.6, 85.3, 85.4, 84.9, 84.7, 84.8, 84.3, 84, 84.1,
  83.6, 83.4, 83.1,
]);

/** `client-detail-3.body.js` — e1RM per training week, one week missed. */
const BENCH = dated('2026-07-15', 7, [96, 97.5, 99, 92.5, 100, 101.5, null, 100.5, 102.5, 104, 98.5, 106, 108]);

/** `progress-1.body.js` — 26 weigh-ins: [day since 2026-07-17, kg], a 25-day pause after the ninth. */
const BODY: TrendPoint[] = (
  [
    [0, 88.4], [2, 88.6], [5, 88.1], [7, 87.9], [10, 87.5], [12, 87.6], [14, 87.2], [17, 87.0], [20, 86.8],
    [45, 85.9], [47, 85.6], [49, 85.7], [52, 85.3], [54, 85.4], [56, 85.0], [59, 84.9], [61, 84.7], [63, 84.8], [66, 84.3],
    [68, 84.4], [70, 84.0], [75, 83.3], [76, 83.6], [78, 83.0], [81, 83.4], [83, 83.1],
  ] as const
).map(([d, value]) => ({ date: day('2026-07-17', d), value }));

/** A timed measure: `ProgressChart` reads seconds as "less is better", so a falling time is the success ink. */
const TIMED: ProgressPoint[] = [128, 126, 127, 122, 120].map((s, i) => ({
  date: day('2026-09-01', i * 4),
  e1rm_kg: null,
  top_load_kg: null,
  best_seconds: s,
  best_distance_m: null,
  volume_kg: null,
  sets: 3,
}));

const FLAT = dated('2026-09-01', 5, [72, 72, 72, 72]);

/** The progress screen's metric name, through the bundle like the screen itself. */
function WeightStage() {
  const { t } = useTranslation();
  return <TrendChart variant="stage" series={BODY} unit="kg" label={t('progress.metricName.weight')} />;
}

function Timed() {
  const { t } = useTranslation();
  return <ProgressChart points={TIMED} measure="best_seconds" unit={t('workout.seconds')} label="Rowing Machine" />;
}

function Thin() {
  const { t } = useTranslation();
  return <TrendChart series={BODY.slice(0, 2)} unit="kg" label={t('progress.metricName.weight')} />;
}

export const specimens: KitSpecimen[] = [
  {
    kit: 'sparkline',
    label: 'sparkline · with a gap / chart with a live end dot',
    gap: 20,
    node: (
      <div className="flex flex-col gap-5">
        <Sparkline series={WEIGHT} />
        <Sparkline series={WEIGHT} width={354} height={96} tone="live" fluid />
      </div>
    ),
  },
  {
    kit: 'sparkline',
    label: 'sparkline · in a ledger row, 120 x 28 / without a break',
    node: (
      <div className="flex flex-col gap-5">
        <Sparkline series={WEIGHT} width={120} height={28} />
        <Sparkline series={WEIGHT.slice(13)} width={120} height={28} />
      </div>
    ),
  },
  {
    kit: 'trendChart',
    label: 'trendChart · titled — the coach client page, one chart per exercise',
    node: <TrendChart series={BENCH} unit="kg" label="Bench Press" direction="up" />,
  },
  {
    kit: 'trendChart',
    label: 'trendChart · stage — under the screen’s stat block, a dot per reading',
    node: <WeightStage />,
  },
  {
    kit: 'trendChart',
    label: 'trendChart · flat / progressChart, a time measure / fewer than three readings',
    node: (
      <div className="flex flex-col gap-8">
        <TrendChart series={FLAT} unit="kg" label="Barbell Squat" direction="up" />
        <Timed />
        <Thin />
      </div>
    ),
  },
];

export default function ChartsKit() {
  return (
    <div className="flex flex-col gap-12">
      {specimens.map((specimen) => (
        <section key={specimen.label} className="flex flex-col" style={{ gap: specimen.gap ?? 12 }}>
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { formatMeasure } from '../../lib/measure';
import { GAP_DAYS, longestGapDays, plot, scaleTicks, type Inset, type PlotBox } from './chartGeometry';
import { SPARK_PAD, TrendLine } from './Sparkline';

export interface TrendPoint {
  date: string;
  value: number;
}

/**
 * How to colour a change. **The app does not always know which way is good**, and pretending it
 * does is a way to be wrong at somebody about their own body.
 *
 *   'up'      — more is better (a lift, a distance). Success ink up, secondary ink down.
 *   'down'    — less is better (a time). Success ink down, secondary ink up.
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
 * The two ways the Pulse frames compose a chart. Same line, same scale, same axis grammar; they
 * differ in who prints the name and the value.
 *
 *   'titled' — the chart carries its own head: name on the left, the change, the `num` value and
 *              the unit on one baseline on the right; a 96 pt plot with the kit's sparkline (end dot
 *              only); a hairline rule over the dates; the break as a warning dot + label between
 *              them. `client-detail-3`, "Chart/Bench Press". The default, so every existing caller
 *              keeps its name and value on screen.
 *   'stage'  — the screen's anchor: the name and the giant value stand ABOVE it in the screen's own
 *              stat block, so the head holds only the change (left) and the scale's unit (right);
 *              a taller plot with a hairline per scale value, a dot on every reading and a 4 pt lime
 *              end dot; the break named in the warning ink between the dates. `progress-1`,
 *              "Trend/Testsúly" > "Chart".
 */
export type TrendChartVariant = 'titled' | 'stage';

export interface TrendChartProps {
  series: TrendPoint[];
  unit: string;
  /** The metric or exercise name. Printed in the head (`titled`), and always the caption of the hidden table. */
  label: string;
  direction?: TrendDirection;
  className?: string;
  /**
   * Which sentence to show when there are fewer than three points.
   *
   * The default is the progress screen's, which is where this chart was born and where it says
   * "three training days". That wording followed the component onto the admin dashboard's coin
   * velocity chart, which told an admin to log three more workouts — measured on the screen, in
   * Hungarian, with one ledger entry in the window.
   *
   * A shared component with a domain-specific empty state is a small lie per reuse. The default
   * keeps every existing caller unchanged; new surfaces pass their own.
   */
  emptyKey?: string;
  /** Default `'titled'`. Added by the Pulse restyle (F14); see `TrendChartVariant`. */
  variant?: TrendChartVariant;
  /**
   * Height of the plot in pt. Default 96 (`titled`, the frame's) / 185 (`stage`: `progress-1` sizes
   * it so the block under the chart closes above the fold of an 874 pt phone; a screen may pass the
   * 160 – 200 its own fold calls for).
   */
  height?: number;
}

/*
 * The frame's numbers, in pt (`.pulse/geometry/client-detail-3.json` and `progress-1.json`; the kit's
 * construction in `figma-build/app/client-detail-3.body.js` and `progress-1.body.js`).
 *
 * `scaleCol`: the plot is the content width minus this column; the scale values stand in it,
 * right-aligned to the content edge (354 - 300 and 354 - 310 at a 402 pt screen).
 * `designW`: the plot's width at 402 pt — the width the per-side air is measured against.
 */
const TITLED = { height: 96, scaleCol: 54, designW: 300, pad: SPARK_PAD as number | Inset } as const;
const STAGE = { height: 185, scaleCol: 44, designW: 310, pad: { top: 5.5, right: 4, bottom: 5.5, left: 2 } as Inset } as const;

/** A signed change in the reader's own number format, with a true minus (U+2212), as the frames print it. */
const signed = (delta: number, lang: string) =>
  `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatMeasure(Math.abs(delta), lang)}`;

/**
 * ONE line chart, for every series in the product.
 *
 * PLAIN SVG, no charting library. The whole thing is a line, a dot and a few labels — a dependency
 * for that would cost more in bundle size than the entire workout player.
 *
 * TWO POINTS IS NOT A TREND. It refuses to draw below three, and says so rather than rendering a
 * line between two dots that a reader will interpret as a direction.
 *
 * ACCESSIBILITY IS NOT THE SVG. A line is unreadable to a screen reader whatever you put in its
 * title, so the same data renders as a real (visually hidden) table. That is the actual content;
 * the drawing is a summary of it.
 *
 * THE PULSE CHART (Pulse System §7): no area under the line, no box around it, hairline axes, a
 * 1.5 px line, ONE end dot that carries the live reading, and a pause of 14+ days drawn dotted in
 * the quiet ink instead of a straight solid segment that reads as steady progress. Positions still
 * come from `chartGeometry.plot()` — x is TIME, see there why.
 */
export function TrendChart({
  series,
  unit,
  label,
  direction = 'neutral',
  className,
  emptyKey = 'progress.notEnough',
  variant = 'titled',
  height,
}: TrendChartProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  if (series.length < 3) {
    // The secondary ink: this is a SENTENCE the reader has to act on ("three training days are
    // needed"), not a hint — and the third ink step measures under the app's AA floor.
    return <p className="text-cap text-text-2">{t(emptyKey, { count: series.length })}</p>;
  }

  const geo = variant === 'stage' ? STAGE : TITLED;
  const H = height ?? geo.height;
  // Positions are computed in the frame's own box and drawn with x as a fraction of it (see
  // `TrendLine`), so the chart reflows with the screen width while every stroke keeps its size.
  const box: PlotBox = { w: geo.designW, h: H, pad: geo.pad };
  const pts = plot(series, box);
  const ticks = scaleTicks(series.map((p) => p.value), box);
  const gap = longestGapDays(series);

  /*
   * The scale's figures. The titled chart prints them as the head prints its value (`108`,
   * `100,3`, `92,5` — client-detail-3); the stage chart holds one decimal across the whole scale
   * as soon as one of them needs it (`88,6`, `85,8`, `83,0` — progress-1), because three figures
   * stacked in one column read as a measuring stick and a stick has one precision.
   */
  const fixed = variant === 'stage' && ticks.some((tk) => Math.round(tk.value * 10) % 10 !== 0) ? 1 : 0;
  const tickText = (v: number) =>
    fixed
      ? (Math.round(v * 10) / 10).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : formatMeasure(v, lang);

  const first = series[0];
  const last = series[series.length - 1];
  const delta = last.value - first.value;
  const good = direction === 'neutral' ? false : direction === 'up' ? delta > 0 : delta < 0;
  // The change over the WHOLE window, not since the previous point: where they started versus where
  // they are is the question being asked. Hidden when it is zero.
  const change =
    delta !== 0 ? (
      <span data-part="change" className={cn('text-data-l', good ? 'text-success' : 'text-text-2')}>
        {signed(delta, lang)}
      </span>
    ) : null;

  const scale = ticks.map((tk, i) => (
    <span
      key={i}
      className="text-data absolute end-0 -translate-y-1/2 text-text-3"
      style={{ top: tk.y }}
    >
      {tickText(tk.value)}
    </span>
  ));

  // The break, named. The dotted stretch makes a pause visible; saying how long it was is what
  // stops a reader taking the drop after it for lost progress rather than two weeks off.
  const breakText = gap >= GAP_DAYS ? t('progress.gap', { count: gap }) : null;

  // The two dates are the same length (ISO, mono), so `justify-between` centres the break between
  // them — where both frames put it — and it can never run into either date. The last date ends
  // where the line ends; on a narrow phone the room under the scale column is given up first (the
  // spacer shrinks, the dates and the break do not), so the break is never cut to an ellipsis.
  const dates = (marker: ReactNode) => (
    <div className="flex h-[18px] items-center">
      <div className="flex shrink-0 grow items-center justify-between gap-2">
        <span className="text-data text-text-3">{first.date}</span>
        {marker}
        <span className="text-data text-text-3">{last.date}</span>
      </div>
      <span aria-hidden className="min-w-0" style={{ flex: `0 1 ${geo.scaleCol}px` }} />
    </div>
  );

  const table = (
    // THE ACTUAL CONTENT for anyone not looking at the picture.
    <table className="sr-only">
      <caption>{label}</caption>
      <thead>
        <tr>
          <th scope="col">{t('progress.date')}</th>
          <th scope="col">{label}</th>
        </tr>
      </thead>
      <tbody>
        {series.map((p, i) => (
          <tr key={`${p.date}-${i}`}>
            <th scope="row">{p.date}</th>
            <td>
              {formatMeasure(p.value, lang)} {unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (variant === 'stage') {
    return (
      <figure data-kit="trendChart" data-variant="stage" className={cn('flex flex-col gap-2', className)}>
        {/* The name and the value are the screen's stat block above; here they are only the caption
            a screen reader announces. The unit on the right labels the SCALE, not the metric. */}
        <figcaption className="flex h-5 items-baseline justify-between gap-2">
          <span className="sr-only">{label}</span>
          {change ?? <span />}
          <span className="text-cap text-text-3">{unit}</span>
        </figcaption>

        <div className="relative" style={{ height: H }}>
          {/* One hairline per scale value, behind the line; the lowest one is the axis and is
              drawn in the stronger hairline. Snapped to the pixel grid so a 1 pt rule is one
              crisp pixel row. */}
          <svg
            height={H}
            className="absolute start-0 top-0 block"
            style={{ width: `calc(100% - ${geo.scaleCol}px)` }}
            aria-hidden
            focusable="false"
          >
            {ticks.map((tk, i) => {
              const y = Math.round(tk.y - 0.5) + 0.5;
              return (
                <line
                  key={i}
                  x1="0"
                  x2="100%"
                  y1={y}
                  y2={y}
                  strokeWidth={1}
                  className={i === ticks.length - 1 ? 'stroke-hair-strong' : 'stroke-hair'}
                />
              );
            })}
          </svg>
          <div className="absolute start-0 top-0" style={{ width: `calc(100% - ${geo.scaleCol}px)` }}>
            <TrendLine pts={pts} width={geo.designW} height={H} fluid line="ink" readings={2} end={{ r: 4, tone: 'live' }} />
          </div>
          {scale}
        </div>

        {dates(breakText ? <span className="text-cap text-warning">{breakText}</span> : null)}
        {table}
      </figure>
    );
  }

  return (
    <figure data-kit="trendChart" data-variant="titled" className={cn('flex flex-col gap-4', className)}>
      {/* The head: ONE baseline, 40 pt down a 44 pt row. The `num` figure's line box rises 3 pt
          above the row (its baseline sits 43 pt into its 48 pt line), which the negative margin
          gives back so the baselines meet where the frame puts them. */}
      <figcaption className="flex h-11 items-baseline gap-2">
        <span className="text-body-m min-w-0 flex-1 truncate text-text-1">{label}</span>
        {change}
        <span className="ms-px -mt-0.75 flex items-baseline gap-0.75">
          <span className="text-num text-text-1">{formatMeasure(last.value, lang)}</span>
          <span className="text-cap text-text-2">{unit}</span>
        </span>
      </figcaption>

      <div className="relative" style={{ height: H }}>
        <div style={{ width: `calc(100% - ${geo.scaleCol}px)` }}>
          <TrendLine pts={pts} width={geo.designW} height={H} fluid line="ink" end={{ r: 3, tone: 'live' }} />
        </div>
        {scale}
      </div>

      {/* The axis: a hairline, 6 under it the first date, the break, the last date. */}
      <div className="flex flex-col gap-1.5">
        <div className="h-px bg-hair" />
        {dates(
          breakText ? (
            <span className="text-cap-m flex items-center gap-1.5 text-text-1">
              <span className="size-[var(--dot)] shrink-0 rounded-full bg-warning" aria-hidden />
              <span>{breakText}</span>
            </span>
          ) : null,
        )}
      </div>
      {table}
    </figure>
  );
}

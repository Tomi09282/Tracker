import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { plot, linePath, areaPath, longestGapDays } from './chartGeometry';
import { formatMeasure } from '../../lib/measure';

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
  emptyKey = 'progress.notEnough',
}: {
  series: TrendPoint[];
  unit: string;
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
}) {
  const { t, i18n } = useTranslation();
  const gradientId = useId();

  if (series.length < 3) {
    // `text-2`, not `text-3`. This is a SENTENCE the reader has to act on ("three training days
    // are needed"), not chrome — and the ink ramp's third step is declared for placeholders, idle
    // nav and timestamps. It also measures 3.8:1, below the app's own AA_NORMAL.
    return <p className="text-caption text-text-2">{t(emptyKey, { count: series.length })}</p>;
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

  /*
   * THE SCALE. Three ticks, and one source for both the label and the line it labels.
   *
   * `at` is a fraction of the plot box measured from the TOP, which is the direction SVG y runs
   * and the direction CSS `top` runs — so the same number positions the gridline inside the
   * stretched SVG and the HTML label beside it, and the two cannot drift apart. Writing them as
   * separate numbers is precisely the "two things that must agree" defect this codebase keeps
   * finding.
   *
   * The values come from the data's own range rather than from a rounded axis, because the plot
   * already maps min→bottom and max→top: inventing nicer round numbers would put the labels
   * somewhere the line never goes. Three is the count the mockup shows and about the most a
   * 90px-tall chart can carry without the labels touching.
   */
  const values = series.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const TICKS =
    hi === lo
      ? // A flat series has no range to divide. One tick through the middle says "this is the
        // value and it did not move", where three identical labels would look like a broken axis.
        [{ at: 0.5, value: lo }]
      : [
          { at: 0, value: hi },
          { at: 0.5, value: (hi + lo) / 2 },
          { at: 1, value: lo },
        ];

  const first = series[0];
  const last = series[series.length - 1];
  const delta = last.value - first.value;

  const good =
    direction === 'neutral' ? false : direction === 'up' ? delta > 0 : delta < 0;

  return (
    <figure className={className}>
      <figcaption className="text-caption flex items-baseline justify-between gap-2 text-text-2">
        {/* The unit rides with the label rather than repeating on every tick. Three ticks each
            carrying `kg` is the same word three times in a column eight characters wide. */}
        <span>
          {label}
          {unit ? <span className="ml-1 text-text-3">({unit})</span> : null}
        </span>
        {/* THE ANSWER, at the size of an answer.
            It began at the figcaption's 12px — smaller than the date labels under its own axis —
            and was raised to `text-title-3` (17px). That was still wrong by comparison: the
            `SummaryTile` figures sitting BELOW this chart are `text-title-1` (26px), so the
            screen's anchor carried a smaller number than the two secondary readings it anchors.
            The spec calls this "the card's largest number", and now it is one. */}
        <span className="text-title-1 font-display tabular-nums text-text-1">
          {formatMeasure(last.value, i18n.language)} {unit}
          {/* The change over the WHOLE window, not since the previous point. A single-session dip
              is noise; where they started versus where they are is the question being asked.
              Held at caption size so it annotates the value rather than competing with it. */}
          {delta !== 0 ? (
            <span className={good ? 'text-caption ml-1 text-success' : 'text-caption ml-1 text-text-2'}>
              {delta > 0 ? '+' : ''}
              {formatMeasure(delta, i18n.language)}
            </span>
          ) : null}
        </span>
      </figcaption>

      {/* THE LINE USED TO FLOAT IN AN UNMARKED BOX.
          Three paths and one dot, with no scale of any kind: a reader could see that the value went
          down and had no way to tell whether the dip was 400 grams or four kilos. A trend chart
          without a scale is a shape, not a measurement.

          The tick labels are HTML rather than <text>, and that is forced: the SVG carries
          `preserveAspectRatio="none"` so it can fill any width, which stretches everything inside
          it — including glyphs. The gridlines are horizontal lines and stretch harmlessly; type
          does not. So the gutter is a flex sibling positioned to the same fractions the lines use,
          and both stay honest at every width. */}
      <div className="mt-2 flex items-stretch gap-2">
        <div className="text-caption relative w-8 shrink-0 tabular-nums text-text-3">
          {TICKS.map((tick) => (
            <span
              key={tick.at}
              className="absolute end-0 -translate-y-1/2"
              style={{ top: `${tick.at * 100}%` }}
            >
              {formatMeasure(tick.value, i18n.language)}
            </span>
          ))}
        </div>

        <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full flex-1"
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
        {/* Behind the data, never over it. Three lines only — one per tick — because a grid
            dense enough to read values off is a table, and this is a shape with a scale on it. */}
        {TICKS.map((tick) => (
          <line
            key={tick.at}
            x1="0"
            x2={W}
            y1={PAD + tick.at * (H - PAD * 2)}
            y2={PAD + tick.at * (H - PAD * 2)}
            stroke="var(--surface-border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
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
        {/* A DOT PER READING, not one on the last.
            Every earlier measurement was a bare vertex of the polyline, so a run of readings a day
            apart and a run three weeks apart drew the same line — which defeats the honest time
            axis the geometry module exists to provide. The dots are what make "these four are
            clustered and that one is alone" visible. The last one is larger: it is the value in
            the headline, and the eye should be able to find it without counting.
            Keyed by date AND index, because a metric with two readings on the same day would
            collide on a bare date key. Fill-only, so no `vectorEffect`: it governs stroke scaling
            and these have no stroke — it stays load-bearing on the <path> above. */}
        {pts.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={p.x}
            cy={p.y}
            r={i === pts.length - 1 ? 3.5 : 2}
            fill="var(--accent)"
          />
        ))}
      </svg>
      </div>

      {/* `items-center`, not the default stretch: the chip is taller than bare date text, and
          stretch would hang the two dates from the top of the row instead of on its centre line.
          `tabular-nums` keeps the two equal-length ISO dates provably equal-width, which is what
          holds the chip in the middle rather than letting it drift with the digits. */}
      <div className="text-caption flex items-center justify-between gap-2 tabular-nums text-text-3">
        <span>{first.date}</span>
        {/* A break that dominates the window is NAMED, not merely drawn. The honest x axis makes the
            gap visible; saying how long it was is what stops a reader interpreting the drop after it
            as lost progress rather than as two weeks off. Two weeks because a week is ordinary. */}
        {/* A CHIP, not loose text. It sat as the middle child of a `justify-between` row with no
            container of its own, so it drifted left and right as the two date labels changed width
            and read as a stray amber sentence rather than as a marker on the axis. A filled pill is
            an object: it holds its shape, it centres, and it says "this is about the gap between
            those two dates" by looking like a thing placed between them. */}
        {gap >= 14 ? (
          <span className="text-caption shrink-0 rounded-chip bg-warning-subtle px-2 py-0.5 text-warning">
            {t('progress.gap', { count: gap })}
          </span>
        ) : null}
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
                {formatMeasure(p.value, i18n.language)} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}


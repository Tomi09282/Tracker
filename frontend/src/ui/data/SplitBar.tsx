import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

/*
 * SplitBar — how a whole divides into its parts (kit gap G-data 2): ONE proportional segment bar
 * and its legend. Three frames draw it, each from its own body script, with the same construction:
 *
 *   coach-dashboard-1/3   the team split under the client count: 4 parts, ink steps, the legend
 *                         as two columns (key 10 x 6 · 8 · name `cap` text-2 · 8 · count `data`)
 *   coach-plans-1         the status bar under the plan count: lime / ink 50 % / track, the legend
 *                         in one row 20 apart (key 12 x 6 · 6 · name `cap` text-2 · 5 · count)
 *   admin-1               the role split under the user count: 3 parts, ink steps; the legend is
 *                         three lines beside the giant (key · name, the count in `dataL` right)
 *
 * The bar: 6 pt high (`--seg-h`), parts 8 apart, square-ended (radius 1, `--radius-bar`), each as
 * wide as its share of the width that is left after the gaps — `(354 - 8 (n - 1)) x count / sum`,
 * exactly the scripts' `unit x n`. One part fills the bar. A part with no count has no segment and
 * no legend line (coach-plans-1: "one segment per status present"), unless `keepZero`.
 *
 * Tones. A category (a team, a role) is never lime and never warn: it is a STEP OF INK by its place
 * in the split — 1 · 0.64 · 0.4 · 0.24 for four parts (coach-dashboard), 1 · 0.6 · 0.34 for three
 * (admin-1), as drawn; the lowest step stays clear of the track level. A STATUS takes its light
 * level instead: `live` (lime), `half` (ink 50 %), `warn`, `off` (the track).
 *
 * `SplitBar` draws the bar and, by default, the legend 12 under it. `SplitLegend` is the legend on
 * its own, for a screen that places it elsewhere (admin-1 puts it beside the numeral).
 *
 * Assistive tech reads the legend — a list of "name count" — and not the bar, which is its picture.
 * Without a legend the bar is one `img` named by `srText` (default: the parts, "Tagok 15, Edzők 3").
 */

/** `ink` = a category, toned by its place · `live` / `half` / `warn` / `off` = a status's light level. */
export type SplitTone = 'ink' | 'live' | 'half' | 'warn' | 'off';

export interface SplitPart {
  /** The part's name ("Erőemelő csapat", "Aktív"). Data or an existing key. */
  label: string;
  /** Its count. Its share of the bar is count / sum. */
  count: number;
  /** Default `ink`. */
  tone?: SplitTone;
}

/** `grid`: two columns, 24 apart, lines 8 apart (coach-dashboard) · `inline`: one row, 20 apart, wrapping (coach-plans) · `stack`: one line per part, the count on the right (admin-1). */
export type SplitLegendLayout = 'grid' | 'inline' | 'stack';

export interface SplitLegendProps {
  parts: readonly SplitPart[];
  /** Default `grid`. */
  layout?: SplitLegendLayout;
  /** Keep the parts whose count is 0. Default false. */
  keepZero?: boolean;
  /** The list's accessible name. */
  label?: string;
  /** Placement only (and, for `stack`, the height its lines spread over). */
  className?: string;
}

export interface SplitBarProps {
  parts: readonly SplitPart[];
  /** The legend under the bar, 12 below. Default `grid`; `none` = the bar alone. */
  legend?: SplitLegendLayout | 'none';
  /** Keep the parts whose count is 0 (no segment, a legend line). Default false. */
  keepZero?: boolean;
  /** The accessible name: of the legend list, or of the bar when there is no legend. */
  label?: string;
  /** What a screen reader says for the bar when there is no legend. */
  srText?: string;
  /** Placement and width only. The bar fills the width it is given. */
  className?: string;
}

/** The ink steps the frames draw, by the number of ink parts; beyond four, an even ramp to 0.24. */
const INK_STEPS: Record<number, readonly number[]> = {
  1: [1],
  2: [1, 0.5],
  3: [1, 0.6, 0.34],
  4: [1, 0.64, 0.4, 0.24],
};
const inkStep = (index: number, count: number) =>
  INK_STEPS[count]?.[index] ?? +(1 - (0.76 * index) / Math.max(1, count - 1)).toFixed(2);

const FILL: Record<Exclude<SplitTone, 'ink'>, string> = {
  live: 'bg-accent',
  half: 'bg-text-1/50',
  warn: 'bg-warning',
  off: 'bg-track',
};

interface Toned extends SplitPart {
  fill: string;
  style?: CSSProperties;
}

/** The parts that are drawn, each with its fill. */
function tonedParts(parts: readonly SplitPart[], keepZero: boolean): Toned[] {
  const shown = parts.filter((part) => keepZero || part.count > 0);
  const inks = shown.filter((part) => (part.tone ?? 'ink') === 'ink');
  return shown.map((part) => {
    const tone = part.tone ?? 'ink';
    if (tone !== 'ink') return { ...part, fill: FILL[tone] };
    return { ...part, fill: 'bg-text-1', style: { opacity: inkStep(inks.indexOf(part), inks.length) } };
  });
}

/** coach-plans-1 sets the count 5 after its name (`Label` gap 5): an ink distance from the frame. */
const COUNT_GAP_INLINE = 'gap-[5px]'; // token-lint-disable — measured in coach-plans-1, not a layout gap

function Key({ part, wide }: { part: Toned; wide: boolean }) {
  return <span aria-hidden className={cn('h-[var(--seg-h)] shrink-0 rounded-bar', wide ? 'w-3' : 'w-2.5', part.fill)} style={part.style} />;
}

export function SplitLegend({ parts, layout = 'grid', keepZero = false, label, className }: SplitLegendProps) {
  const { i18n } = useTranslation();
  const toned = tonedParts(parts, keepZero);
  if (toned.length === 0) return null;
  const count = (n: number) => n.toLocaleString(i18n.language);
  return (
    <ul
      data-kit="splitLegend"
      data-layout={layout}
      role="list"
      aria-label={label}
      className={cn(
        layout === 'grid' && 'grid grid-cols-2 gap-x-6 gap-y-2',
        layout === 'inline' && 'flex flex-wrap gap-x-5 gap-y-2',
        layout === 'stack' && 'flex flex-col justify-between',
        className,
      )}
    >
      {toned.map((part, index) => {
        if (layout === 'stack') {
          return (
            <li key={`${part.label}-${index}`} className="flex h-5 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <Key part={part} wide={false} />
                <span className="truncate text-cap text-text-2">{part.label}</span>
              </span>
              <span className="shrink-0 text-data-l text-text-1">{count(part.count)}</span>
            </li>
          );
        }
        const inline = layout === 'inline';
        return (
          <li key={`${part.label}-${index}`} className={cn('flex min-w-0 items-center', inline ? 'gap-1.5' : 'gap-2')}>
            <Key part={part} wide={inline} />
            <span className={cn('flex min-w-0 items-baseline', inline ? COUNT_GAP_INLINE : 'gap-2')}>
              <span className="truncate text-cap text-text-2">{part.label}</span>
              <span className="shrink-0 text-data text-text-1">{count(part.count)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SplitBar({ parts, legend = 'grid', keepZero = false, label, srText, className }: SplitBarProps) {
  const { i18n } = useTranslation();
  const toned = tonedParts(parts, keepZero);
  const drawn = toned.filter((part) => part.count > 0);
  if (toned.length === 0) return null;
  const withLegend = legend !== 'none';
  const spoken = srText ?? drawn.map((part) => `${part.label} ${part.count.toLocaleString(i18n.language)}`).join(', ');
  return (
    <div data-kit="splitBar" className={cn('flex w-full flex-col gap-3', className)}>
      <div
        role={withLegend ? undefined : 'img'}
        aria-label={withLegend ? undefined : spoken}
        aria-hidden={withLegend ? true : undefined}
        className="flex h-[var(--seg-h)] w-full gap-2"
      >
        {drawn.map((part, index) => (
          <span
            key={`${part.label}-${index}`}
            className={cn('h-full min-w-px rounded-bar', part.fill)}
            style={{ ...part.style, flexGrow: part.count, flexShrink: 1, flexBasis: 0 }}
          />
        ))}
      </div>
      {withLegend ? <SplitLegend parts={parts} layout={legend} keepZero={keepZero} label={label} /> : null}
    </div>
  );
}

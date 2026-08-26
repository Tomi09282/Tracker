import type { LucideIcon } from 'lucide-react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Surface } from '../primitives/Surface';
import { CountUp } from '../feedback/CountUp';

export interface SummaryTileProps {
  icon: LucideIcon;
  /** The big number. A string when it carries a unit or a decimal comma — `82,4 kg`, `128 g`. */
  value: number | string;
  /** Small, under the number. A noun, not a sentence: `EDZÉS / 28 NAP`, `cél 2500`. */
  caption: string;
  /**
   * Where the puck sits. `stack` (default) puts it above the figure; `row` puts it to the LEFT of
   * a figure-over-caption column, which is how 06-coach-dashboard.webp and 11-admin-attekintes.webp
   * draw their tiles and what no prop could express before.
   */
  layout?: 'stack' | 'row';
  /**
   * Centred puck-over-figure-over-caption, as the progress, nutrition and client-detail mockups
   * draw it. The dashboards (coach, admin) and Home keep the left-aligned default their mockups
   * show. `row` already answers this question with the puck's position, so it ignores this.
   */
  align?: 'start' | 'center';
  /**
   * `upper` makes the caption an eyebrow — `CSAPATOK`, `EDZÉS / 28 NAP`, as both coach mockups
   * draw it. Opt-in rather than global: 11-admin-attekintes, 03-nutrition and 05-haladas draw the
   * same caption sentence-case (`Gyakorlat`, `Fehérje · cél 180g`, `Derék · 2026-08-20`), so there
   * is no one answer for the component to inherit.
   *
   * It also drops the step to `text-micro`, because DESIGN.md §2 owns uppercase labels there and
   * `text-caption` carries no tracking — caps at 12/500 with 0 tracking set solid, which is the
   * reason `--text-micro` has +0.06em baked in.
   */
  captionCase?: 'sentence' | 'upper';
  /**
   * An optional bar under the caption, 0–1. Values above 1 clamp the FILL but tint it amber,
   * because a bar that stopped at full would make 120% look identical to 100%.
   */
  progress?: number;
  /** Marks the value itself as over target: amber number, amber bar, warning glyph on the icon. */
  over?: boolean;
  className?: string;
}

/**
 * A number worth looking at, with an icon that says what it counts.
 *
 * THE SINGLE MOST REPEATED NEW ELEMENT in the approved design — three to six of these on almost
 * every screen — which is why it is a component from the first screen rather than the twelfth.
 * It is also the thing that replaced the label-and-value tables the previous design was rejected
 * for: three tiles say what nine rows said, and you can read them without moving your eyes along
 * a line.
 *
 * The icon sits in a soft tinted holder rather than beside the text. That holder is doing real
 * work: it gives a 20px glyph enough visual mass to anchor a tile, and it is what makes a row of
 * tiles scan as objects instead of as a paragraph.
 *
 * ═══ WHY THE TYPE CLASSES ARE WHOLE STRINGS AND NOT `cn()` ═════════════════════════════════════
 *
 * `lib/cn.ts` runs a stock `twMerge`, which has never been told this project's type-step names.
 * `text-title-1` is not a t-shirt size, so it falls through to the text-COLOUR group and collides
 * with `text-text-1`: `cn('text-title-1 …', 'text-text-1')` returns the colour and drops the size.
 * The figure on this tile has been rendering at inherited 15px body, not 26px, for that reason.
 *
 * A ternary over two complete strings never reaches the merger, so it is correct today and stays
 * correct after `lib/cn.ts` learns the font-size names. `cn()` is still right for the Surface,
 * where the caller's `className` genuinely has to win.
 */
export function SummaryTile({
  icon: Icon,
  value,
  caption,
  layout = 'stack',
  align = 'start',
  captionCase = 'sentence',
  progress,
  over = false,
  className,
}: SummaryTileProps) {
  const fill = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
  const stacked = layout === 'stack';
  /** Centring only means anything in the stacked layout — `row` has a puck to sit beside. */
  const centred = stacked && align === 'center';

  /*
   * `title-3`, and this is the half of a decision whose other half is TrendChart's headline.
   *
   * A tile figure is a SECONDARY number on every screen that shows one — the anchor is a ring, a
   * donut or a chart, and the tile reports something beside it. At `title-1` it tied both the
   * screen's h1 and the chart's own answer, so a row of tiles read as loud as the thing they sit
   * under. Cap heights in `05-haladas.webp` put the three steps at 1 : 0.82 : 0.71, which on this
   * scale is 26 → 20 → 17 and nothing else.
   *
   * Ten screens render these, so this is not a per-screen tweak; if one of them needs the figure
   * bigger, that is a prop, not an edit here.
   */
  const figure = cn(
    'flex items-center gap-tight text-title-3 font-display tabular-nums',
    // `text-center` on the Surface does nothing here: the figure is a FLEX container, and flex
    // children are placed by `justify-*`, not by text alignment. Without this the number sat at the
    // leading edge of a full-width paragraph inside a tile that was otherwise centred — and on an
    // over-target tile the warning triangle sat further left still, so the three tiles in a row had
    // three different left edges. Reported on both /progress and the client detail screen.
    centred && 'justify-center',
  );

  return (
    <Surface
      className={cn(
        'flex gap-tight',
        stacked ? 'flex-col' : 'items-center',
        centred && 'items-center text-center',
        // THE BORDER IS WHAT MAKES IT THE ODD ONE OUT.
        // An amber figure and an amber bar are both INSIDE the tile, so a row of three tiles still
        // reads as three identical objects until you look at each in turn. The border changes the
        // outline of the thing, which is what the eye picks up before it reads anything — and it
        // is why the mockups draw it. Two screens had been adding this className by hand; one had
        // forgotten, so the same over-target state looked different on Home and on Nutrition.
        //
        // The tint comes with it for the same reason. `over` means one thing, so it has to LOOK
        // like one thing on all ten screens that show these tiles — and the call site that was
        // passing both of these by hand could just as easily have passed one, or neither, or
        // `danger` instead. Over target is a warning, never a danger: the user ate more than they
        // planned, nothing broke.
        over && 'border-[var(--warning-border)] bg-[var(--warning-subtle)]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          // A SQUIRCLE, NOT A CIRCLE. `rounded-chip` is `--radius-full` in Midnight, so the puck
          // came out perfectly round — and a round holder is the shape this design reserves for
          // things that stand in for a PERSON: the monogram and the notification bell. A ticket, a
          // key or a dumbbell wearing it reads as somebody's avatar. Every mockup draws the object
          // holders as rounded squares, and `--radius-card` on a 44px box is the ~30% they show.
          'inline-flex size-11 shrink-0 items-center justify-center rounded-card',
          over ? 'bg-[var(--warning-subtle)] text-[var(--warning)]' : 'bg-accent-subtle text-accent',
        )}
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>

      {/* Figure, caption and bar move as ONE block, in both layouts. In `row` it is the column
          beside the puck; in `stack` it is simply the rest of the column, nested at the same
          `gap-tight` so the two layouts cannot drift into two spacing rhythms. `w-full` is what
          keeps the bar the width of the TILE when `align="center"` shrinks its siblings. */}
      {/* `w-full` is what keeps the BAR the width of the tile, and it is also what stops the
          Surface's `items-center` from centring anything: a full-width child has nothing left to
          centre within. So the column centres its own children instead — the bar stays full width
          because it is `w-full` in its own right, one line down. */}
      <div
        className={cn(
          'flex flex-col gap-tight',
          stacked ? 'w-full' : 'min-w-0 flex-1',
          centred && 'items-center',
        )}
      >
        <p className={over ? `${figure} text-[var(--warning)]` : `${figure} text-text-1`}>
          {/* Colour is not the signal, it is the decoration on the signal. Roughly one man in twelve
              cannot separate amber from the ordinary ink here, and on a translucent surface the
              difference is smaller still. The glyph is the part that survives both. */}
          {over ? (
            <TriangleAlert className="size-icon-s shrink-0" strokeWidth={2.5} aria-hidden />
          ) : null}
          {/* CountUp already owns the odometer behaviour and already respects reduced motion, so a
              numeric tile animates and a `128 g` one simply renders. */}
          {typeof value === 'number' ? <CountUp to={value} /> : value}
        </p>

        <p
          className={
            captionCase === 'upper'
              ? 'text-micro uppercase text-text-3'
              : 'text-caption text-text-3'
          }
        >
          {caption}
        </p>

        {fill !== undefined ? (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-chip bg-surface-2">
            <div
              className={cn(
                'h-full rounded-chip transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-standard)]',
                over ? 'bg-[var(--warning)]' : 'bg-accent',
              )}
              style={{ width: `${fill * 100}%` }}
            />
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

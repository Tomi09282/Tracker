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
 */
export function SummaryTile({
  icon: Icon,
  value,
  caption,
  progress,
  over = false,
  className,
}: SummaryTileProps) {
  const fill = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));

  return (
    <Surface
      className={cn(
        'flex flex-col gap-tight',
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
          'inline-flex size-11 items-center justify-center rounded-chip',
          over ? 'bg-[var(--warning-subtle)] text-[var(--warning)]' : 'bg-accent-subtle text-accent',
        )}
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>

      <p
        className={cn(
          'text-title-1 font-display flex items-center gap-tight tabular-nums',
          over ? 'text-[var(--warning)]' : 'text-text-1',
        )}
      >
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

      <p className="text-caption text-text-3">{caption}</p>

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
    </Surface>
  );
}

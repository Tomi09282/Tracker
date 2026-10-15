import { createContext, forwardRef, useContext, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Segment } from '../feedback/variants/E6Segmented';

/*
 * ChipRow / Chip — the kit's `chipRow` (Pulse System §4 "Filter chips"; figma-build/app-kit.js
 * `chipRow`, line 211; measured boxes: `_components.json`, cells "chipRow · filter" and
 * "chipRow · multi-select, wrap").
 *
 * TEXT OPTIONS, NO BOXES. A chip is a word in `body-m` (Geist Medium 16 / 22) in a 44 pt frame:
 * idle `text-2`, selected `text-1` and a 2 pt LIME mark under the word (y 37 of 44, the width of the
 * word). Lime, not ink: a filter changes the SUBJECT of the screen; the ink mark is the segmented
 * switch's, which changes the view. No fill, no outline, no check glyph — the mark is the shape
 * that carries the state, so the selection survives without colour.
 *
 * The face is the segmented switch's own (`Segment` with `mark="accent"`): one implementation of
 * "a word in a 44 pt frame with a mark under it", busy dots, pressed 60 %, the lime focus ring 2 off
 * the frame and the ignite of the mark (it fades in `--duration-fast` where it lands; nothing slides).
 *
 * The row:
 *
 *   one line  the words 24 apart; the line scrolls sideways inside itself (never the page) and may
 *             bleed past the right gutter — the screen decides that with a margin (`className`).
 *   wrap      multi-select: the words 24 apart, lines 44 apart, inside the container's width.
 *
 * A chip's BOX reaches 8 past its word on either side (the target and the focus ring), and gives the
 * 16 back in negative margins inside a row, so the layout is the words. A chip used ALONE (a
 * `Toggle` in a call site's own flex row) keeps that 8 as padding: in an 8 pt `gap-tight` row its
 * words then stand 24 apart, exactly as in a `ChipRow`.
 *
 * Roles are the caller's choice, by what the chip MEANS:
 *   - a filter you can switch off again (library muscle, marketplace kind): a toggle button —
 *     `Chip` renders `aria-pressed` (the default);
 *   - one of several independent choices (equipment): `role="checkbox"` — `Toggle`;
 *   - one of a set (`role="radio"` in a `role="radiogroup"` row): `aria-checked`.
 * `Chip` writes `aria-checked` for `checkbox` / `radio` and `aria-pressed` otherwise.
 *
 * Reference: docs/pipeline/pulse/kit/selection.md.
 */

/** Whether a chip sits inside a `ChipRow` (the row owns the spacing) or stands alone. */
const InRow = createContext(false);

export interface ChipRowProps {
  /** The accessible name of the group (`aria-label`). */
  label: string;
  /**
   * Multi-select rows wrap inside the container's width (lines 44 apart). Without it the row is one
   * line that scrolls sideways inside itself.
   */
  wrap?: boolean;
  /** `group` (default) or `radiogroup` when the chips are radios. */
  role?: 'group' | 'radiogroup';
  /** The whole row is unavailable: 40 %. */
  disabled?: boolean;
  /** Placement only (a margin, `self-start`, the bleed past a gutter). Never a colour, size or type. */
  className?: string;
  /** `Chip`s, or `Toggle`s. */
  children: ReactNode;
}

export function ChipRow({ label, wrap = false, role = 'group', disabled = false, className, children }: ChipRowProps) {
  return (
    <InRow.Provider value>
      <div
        role={role}
        aria-label={label}
        aria-disabled={disabled || undefined}
        data-kit="chipRow"
        className={cn(
          'flex gap-x-6',
          wrap
            ? 'flex-wrap gap-y-0'
            : // One line. The scroller gets 12 of room on the left and 4 above and below, given back
              // in margins, so a chip's box (8 past its word) and the focus ring (4 past the box)
              // are not cut by the scroller's own clip; the first word still stands on the edge.
              // `self-stretch`: a one-line row is as wide as its container even in an `items-start`
              // column, or it would grow to its words and never scroll.
              '-my-1 -ml-3 flex-nowrap self-stretch overflow-x-auto py-1 pl-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          disabled && 'pointer-events-none opacity-[var(--disabled-opacity)]',
          className,
        )}
      >
        {children}
      </div>
    </InRow.Provider>
  );
}

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** The chip is chosen: `text-1` and the lime mark. */
  selected: boolean;
  /** Three dots stand in for the word, which keeps its width. Sets `aria-busy`. */
  busy?: boolean;
  /** The last attempt to change this chip failed: its word is `danger`. */
  failed?: boolean;
  /** The word (already translated). */
  children: ReactNode;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected, busy = false, failed = false, role, children, ...rest },
  ref,
) {
  const inRow = useContext(InRow);
  const checkable = role === 'checkbox' || role === 'radio';
  const chip = (
    <Segment
      ref={ref}
      layout="hug"
      mark="accent"
      role={role}
      aria-pressed={checkable ? undefined : selected}
      aria-checked={checkable ? selected : undefined}
      selected={selected}
      busy={busy}
      failed={failed}
      {...rest}
    >
      {children}
    </Segment>
  );
  // Alone, the chip's 8 either side of the word is padding, not given back (see the file head), and
  // the chip is a row of one: it carries the kit name the row would.
  return inRow ? (
    chip
  ) : (
    <span data-kit="chipRow" className="inline-flex shrink-0 px-2">
      {chip}
    </span>
  );
});

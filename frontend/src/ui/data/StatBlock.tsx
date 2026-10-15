import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface StatBlockProps {
  /** The eyebrow over the figure ("Heti edzés") — drawn in `eyebrow`, `text-2`. */
  label: ReactNode;
  /** The figure: a `Numeral`, a `Fraction` (each places itself by its ink). */
  children: ReactNode;
  /** One line under the figure, in `cap`, `text-2` ("érme"). */
  caption?: ReactNode;
  /** Placement only. */
  className?: string;
}

/**
 * The big-numeral block (kit `statBlock`, Pulse System 4): eyebrow → 8 → figure → 8 → caption,
 * left-aligned on the edge it is given, hugging its content (`app-kit.js` `statBlock`: a vertical
 * auto-layout with gap 8). The figure is ink-tight, so "8 under the eyebrow" is measured to the
 * ink of the digits — home-1: eyebrow line box 152-172, the ink of "2 / 4" from 180.
 *
 * The block's own face is the display face: what it holds is a figure (the capture tool checks the
 * face of every `statBlock`), and the caption names its own.
 */
export function StatBlock({ label, children, caption, className }: StatBlockProps) {
  const id = useId();
  return (
    <div data-kit="statBlock" role="group" aria-labelledby={id} className={cn('flex w-fit flex-col items-start gap-2', className)} style={{ fontFamily: 'var(--font-display)' }}>
      <p id={id} className="text-eyebrow text-text-2">
        {label}
      </p>
      {children}
      {caption ? <p className="font-body text-cap normal-case text-text-2">{caption}</p> : null}
    </div>
  );
}

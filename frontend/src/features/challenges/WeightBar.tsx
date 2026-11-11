import { cn } from '../../lib/cn';

/** The draw weight's scale (B-rewards-challenges: 1..5). */
export const WEIGHT_MAX = 5;

/**
 * The draw weight as five segments — frame `lifeos/challenges-2` (`weight(w)` in challenges-2.part.js):
 * five 6 × 4 pt bars, 2 apart, radius 1, the first `weight` in ink (text-1), the rest the track.
 * Ink, not lime: a weight is a setting, not a live datum. A picture: the sub line already says "súly N",
 * so it is hidden from assistive tech.
 */
export function WeightBar({ weight, className }: { weight: number; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: WEIGHT_MAX }, (_, i) => (
        <span key={i} data-on={i < weight || undefined} className={cn('h-1 w-1.5 rounded-bar', i < weight ? 'bg-text-1' : 'bg-track')} />
      ))}
    </span>
  );
}

import { cn } from '../../lib/cn';

/**
 * Thirty (or seven, or ninety) thin day bars on a hairline baseline — the "Chart/day bars" of the
 * admin-statistics-1 frame (`figma-build/admin-v2/common.js` `miniBars`): a bar is `value / max` of
 * 28 pt tall, 2 pt at the least for a day that has something and a 1 pt tick for a day that has
 * nothing, today's bar in the primary ink and the others in the secondary one. Its width is 42 % of
 * its day's slot (the frame floors half a 11.8 pt slot to 5), between 2 and 6 pt, so ninety days still draw ninety bars.
 *
 * A kit GAP, not a kit part: the kit's charts are lines (`Sparkline`, `TrendChart`) and equal
 * segments (`SegmentBar`), and none of them draws a bar whose height is a count. It lives beside the
 * page that uses it until the integrator decides whether it joins `ui/feedback` (request
 * R-S-admin-moderation-01). Tokens only: three inks, the strong hairline, the bar radius.
 *
 * Decorative, like `Sparkline`: the line that owns it prints the total, so the picture is hidden
 * from assistive technology instead of being described twice. No lime - a count per day is a
 * measure, the lime belongs to the screen's one live datum.
 */
export function DayBars({ values, className }: { values: readonly number[]; className?: string }) {
  const hi = Math.max(1, ...values);
  const last = values.length - 1;
  return (
    <div data-kit="dayBars" aria-hidden className={cn('box-content flex h-7 w-full items-end border-b border-hair-strong', className)}>
      {values.map((value, index) => (
        <div key={index} className="flex h-full min-w-0 flex-1 items-end justify-center">
          <span
            className={cn('block rounded-bar', value === 0 ? 'bg-text-3' : index === last ? 'bg-text-1' : 'bg-text-2')}
            style={{ width: 'clamp(2px, 42%, 6px)', height: value === 0 ? '1px' : `max(2px, ${(value / hi) * 100}%)` }}
          />
        </div>
      ))}
    </div>
  );
}

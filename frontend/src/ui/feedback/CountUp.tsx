import { useEffect, useRef, useState } from 'react';
import { useMotionSafe } from './useMotionSafe';

/**
 * Odometer number (E16-D).
 *
 * `tabular-nums` is not decoration here: proportional digits change width as they count, so the
 * number visibly jitters and everything beside it shifts. The Bible names that as a defect.
 *
 * With reduced motion the final value is rendered immediately — the information is the point,
 * the count is the flourish.
 *
 * ═══ `from` EXISTS FOR BALANCES, AND ITS DEFAULT IS WHY ════════════════════════════════════════
 *
 * A statistic counts up from nothing: "1652 exercises" starts at 0 because it is being revealed.
 * A BALANCE does not. A wallet going 1400 → 1450 must roll those fifty coins, not sweep from zero
 * through every number the user has ever had — that reads as the balance being recalculated, and
 * on a screen about money "the number just did something unexplained" is the one impression to
 * avoid.
 *
 * The default stays 0 so the two existing callers (admin stats, coach roster) are untouched. This
 * is an extension of the component that exists rather than a second odometer, which is the shape
 * this project has got wrong five times now: `cues.ts` vs `lib/haptics.ts`, a food-visibility
 * predicate vs `exercises/visibility.js`, an inline FTS escape vs `toFtsQuery`, a second search
 * without the language join, and a share predicate patched with `.replaceAll`. A coin odometer
 * would have been the sixth.
 */
export function CountUp({
  to,
  from = 0,
  duration = 900,
}: {
  to: number;
  from?: number;
  duration?: number;
}) {
  const motionSafe = useMotionSafe();
  const [value, setValue] = useState(motionSafe ? from : to);
  const frame = useRef(0);

  useEffect(() => {
    if (!motionSafe) {
      setValue(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Same easing curve as the rest of the system, so the count decelerates like everything else.
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    // requestAnimationFrame does not fire in a tab that is not compositing — a background tab, a
    // hidden pane, some embedded webviews. Without this the counter would sit at 0 forever, and
    // a statistic that reads 0 when the real number is 1652 is not a missing animation, it is a
    // WRONG NUMBER. The timer guarantees the true value lands whether or not a frame ever does.
    const floor = setTimeout(() => setValue(to), duration + 100);

    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(floor);
    };
  }, [to, from, duration, motionSafe]);

  return <span className="tabular-nums">{value.toLocaleString()}</span>;
}

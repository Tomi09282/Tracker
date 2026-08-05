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
 */
export function CountUp({ to, duration = 900 }: { to: number; duration?: number }) {
  const motionSafe = useMotionSafe();
  const [value, setValue] = useState(motionSafe ? 0 : to);
  const frame = useRef(0);

  useEffect(() => {
    if (!motionSafe) {
      setValue(to);
      return;
    }
    const start = performance.now();
    const from = 0;
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
  }, [to, duration, motionSafe]);

  return <span className="tabular-nums">{value.toLocaleString()}</span>;
}

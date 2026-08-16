import { useEffect, useState } from 'react';

/**
 * Whether motion is allowed right now.
 *
 * The Bible is precise about what reduced motion means here: the state change still HAPPENS and
 * is still visible — it just does not travel. So components branch on this to skip transforms
 * and keep the colour/opacity change, rather than rendering nothing at all.
 *
 * `index.css` carries a global backstop that collapses durations, but a backstop is not a
 * substitute: an animation driven by JS springs would still move without this hook.
 */
export function useMotionSafe(): boolean {
  const [safe, setSafe] = useState(() => {
    if (typeof matchMedia !== 'function') return true;
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSafe(!mq.matches);
    // The preference can change while the app is open — a user turning it on mid-session must
    // not have to reload to be respected.
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return safe;
}

/**
 * `--ease-standard`, in the shape Motion wants.
 *
 * The token is `cubic-bezier(0.16, 1, 0.3, 1)` and `check-tokens` refuses that string outside
 * `tokens.css` — but Motion takes a bezier as four numbers, which the gate cannot see and which had
 * therefore been retyped as a literal `[0.16, 1, 0.3, 1]` in nine places across six variant files.
 * Nine copies of one decision is how a curve drifts: the tenth is where somebody rounds it.
 *
 * It lives beside `SPRING` because that is where this project already keeps the motion config that
 * has to reach JS. A CSS var read at module scope would resolve before the theme is applied.
 */
export const EASE_STANDARD: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Spring presets from the Bible: stiffness 300–400, damping 17–28, scaled to element size. */
export const SPRING = {
  /** Small controls: buttons, chips, icons. Snappy. */
  tight: { type: 'spring' as const, stiffness: 400, damping: 28 },
  /** Medium surfaces: cards, list rows, indicators. */
  base: { type: 'spring' as const, stiffness: 350, damping: 24 },
  /** Large surfaces: sheets, panels. Softer landing. */
  soft: { type: 'spring' as const, stiffness: 300, damping: 17 },
};

/**
 * Haptics.
 *
 * Capacitor exposes real haptics on device; the browser has nothing equivalent, and the
 * Vibration API is both unsupported on iOS Safari and a poor substitute. So this is a no-op on
 * the web rather than a worse imitation — a wrong buzz is more annoying than no buzz.
 *
 * The import is dynamic so the web bundle never pulls the native plugin in.
 */

type Intensity = 'light' | 'medium' | 'heavy';

let plugin: { impact?: (o: { style: string }) => Promise<void> } | null | undefined;

async function load() {
  if (plugin !== undefined) return plugin;
  try {
    const mod = await import('@capacitor/haptics');
    // On the web the plugin resolves but its implementation is a stub; calling it is harmless.
    plugin = { impact: (o) => mod.Haptics.impact({ style: o.style as never }) };
  } catch {
    plugin = null;
  }
  return plugin;
}

/**
 * Fire a haptic tick. The Bible reserves these for KEY moments — a completed set, a personal
 * record, a coin reward — not for every tap. A device that buzzes constantly gets its haptics
 * turned off, and then the moments that matter are silent too.
 *
 * THIS IS THE ONLY HAPTIC PATH IN THE APP. The workout cues briefly had their own, built on
 * `navigator.vibrate` — the exact API this file's header says not to use, because it does not
 * exist on iOS Safari. The consequence was that on a real iPhone, through Capacitor, the interval
 * timer produced no haptics at all, while the correct native plugin sat here unused.
 *
 * `navigator.vibrate` is kept only as a FALLBACK, for Android web where Capacitor is absent but
 * the Vibration API works. On iOS it is skipped rather than attempted.
 */
export async function haptic(intensity: Intensity = 'light') {
  const p = await load();
  if (p?.impact) {
    try {
      await p.impact({ style: intensity.charAt(0).toUpperCase() + intensity.slice(1) });
      return;
    } catch {
      /* fall through to the web path rather than losing the cue entirely */
    }
  }
  vibrateWeb(WEB_FALLBACK[intensity]);
}

/** Rough web equivalents, in ms. Only reached when the native plugin is unavailable. */
const WEB_FALLBACK: Record<Intensity, number[]> = {
  light: [12],
  medium: [30],
  heavy: [40, 60, 40],
};

/**
 * A raw pattern, for cues whose RHYTHM carries the meaning — a personal record is not "one heavier
 * buzz", it is a recognisable shape through a pocket.
 *
 * Capacitor's `impact` takes an intensity, not a pattern, so a pattern is played as a sequence of
 * impacts spaced by its gaps. On web it falls back to `navigator.vibrate`, which takes the pattern
 * directly.
 */
export async function hapticPattern(pattern: readonly number[], intensity: Intensity = 'light') {
  const p = await load();
  if (!p?.impact) {
    vibrateWeb(pattern);
    return;
  }
  // Odd indices are gaps; even indices are buzzes.
  for (let i = 0; i < pattern.length; i += 2) {
    try {
      await p.impact({ style: intensity.charAt(0).toUpperCase() + intensity.slice(1) });
    } catch {
      return;
    }
    const gap = pattern[i + 1];
    if (gap) await new Promise((r) => setTimeout(r, gap));
  }
}

function vibrateWeb(pattern: readonly number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern as number[]);
  } catch {
    /* a refused vibration is not an error worth surfacing mid-set */
  }
}

/** Whether ANY haptic path exists — for showing a toggle honestly rather than always. */
export const hapticsAvailable = () =>
  typeof navigator !== 'undefined' &&
  (typeof navigator.vibrate === 'function' || 'Capacitor' in (globalThis as Record<string, unknown>));

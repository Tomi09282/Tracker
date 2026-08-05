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
 */
export async function haptic(intensity: Intensity = 'light') {
  const p = await load();
  if (!p?.impact) return;
  try {
    await p.impact({ style: intensity.charAt(0).toUpperCase() + intensity.slice(1) });
  } catch {
    /* never let feedback break the action it was decorating */
  }
}

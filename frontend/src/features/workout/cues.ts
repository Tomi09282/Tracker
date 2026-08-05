/**
 * Haptic and spoken cues for the workout player (T2.8.7, T2.8.8).
 *
 * Both exist for the same reason: mid-set, the phone is on the floor and the lifter is not looking
 * at it. A rest timer that only ends visually has not told them anything.
 *
 * Everything here is BEST-EFFORT and silent on failure. Vibration is unavailable on iOS Safari and
 * blocked entirely in some embedded webviews; speech needs voices the OS may not have loaded yet.
 * Neither is allowed to throw into a set-check — the workout matters, the buzz does not.
 */

/** Respect the OS setting. Someone who asked for less motion did not ask for a buzzing phone. */
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── what the lifter has switched off ──────────────────────────────────────────────────────────
 *
 * THREE SEPARATE SWITCHES, not one "sounds" toggle. They fail differently and people want
 * different combinations of them:
 *
 *   - `speech` is the synthetic voice. It is the one most likely to be unwanted: a robotic
 *     "Go, round three" in a gym is grating, and on a device with no Hungarian voice installed the
 *     browser substitutes an English one reading Hungarian text, which is worse than silence.
 *   - `tone` is the beep. It carries the 3-2-1, and on iOS Safari it is the ONLY cue available
 *     because `navigator.vibrate` does not exist there — so it must not be collateral damage from
 *     switching the voice off.
 *   - `haptics` is the buzz. Useless with the phone on the floor, essential with it in a pocket.
 *
 * Stored per DEVICE in localStorage rather than on the account, deliberately: "is my phone allowed
 * to talk" is a property of the phone and the room it is in, not of the person. A lifter with a
 * silent phone at work and a loud one at home wants different answers, and syncing it would fight
 * them. It is also not an authoritative value — nothing on the server reads it.
 */
export type CueChannel = 'speech' | 'tone' | 'haptics';

const KEY = 'tracker.cues';
const DEFAULTS: Record<CueChannel, boolean> = { speech: true, tone: true, haptics: true };

let cache: Record<CueChannel, boolean> | null = null;
const listeners = new Set<() => void>();

function load(): Record<CueChannel, boolean> {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<CueChannel, unknown>>;
      // Read key by key rather than spreading: a corrupted or hand-edited entry must not be able
      // to introduce a channel that does not exist, or a non-boolean that silently reads truthy.
      for (const k of Object.keys(DEFAULTS) as CueChannel[]) {
        if (typeof parsed[k] === 'boolean') cache[k] = parsed[k] as boolean;
      }
    }
  } catch {
    /* private mode, or a corrupt entry. The defaults are a working app. */
  }
  return cache;
}

export const cueEnabled = (channel: CueChannel): boolean => load()[channel];

export function setCueEnabled(channel: CueChannel, on: boolean) {
  const next = { ...load(), [channel]: on };
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* the preference still holds for this session; it just will not survive a reload */
  }
  // Speech is queued in the platform, not in this module — switching it off has to silence what
  // is ALREADY speaking, or the toggle appears not to work until the current phrase finishes.
  if (channel === 'speech' && !on && typeof speechSynthesis !== 'undefined') {
    try {
      speechSynthesis.cancel();
    } catch {
      /* nothing to cancel */
    }
  }
  for (const fn of listeners) fn();
}

/** Subscribe for `useSyncExternalStore`, so every toggle in the app agrees instantly. */
export function subscribeCues(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const cueSnapshot = () => load();

/**
 * Patterns rather than raw durations at the call sites, so "what a PR feels like" is defined once.
 *
 * The distinction that matters is DURATION, not rhythm: a set-check is a single short tick because
 * it happens dozens of times a session, while a PR is a longer triple because it happens rarely and
 * should feel different through a pocket.
 */
const PATTERNS = {
  setChecked: [12],
  restOver: [180, 90, 180],
  personalRecord: [40, 60, 40, 60, 160],
  // Interval cues. `intervalTick` is SHORTER than a set check because it fires three times before
  // every phase change, dozens of times a block; `intervalDone` is the longest thing in this file
  // because a block ending is the rarest event in it.
  intervalTick: [10],
  intervalWork: [200],
  intervalRest: [60, 70, 60],
  intervalDone: [40, 60, 40, 60, 300],
} as const;

export type Cue = keyof typeof PATTERNS;

export function vibrate(cue: Cue) {
  if (!cueEnabled('haptics')) return;
  if (reducedMotion()) return;
  // `navigator.vibrate` is absent on iOS and present-but-ignored inside some webviews. Both are
  // fine; the call is a hint, never a dependency.
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[cue] as unknown as number[]);
  } catch {
    /* a refused vibration is not an error worth surfacing mid-set */
  }
}

/**
 * Speak a short cue.
 *
 * `cancel()` first, deliberately: the queue is the enemy here. Without it, a client who taps
 * through four sets quickly hears four announcements back to back, the last of which arrives after
 * they have moved on. Only the most recent cue is ever relevant.
 *
 * The language is passed in rather than read from a global so it follows the app's chosen language,
 * not the browser's — the same distinction that broke the taxonomy fetch.
 */
export function speak(text: string, lang: string) {
  if (!cueEnabled('speech') || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.05;
    speechSynthesis.speak(utterance);
  } catch {
    /* no voices installed, or speech blocked by policy */
  }
}

/* ── the tone ──────────────────────────────────────────────────────────────────────────────────
 *
 * A beep, not a sample: no asset to load, no decode, no failure mode where the cue arrives late
 * because a file was still fetching.
 *
 * THIS IS NOT A NICETY. `navigator.vibrate` does not exist on iOS Safari at all, so on an iPhone
 * the tone is the ONLY non-visual cue available — and the whole premise of an interval timer is a
 * phone on the floor that nobody is looking at. Speech cannot carry a 3-2-1 either: a spoken
 * number takes most of a second and would still be talking when the phase changed.
 *
 * iOS additionally starts every AudioContext suspended until a user gesture resumes it, which is
 * why `unlockAudio()` exists and must be called SYNCHRONOUSLY from the start and resume handlers —
 * after an await it is no longer a gesture as far as the browser is concerned.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a real user gesture — start, resume, or confirming an interruption. */
export function unlockAudio() {
  const a = audio();
  if (!a) return;
  // `resume()` on an already-running context is a no-op, so this is safe to call on every gesture.
  void a.resume?.().catch(() => {});
}

export function tone(hz: number, ms: number, gain = 0.16) {
  if (!cueEnabled('tone')) return;
  const a = audio();
  if (!a || a.state === 'suspended') return;
  try {
    const osc = a.createOscillator();
    const vol = a.createGain();
    osc.frequency.value = hz;
    osc.type = 'sine';
    // A short linear fade at each end. A square-edged gate on a sine produces an audible click,
    // and a click three times a round is the kind of detail that makes an app feel cheap.
    const now = a.currentTime;
    const end = now + ms / 1000;
    vol.gain.setValueAtTime(0, now);
    vol.gain.linearRampToValueAtTime(gain, now + 0.012);
    vol.gain.setValueAtTime(gain, Math.max(now + 0.012, end - 0.02));
    vol.gain.linearRampToValueAtTime(0, end);
    osc.connect(vol).connect(a.destination);
    osc.start(now);
    osc.stop(end + 0.02);
  } catch {
    /* an audio cue that cannot play is not an error worth surfacing mid-block */
  }
}

/** Whether the device can vibrate at all — for showing the toggle honestly rather than always. */
export const hapticsAvailable = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const speechAvailable = () => typeof speechSynthesis !== 'undefined';

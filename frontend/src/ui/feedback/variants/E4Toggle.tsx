import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, type Transition } from 'motion/react';
import { Check, CheckCheck, Ellipsis, Loader2, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void | Promise<unknown>;
  label: string;
  disabled?: boolean;
}

/** The write behind the switch, as the control knows it. */
type Phase = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * `--duration-*` in the seconds Motion wants.
 *
 * The tokens are still the source — this is a unit conversion, not a second opinion. It exists
 * because Motion's JS transitions cannot read a CSS custom property, which is the same reason
 * `EASE_STANDARD` exists next to `--ease-standard`.
 */
const D = { instant: 0.1, fast: 0.15, base: 0.25, slow: 0.4, ambient: 1.2 } as const;

/**
 * How long a terminal state stays on screen before the control returns to rest, in ms.
 *
 * A failure holds twice as long as a success on purpose: a tick you miss costs nothing, a warning
 * you miss costs the user their assumption that the change landed.
 */
const HOLD = { saved: D.ambient * 1000, failed: D.ambient * 2000, refused: D.slow * 2000 } as const;

/** Track 48 wide − 2×1px border − 2×2px padding − 24px thumb = 20px of travel. */
const TRAVEL = 20;

/**
 * C's legend rail: one 20px cell per state, read through a 20px window.
 *
 * These are marks, not words, and that is deliberate — `t()` has no on/off pair to give and this
 * file may not add one. `I`/`O` are the IEC 60417 power marks, which is the one piece of switch
 * vocabulary that needs no translation; `…`, `✓` and `!` are punctuation everywhere the app ships.
 * A real `common.on` / `common.off` pair would be better and is reported as missing.
 */
const LEGEND = ['O', 'I', '…', '✓', '!'] as const;
const CELL = 20;

/**
 * E4 — Toggle, all five variants.
 *
 * The control is a real `<button role="switch">` with `aria-checked`, not a styled checkbox:
 * screen readers announce it as a switch, and the whole 44px row is the hit area rather than
 * just the visible track.
 *
 * ═══ ONE STATE MACHINE, FIVE CHANNELS ════════════════════════════════════════════════════════
 *
 * Every variant runs the same four states — idle → saving → saved → failed. What the variant
 * chooses is the CHANNEL it says them in, and no two channels are the same:
 *
 *   A  Squash-thumb   deformation — the thumb is a different SHAPE in every state
 *   B  Icon-in-thumb  the glyph — X / ✓ / … / ✓✓ / ⚠, swapped with a flip
 *   C  Text-slide     a legend rail that slides a mark into a window beside the thumb
 *   D  Glow-on        light — a halo that breathes, strobes, blooms or goes dark
 *   E  Saving-state   a rail under the track that narrates the write from start to finish
 *
 * Correctness is shared, expression is not: a failed write turns the track red in all five,
 * because an error a user can only detect by reading the animation is an error most will miss.
 *
 * ═══ WHY A TOGGLE HAS A FAILURE PATH AT ALL ══════════════════════════════════════════════════
 *
 * Two ways this control can fail, and it used to show neither:
 *
 *   1. `onChange` returns a promise that REJECTS — the switch moved and the write did not land.
 *   2. The user presses again while a write is in flight. The old code returned silently from
 *      `toggle()`, so the press produced nothing at all — which reads as a dead control, not a
 *      busy one. It is also the only failure reachable without a server, so it is what the
 *      playground can demonstrate: flip a variant, then tap again inside the same second.
 *
 * Both land in the same `failed` state, because to the person pressing they are the same fact.
 */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  const variant = useElementVariant('E4');
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  /** Bumped on every refusal and every rejection, so a SECOND failure shakes again. */
  const [jolt, setJolt] = useState(0);
  /** Bumped on every honoured flip, so D's bloom fires once per switch-on and not once ever. */
  const [flip, setFlip] = useState(0);
  const [refused, setRefused] = useState(false);
  const id = useId();

  const alive = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refuseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Set here rather than in the initialiser: StrictMode mounts, unmounts and remounts, and a
    // flag initialised to `true` once would stay false forever after that first cleanup.
    alive.current = true;
    return () => {
      alive.current = false;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (refuseTimer.current) clearTimeout(refuseTimer.current);
    };
  }, []);

  const settle = (next: Phase, hold: number) => {
    if (!alive.current) return;
    setPhase(next);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (alive.current) setPhase('idle');
    }, hold);
  };

  const toggle = () => {
    if (disabled) return;

    if (phase === 'saving') {
      setRefused(true);
      setJolt((n) => n + 1);
      if (refuseTimer.current) clearTimeout(refuseTimer.current);
      refuseTimer.current = setTimeout(() => {
        if (alive.current) setRefused(false);
      }, HOLD.refused);
      return;
    }

    setFlip((n) => n + 1);
    const result = onChange(!checked);

    // A synchronous handler has nothing to report: the position IS the confirmation, and flashing
    // "saved" every time somebody flips a local preference is noise, not feedback.
    if (!(result instanceof Promise)) return;

    setPhase('saving');
    result.then(
      () => settle('saved', HOLD.saved),
      () => {
        setJolt((n) => n + 1);
        settle('failed', HOLD.failed);
      },
    );
  };

  const on = checked;
  // A refusal reads exactly like a failure because it IS one — that press did not land.
  const state: Phase = refused ? 'failed' : phase;
  const saving = state === 'saving';
  const saved = state === 'saved';
  const failed = state === 'failed';

  /* ── A — the thumb's pose, by state ────────────────────────────────────────────────────────
     A's whole idiom is deformation, so it is the only variant where the thumb changes shape,
     and it changes it four different ways. The travel keyframes differ by DIRECTION rather than
     being one shared array: Motion replays a keyframe list when the target changes by value, and
     two identical arrays are not a change, so a shared array would squash on the first flip and
     sit still on every one after it. */
  let aPose: Record<string, number | number[]> | null = null;
  let aTransition: Transition = { duration: D.base, ease: EASE_STANDARD };
  if (variant === 'A') {
    if (!motionSafe) {
      // Reduced motion collapses the DURATION, not the state: the thumb still holds a different
      // shape per state, it just arrives there without travelling.
      aPose = failed
        ? { scaleX: 1.3, scaleY: 0.74 }
        : saving
          ? { scaleX: 0.86, scaleY: 1.12 }
          : saved
            ? { scaleX: 1.16, scaleY: 1.16 }
            : { scaleX: 1, scaleY: 1 };
      aTransition = { duration: 0 };
    } else if (failed) {
      aPose = { scaleX: [1, 1.35, 0.78, 1.12, 1], scaleY: [1, 0.7, 1.2, 0.94, 1] };
      aTransition = { duration: D.slow, ease: EASE_STANDARD };
    } else if (saving) {
      aPose = { scaleX: [0.86, 0.98], scaleY: [1.12, 1.01] };
      aTransition = { duration: D.ambient, ease: EASE_STANDARD, repeat: Infinity, repeatType: 'mirror' };
    } else if (saved) {
      aPose = { scaleX: [1, 1.24, 1], scaleY: [1, 1.24, 1] };
      aTransition = { duration: D.base, ease: EASE_STANDARD };
    } else {
      aPose = on
        ? { scaleX: [1, 1.34, 0.92, 1], scaleY: [1, 0.78, 1.06, 1] }
        : { scaleX: [1, 1.28, 0.94, 1], scaleY: [1, 0.82, 1.05, 1] };
      aTransition = { duration: D.base, ease: EASE_STANDARD };
    }
  }

  /* ── D — the halo ──────────────────────────────────────────────────────────────────────────
     The old D was `boxShadow: var(--shadow-glow)`, and `--shadow-glow` is `none` in four of the
     five theme packs. Measured: the "Glow-on" variant was pixel-identical to A everywhere except
     the neon pack. The halo is built from the accent/success/danger token pairs instead, which
     every pack declares, and the state is carried by the LIGHT rather than by the shadow being
     present or absent. */
  const haloShadow = failed
    ? '0 0 0 3px var(--danger-subtle), 0 0 14px 2px var(--danger-border)'
    : saved
      ? '0 0 0 3px var(--success-subtle), 0 0 14px 2px var(--success-border)'
      : '0 0 0 3px var(--accent-subtle), 0 0 14px 2px var(--accent-border)';

  let haloOpacity: number | number[] = on ? 1 : 0;
  let haloScale: number | number[] = 1;
  let haloTransition: Transition = { duration: motionSafe ? D.base : 0, ease: EASE_STANDARD };
  if (failed) {
    haloOpacity = motionSafe ? [1, 0.1, 1, 0.1, 1] : 1;
    haloTransition = { duration: motionSafe ? D.slow : 0, ease: EASE_STANDARD };
  } else if (saving) {
    haloOpacity = motionSafe ? [0.2, 0.9] : 0.5;
    haloTransition = motionSafe
      ? { duration: D.base, ease: EASE_STANDARD, repeat: Infinity, repeatType: 'mirror' }
      : { duration: 0 };
  } else if (saved) {
    haloOpacity = 1;
    haloScale = motionSafe ? [1, 1.18, 1] : 1.08;
    haloTransition = { duration: motionSafe ? D.slow : 0, ease: EASE_STANDARD };
  } else if (on && motionSafe) {
    // On is a lamp that is lit, not a sticker that says lit — so it breathes.
    haloOpacity = [0.55, 1];
    haloTransition = { duration: D.ambient * 2, ease: EASE_STANDARD, repeat: Infinity, repeatType: 'mirror' };
  }

  /* ── C — which cell of the legend rail is in the window ────────────────────────────────────
     Two slides at once, which is what makes C unmistakable at a glance: the WINDOW crosses the
     track with the thumb, and the RAIL slides inside it to bring the right mark up. */
  const cell = failed ? 4 : saving ? 2 : saved ? 3 : on ? 1 : 0;
  const railX = -cell * CELL;

  /* ── The thumb's glyph ─────────────────────────────────────────────────────────────────────
     The owner's rule: state changes the ICON, not only the colour. Four variants swap the glyph
     in the thumb; C says the same thing in its own channel by sliding `!` into the window, which
     is the same swap spelled as text. */
  const glyph = (() => {
    if (failed) {
      return variant === 'C' ? null : <TriangleAlert size={14} strokeWidth={2.5} aria-hidden className="text-danger" />;
    }
    if (variant === 'E') {
      if (saving) {
        // Reduced motion turns `animate-spin` into a single 0.01ms iteration — a spinner frozen
        // at 0°, which says nothing. A static ellipsis says "working" without moving.
        return motionSafe ? (
          <Loader2 size={14} strokeWidth={2.5} aria-hidden className="animate-spin text-text-2" />
        ) : (
          <Ellipsis size={14} strokeWidth={2.5} aria-hidden className="text-text-2" />
        );
      }
      if (saved) return <Check size={14} strokeWidth={3} aria-hidden className="text-success" />;
      return null;
    }
    if (variant === 'B') {
      if (saving) return <Ellipsis size={14} strokeWidth={2.5} aria-hidden className="text-text-2" />;
      // Two ticks, not one: the resting ON glyph is already a single tick, so a success that
      // reused it would be invisible on a switch that was being turned on.
      if (saved) return <CheckCheck size={14} strokeWidth={3} aria-hidden className="text-success" />;
      return on ? (
        <Check size={14} strokeWidth={3} aria-hidden className="text-accent" />
      ) : (
        <X size={14} strokeWidth={3} aria-hidden className="text-text-3" />
      );
    }
    if (variant === 'D') {
      // Not an icon — the filament. D's thumb carries the core of the lamp the halo comes from.
      return (
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-chip transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            on ? 'bg-accent' : 'bg-surface-3',
          )}
        />
      );
    }
    return null;
  })();

  /* Only A and E shake the whole control: A because physicality is its channel, E because the
     save lifecycle is. B wobbles the glyph, C jitters the rail, D strobes the light — five
     failures that are unmistakably failures and still unmistakably different from each other. */
  const shakes = variant === 'A' || variant === 'E';

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={on}
        aria-label={label}
        aria-busy={saving}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          'inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] items-center',
          'cursor-pointer outline-none disabled:pointer-events-none disabled:opacity-45',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        )}
      >
        {/* Keyed on `jolt` so the shake REPLAYS for a second failure instead of sitting at the
            end of the first one's keyframes — and ONLY for the two variants that shake, because
            the key remounts everything below it, which would re-fire D's bloom on a failure. */}
        <motion.span
          key={shakes ? jolt : 'still'}
          className="relative inline-flex"
          animate={failed && shakes && motionSafe ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: motionSafe ? D.slow : 0, ease: EASE_STANDARD }}
        >
          {variant === 'D' ? (
            <>
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-1 rounded-chip"
                style={{ boxShadow: haloShadow }}
                initial={false}
                animate={{ opacity: haloOpacity, scale: haloScale }}
                transition={haloTransition}
              />
              {/* One bloom per switch-on. Keyed on the flip counter, not on `on`: keying on the
                  boolean fires once and never again, because the key never changes back. It stays
                  mounted (at opacity 0) for as long as the switch is on, so travelling
                  saving → saved → idle does not mount a second bloom nobody pressed for. */}
              {on && motionSafe ? (
                <motion.span
                  key={`bloom-${flip}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-chip border-2 border-accent"
                  initial={{ scale: 1, opacity: 0.7 }}
                  animate={{ scale: 1.7, opacity: 0 }}
                  transition={{ duration: D.slow, ease: EASE_STANDARD }}
                />
              ) : null}
            </>
          ) : null}

          <span
            className={cn(
              'relative flex h-7 w-12 items-center overflow-hidden rounded-chip border px-0.5',
              'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
              failed
                ? 'border-[var(--danger-border)] bg-danger-subtle'
                : on
                  ? 'border-transparent bg-accent'
                  : 'border-[var(--surface-border)] bg-surface-2',
            )}
          >
            {/* E — the rail. It is present at REST too, which is what makes E recognisable before
                you press it: this is the switch that reports on its own writes. */}
            {variant === 'E' ? (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden">
                {failed ? (
                  <span className="block h-full w-full bg-danger-subtle" />
                ) : saved ? (
                  <motion.span
                    className="block h-full w-full origin-left bg-success"
                    initial={motionSafe ? { scaleX: 0 } : false}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: motionSafe ? D.base : 0, ease: EASE_STANDARD }}
                  />
                ) : saving ? (
                  motionSafe ? (
                    <motion.span
                      className="block h-full w-1/3 rounded-chip bg-accent"
                      initial={{ x: '-120%' }}
                      animate={{ x: '360%' }}
                      // An indeterminate bar has to travel at a constant rate or it reads as
                      // progress it cannot know. This is `--ease-linear`, in Motion's spelling.
                      transition={{ duration: D.ambient, ease: 'linear', repeat: Infinity }}
                    />
                  ) : (
                    <span className="block h-full w-full bg-accent opacity-60" />
                  )
                ) : (
                  <span className="block h-full w-full bg-surface-3 opacity-70" />
                )}
              </span>
            ) : null}

            {/* C — the legend rail. The track carries the state as TEXT, which survives a
                colour-blind reading and a screenshot with the animation stopped. */}
            {variant === 'C' ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 flex w-5 items-center overflow-hidden"
                initial={false}
                animate={{ x: on ? 2 : 26 }}
                transition={motionSafe ? SPRING.tight : { duration: 0 }}
              >
                <motion.span
                  className="flex shrink-0"
                  initial={false}
                  animate={
                    failed && motionSafe
                      ? { x: [railX + 7, railX - 5, railX + 3, railX] }
                      : { x: railX }
                  }
                  transition={{ duration: motionSafe ? D.base : 0, ease: EASE_STANDARD }}
                >
                  {LEGEND.map((mark, i) => (
                    <span
                      key={mark}
                      className={cn(
                        'text-micro flex w-5 shrink-0 justify-center',
                        i === 4 ? 'text-danger' : on ? 'text-accent-fg' : 'text-text-2',
                      )}
                    >
                      {mark}
                    </span>
                  ))}
                </motion.span>
              </motion.span>
            ) : null}

            <motion.span
              aria-hidden
              className="relative z-10 inline-flex size-6 items-center justify-center rounded-chip bg-surface-0"
              // A only: the origin TRAILS the direction of travel, so the stretch lags behind the
              // thumb instead of punching through the far wall of the track and being clipped.
              style={variant === 'A' ? { transformOrigin: on ? '100% 50%' : '0% 50%' } : undefined}
              initial={false}
              animate={{ x: on ? TRAVEL : 0, ...(aPose ?? {}) }}
              transition={
                !motionSafe
                  ? { duration: 0 }
                  : variant === 'A'
                    ? { x: SPRING.tight, scaleX: aTransition, scaleY: aTransition }
                    : SPRING.tight
              }
            >
              {variant === 'B' ? (
                <motion.span
                  key={`${state}-${on}`}
                  className="inline-flex"
                  initial={motionSafe ? { rotateY: -90, scale: 0.5, opacity: 0 } : false}
                  animate={
                    failed && motionSafe
                      ? { rotateY: 0, scale: 1, opacity: 1, rotate: [0, -14, 14, -8, 0] }
                      : { rotateY: 0, scale: 1, opacity: 1 }
                  }
                  transition={
                    motionSafe
                      ? { ...SPRING.tight, rotate: { duration: D.slow, ease: EASE_STANDARD } }
                      : { duration: 0 }
                  }
                >
                  {glyph}
                </motion.span>
              ) : (
                glyph
              )}
            </motion.span>
          </span>
        </motion.span>
      </button>

      {/*
        `aria-checked` reports the POSITION. Nothing reported whether the write behind it landed,
        which is the half of the story a sighted user gets from the spinner and the warning glyph.

        The keys are borrowed rather than named for this control: `src/i18n/` is shared and cannot
        take a new key from here. `onboarding.saved` and `auth.errors.generic` are the two generic
        sentences the bundles already carry in all three languages — the namespaces are wrong and
        the strings are right, and a wrong-namespace key beats an untranslated one.
      */}
      <span className="sr-only" role="status" aria-live="polite">
        {saving ? t('common.saving') : saved ? t('onboarding.saved') : failed ? t('auth.errors.generic') : ''}
      </span>
    </span>
  );
}

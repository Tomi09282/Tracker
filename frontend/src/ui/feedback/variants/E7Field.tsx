import { forwardRef, useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { Field, type FieldProps } from '../../primitives/Field';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING, EASE_STANDARD } from '../useMotionSafe';

export interface FeedbackFieldProps extends FieldProps {
  /** The field is satisfied. Every variant answers this with a mark of its own. */
  valid?: boolean;
  /**
   * A check is genuinely in flight — a handle lookup, a server-side uniqueness test.
   *
   * Separate from `valid`/`error` because "I do not know yet" is a third answer, and a field that
   * shows nothing while the server thinks looks broken. Only this prop announces itself to a
   * screen reader; the local settle beat below does not (see `SETTLE_MS`).
   */
  busy?: boolean;
}

/** What the field currently knows about its own value. */
type Status = 'idle' | 'busy' | 'valid' | 'error';

/**
 * The duration tokens, in the seconds Motion wants.
 *
 * Same reasoning as `EASE_STANDARD` in `useMotionSafe`: `check-tokens` cannot see a number inside a
 * Motion transition, so the numbers drift. Named here once, each tied to the token it mirrors,
 * rather than retyped as `0.2` / `0.35` / `0.45` down the file.
 */
const D = {
  fast: 0.15, // --duration-fast
  base: 0.25, // --duration-base
  slow: 0.4, // --duration-slow
  ambient: 1.2, // --duration-ambient
} as const;

/**
 * How long the field withholds a verdict after the value changes. `--duration-slow`.
 *
 * A field that flips to a red warning on the second character of a twelve-character password is
 * shouting at somebody who has not finished talking, so the verdict is held until typing settles —
 * and the wait is SHOWN rather than hidden, because a slot that sits empty and then holds a cross
 * looks like a glitch. That is the third icon in the set: spinner → tick, or spinner → warning.
 *
 * It is a debounce, not an animation, so reduced motion does not collapse it. What reduced motion
 * removes is the travel: the icons still swap, they just do not move on the way in.
 */
const SETTLE_MS = 400;

/**
 * The four answers, in tokens. One row per status, so a variant picks a column rather than a colour.
 *
 * `ramp` is a pair of raw `var()` strings rather than classes because variant E feeds it to a
 * gradient through a custom property, and a gradient cannot be assembled out of utility classes.
 */
const TONE = {
  idle: {
    fg: 'text-text-3',
    soft: 'bg-surface-3',
    edge: 'border-border-token',
    solid: 'bg-surface-3 text-text-2',
    glow: 'var(--accent-subtle)',
    ramp: ['var(--accent-border)', 'var(--accent)'],
  },
  busy: {
    fg: 'text-info',
    soft: 'bg-info-subtle',
    edge: 'border-info-border',
    solid: 'bg-info text-on-info',
    glow: 'var(--info-subtle)',
    ramp: ['var(--info-border)', 'var(--info)'],
  },
  valid: {
    fg: 'text-success',
    soft: 'bg-success-subtle',
    edge: 'border-success-border',
    solid: 'bg-success text-on-success',
    glow: 'var(--success-subtle)',
    ramp: ['var(--success-border)', 'var(--success)'],
  },
  error: {
    fg: 'text-danger',
    soft: 'bg-danger-subtle',
    edge: 'border-danger-border',
    solid: 'bg-danger text-on-danger',
    glow: 'var(--danger-subtle)',
    ramp: ['var(--danger-border)', 'var(--danger)'],
  },
} as const;

/**
 * E7 — Text input, all five variants, layered over the `Field` primitive.
 *
 * The primitive owns the parts that are not negotiable: the visible label, the 44px height, the
 * `role="alert"` error wired through `aria-describedby`. The variants only change how the field
 * *reacts* — which is exactly the split the feedback catalog is for.
 *
 * ═══ ONE STATUS, FIVE ANSWERS ══════════════════════════════════════════════════════════════════
 *
 * Every variant reads the same `Status`, and every variant answers it with a DIFFERENT GLYPH, not
 * with a different shade of the same one: a tick when the value is accepted, a warning triangle
 * when it is rejected, a spinner while the verdict is pending. Colour alone was the old answer and
 * it is not an answer — roughly 12% of users cannot read it, and the ones who can still have to be
 * told what the colour means. The glyph says which of the three happened; the colour only agrees.
 *
 * What differs between the letters is the IDIOM the change arrives in:
 *
 *   A Focus-glow      the field is a lamp — it lights on focus and the light takes the verdict's
 *                     colour, with a soft bulb carrying the glyph
 *   B Shake-on-error  the field physically refuses — a horizontal shake and a warning triangle;
 *                     success is the same field nodding instead
 *   C Success-tick    one stamp slot, three hand-drawn marks — the tick and the cross DRAW
 *                     themselves stroke by stroke, the pending arc turns
 *   D Char-pop        per-keystroke feedback — a counter that pops on every character and is
 *                     replaced by the verdict glyph once there is a verdict
 *   E Gradient-border a lit ramp around the frame that sweeps while focused, re-colours to the
 *                     verdict, and ends in a solid badge carrying the glyph
 */
export const FeedbackField = forwardRef<HTMLInputElement, FeedbackFieldProps>(function FeedbackField(
  { valid, busy, error, className, trailing, value, maxLength, onChange, onFocus, onBlur, ...rest },
  ref,
) {
  const variant = useElementVariant('E7');
  const motionSafe = useMotionSafe();
  const { t } = useTranslation();

  const [focused, setFocused] = useState(false);
  const [typedChars, setTypedChars] = useState(0);
  const [settling, setSettling] = useState(false);

  // A controlled field is the truth about its own length; an uncontrolled one only tells us through
  // `onChange`. Deriving rather than mirroring means a programmatic clear — LibraryPage's X button
  // setting `search` to '' — cannot leave the counter showing a stale number.
  const chars = value === undefined ? typedChars : String(value).length;

  const verdict: Status | null = error ? 'error' : valid ? 'valid' : null;
  const firstRender = useRef(true);

  // The settle beat. It runs only when there IS a verdict to withhold, which is what keeps a plain
  // search field — no `valid`, no `error` — from sprouting a spinner on every keystroke.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return; // a prefilled valid field is not "checking"; it arrived already decided
    }
    if (!verdict) {
      setSettling(false);
      return;
    }
    setSettling(true);
    const id = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(id);
  }, [value, chars, verdict]);

  const status: Status = busy || (settling && verdict !== null) ? 'busy' : (verdict ?? 'idle');
  const tone = TONE[status];

  /*
   * B — re-shake whenever a NEW error arrives. Keying on the message rather than on truthiness
   * means a second, different validation failure shakes again instead of sitting still.
   *
   * Driven by animation CONTROLS rather than by remounting the wrapper under a changing `key`,
   * which is how this used to work: a remount rebuilds the `<input>`, so the field lost focus and
   * the caret jumped at the exact moment the user was being asked to fix something.
   */
  const shake = useAnimationControls();
  useEffect(() => {
    if (variant !== 'B' || status !== 'error') return;
    // Reduced motion collapses the travel, not the message: by this point the glyph has already
    // swapped to the warning triangle and the border has already turned, neither of which moves.
    if (!motionSafe) return;
    void shake.start({
      x: [0, -8, 8, -6, 0],
      transition: { duration: D.slow, ease: EASE_STANDARD },
    });
  }, [variant, status, error, motionSafe, shake]);

  const Glyph = status === 'busy' ? Loader2 : status === 'valid' ? Check : AlertTriangle;
  const spin = motionSafe && status === 'busy' ? 'animate-spin' : undefined;

  /*
   * The mark, in each variant's own idiom. `key={status}` remounts it, so the entry animation runs
   * again on every change of verdict — the swap IS the feedback, and a glyph that quietly replaced
   * itself between two frames would not read as one.
   */
  let mark = null;
  if (status !== 'idle' || variant === 'D') {
    if (variant === 'C') {
      // C — the stamp. Nothing in here is a Lucide glyph: the marks are drawn stroke by stroke,
      // which is the difference between "a tick appeared" and "this got accepted". The failure
      // path is the same gesture in reverse — two strokes crossing, drawn at the same speed.
      mark = (
        <span
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-chip border',
            tone.edge,
            tone.fg,
          )}
        >
          {status === 'busy' ? (
            <motion.span
              aria-hidden
              className="inline-flex"
              animate={motionSafe ? { rotate: 360 } : undefined}
              transition={{ duration: D.ambient, ease: 'linear', repeat: Infinity }}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none">
                {/* pathLength=1 normalises the circumference, so the dash pattern is a FRACTION of
                    the arc and stays a quarter-turn at any radius. */}
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="0.28 0.72"
                />
              </svg>
            </motion.span>
          ) : (
            <svg key={status} viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
              {status === 'error' ? (
                <>
                  <motion.path
                    d="M7 7 L17 17"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: motionSafe ? D.base : 0, ease: EASE_STANDARD }}
                  />
                  <motion.path
                    d="M17 7 L7 17"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={{
                      duration: motionSafe ? D.base : 0,
                      delay: motionSafe ? D.fast : 0,
                      ease: EASE_STANDARD,
                    }}
                  />
                </>
              ) : (
                <motion.path
                  d="M5 12.5 L10 17.5 L19 7"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: motionSafe ? D.base : 0, ease: EASE_STANDARD }}
                />
              )}
            </svg>
          )}
        </span>
      );
    } else if (variant === 'D') {
      // D — the counter. The key carries the length, so every keystroke remounts the number and it
      // pops; once there is a verdict the same chip holds the glyph instead. One slot, two jobs,
      // and the moment it stops counting and starts judging is the thing you can see.
      const atCap = maxLength !== undefined && chars >= maxLength;
      mark = (
        <motion.span
          key={`${status}-${chars}`}
          aria-hidden
          className={cn(
            'text-caption inline-flex min-w-8 items-center justify-center rounded-chip px-2 py-1 tabular-nums',
            status === 'idle' ? 'bg-surface-3' : tone.soft,
            status === 'idle' ? (atCap ? 'text-danger' : 'text-text-2') : tone.fg,
          )}
          initial={motionSafe ? { scale: 1.45, opacity: 0.4 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={motionSafe ? SPRING.tight : { duration: 0 }}
        >
          {status === 'idle' ? (
            <>
              {chars}
              {maxLength === undefined ? null : `/${maxLength}`}
            </>
          ) : (
            <Glyph size={16} strokeWidth={2.5} className={spin} />
          )}
        </motion.span>
      );
    } else if (variant === 'E') {
      // E — the badge. Solid rather than tinted, so it reads as the end cap of the lit border and
      // not as one more soft chip.
      mark = (
        <motion.span
          key={status}
          aria-hidden
          className={cn('inline-flex size-8 items-center justify-center rounded-chip', tone.solid)}
          initial={motionSafe ? { scale: 0.5, rotate: -30 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={motionSafe ? SPRING.tight : { duration: 0 }}
        >
          <Glyph size={18} strokeWidth={2.5} className={spin} />
        </motion.span>
      );
    } else if (variant === 'B') {
      // B — the bare glyph, riding the shake. On success the same slot nods down instead of
      // shaking: the field answers with its body either way, which is what makes the rejection
      // legible before anybody reads the message underneath.
      mark = (
        <motion.span
          key={status}
          aria-hidden
          className={cn('inline-flex', tone.fg)}
          initial={motionSafe ? { y: status === 'error' ? 0 : -8, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={motionSafe ? SPRING.tight : { duration: 0 }}
        >
          <Glyph size={22} strokeWidth={2.5} className={spin} />
        </motion.span>
      );
    } else {
      // A — the bulb. It shares the glow's colour, so the lamp and the mark are one statement
      // rather than two things that happen to agree.
      mark = (
        <motion.span
          key={status}
          aria-hidden
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-chip',
            tone.soft,
            tone.fg,
          )}
          initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: motionSafe ? D.base : 0, ease: EASE_STANDARD }}
        >
          <Glyph size={20} strokeWidth={2.5} className={spin} />
        </motion.span>
      );
    }
  }

  /*
   * Only a REAL in-flight check announces itself. The local settle beat is a visual withhold that
   * is over in a few hundred milliseconds, and a live region firing on every pause in typing is
   * noise a screen-reader user cannot switch off. The error message is already announced by the
   * primitive's `role="alert"`; the success tick is decorative and stays `aria-hidden`.
   */
  const announcement = busy ? (
    <span role="status" className="sr-only">
      {t('compose.handleChecking')}
    </span>
  ) : null;

  // The caller's own trailing control — LibraryPage's clear button — is not thrown away to make
  // room for the mark. Both sit in the slot, and the input's padding grows to match.
  const crowded = mark !== null && trailing !== undefined && trailing !== null;
  const slot =
    mark === null ? (
      trailing
    ) : crowded ? (
      <span className="flex items-center gap-tight">
        {mark}
        {trailing}
      </span>
    ) : (
      mark
    );

  /*
   * The variant's custom properties, provided here rather than in `tokens.css` because they are
   * STATE, not design decisions — every value they hold is itself a token. `check-tokens` accepts a
   * `var()` whose name this same file assigns, which is what makes that distinction checkable.
   */
  const style = {
    '--e7-glow': status !== 'idle' ? '8px' : focused ? '4px' : '0px',
    '--e7-glow-color': status === 'idle' && !focused ? 'transparent' : tone.glow,
    '--e7-ramp-a': tone.ramp[0],
    '--e7-ramp-b': tone.ramp[1],
  } as CSSProperties;

  return (
    <motion.div animate={variant === 'B' ? shake : undefined} style={style}>
      <Field
        ref={ref}
        error={error}
        value={value}
        maxLength={maxLength}
        trailing={slot}
        onChange={(e) => {
          setTypedChars(e.target.value.length);
          onChange?.(e);
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          crowded && '[&_input]:pr-24',
          // A — the field is a lamp. The ring appears on focus and SWELLS into the verdict's
          // colour, so "this one is active" and "this one is settled" are the same light at two
          // sizes rather than two unrelated signals. Plain CSS, so index.css's reduced-motion
          // backstop collapses the fade while the colour still lands.
          variant === 'A' && [
            '[&_input]:shadow-[0_0_0_var(--e7-glow)_var(--e7-glow-color)]',
            '[&_input]:transition-[box-shadow,border-color]',
            '[&_input]:duration-[var(--duration-base)]',
            '[&_input]:ease-[var(--ease-standard)]',
          ],
          /*
           * E — a real gradient BORDER, not an accent-coloured one.
           *
           * Two background layers: an opaque fill clipped to the padding box, and the ramp clipped
           * to the border box, so the ramp shows only in the 2px the border occupies. The border
           * colour is transparent in every state INCLUDING `:focus-visible`, which the primitive
           * sets and which would otherwise outrank this; the focus RING is untouched and is still
           * what marks focus.
           *
           * The sweep reuses index.css's `skeleton-sweep`, which already animates
           * `background-position` at a token duration — no new keyframe, and the fill layer is a
           * flat colour, so travelling under it changes nothing. It runs only while the field is
           * focused or has something to say: a border sweeping forever on a settled form is the
           * decorative-motion pattern the Bible bans.
           */
          variant === 'E' && [
            '[&_input]:border-2',
            '[&_input]:[border-color:transparent]',
            '[&_input]:focus-visible:[border-color:transparent]',
            '[&_input]:bg-transparent',
            '[&_input]:[background-origin:border-box]',
            '[&_input]:[background-clip:padding-box,border-box]',
            '[&_input]:[background-image:linear-gradient(var(--field-bg),var(--field-bg)),linear-gradient(110deg,var(--e7-ramp-a),var(--e7-ramp-b),var(--e7-ramp-a))]',
            '[&_input]:[background-size:100%_100%,200%_100%]',
            (focused || status !== 'idle') &&
              '[&_input]:animate-[skeleton-sweep_var(--duration-ambient)_linear_infinite]',
          ],
          className,
        )}
        {...rest}
      />
      {announcement}
    </motion.div>
  );
});

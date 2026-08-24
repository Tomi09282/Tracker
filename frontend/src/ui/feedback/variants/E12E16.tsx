import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Info, Loader2, Maximize2, Minimize2, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { surface } from '../../primitives/surfaceRecipe';
import { CountUp } from '../CountUp';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, EASE_STANDARD, SPRING } from '../useMotionSafe';

/**
 * The duration tokens, in milliseconds, for the animations Motion drives from JS.
 *
 * `check-tokens` refuses a raw duration in a class, and it cannot see a number passed to Motion —
 * which is exactly how `0.35`, `0.25` and `0.2` ended up scattered across six variant files as
 * hand-typed near-misses of `--duration-*`. This is the same problem `EASE_STANDARD` solves for the
 * bezier, and the same answer: name the token once, use the name.
 *
 * It lives here rather than in `useMotionSafe` beside `EASE_STANDARD` only because that hook is
 * shared and this file is not the place to change it. Values are the tokens verbatim; `secs()`
 * exists because Motion takes seconds and `0.4 * 1000` is not 400.
 */
const DUR_MS = {
  instant: 100,
  fast: 150,
  base: 250,
  slow: 400,
  ambient: 1200,
  /** How long a confirmation stays readable — the same window a toast gets. */
  toast: 4000,
} as const;
const secs = (ms: number) => ms / 1000;

/* ══ E12 — Interactive card ═════════════════════════════════════════════════════════════════ */

/**
 * What the card is reporting about the action it just ran.
 *
 * A card that triggers a mutation can FAIL, and until now it had no way to say so: every variant
 * ended at "you pressed me". The verdict is carried by a GLYPH SWAP in the corner slot — spinner,
 * tick, warning triangle — not by a colour change, because colour alone is neither the first thing
 * a person notices nor anything a colour-blind user can rank.
 */
type CardStatus = 'idle' | 'busy' | 'ok' | 'error';

const isPromise = (v: unknown): v is Promise<unknown> =>
  typeof v === 'object' && v !== null && typeof (v as Promise<unknown>).then === 'function';

/** The corner slot is 24px inside a card, which is decoration inside a 44px target — not a target. */
const CORNER = 'absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-chip';

export function InteractiveCard({
  children,
  onClick,
  selected,
  detail,
  className,
}: {
  children: ReactNode;
  /**
   * May return a promise. When it does, the card reports the outcome itself: busy while it is in
   * flight, then a tick or a warning + shake. A void return keeps the old fire-and-forget shape.
   */
  onClick?: () => void | Promise<unknown>;
  /** Variant E: is this card picked. Variant D: is this card expanded. */
  selected?: boolean;
  /** Variant D reveals this under the hero band when the card expands. */
  detail?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E12');
  const motionSafe = useMotionSafe();
  const ref = useRef<HTMLButtonElement>(null);
  /** Pointer position inside the card, 0–1 on each axis. Drives B's tilt AND its glare. */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  /**
   * Hover and press, tracked in state rather than left to `whileHover`/`whileTap`.
   *
   * A's lift is not only a transform: it swaps the card onto the pack's ELEVATION tokens, which
   * are colour and shadow — the two things Motion's gesture props do not drive here and the two
   * things that must survive reduced motion. Motion still owns the travel; these own the material.
   */
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [status, setStatus] = useState<CardStatus>('idle');
  const verdict = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(verdict.current), []);

  const track = (e: React.PointerEvent) => {
    if (variant !== 'B') return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPointer({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };

  const handleClick = () => {
    if (status === 'busy') return;
    const result = onClick?.();
    if (!isPromise(result)) return;
    setStatus('busy');
    const land = (next: CardStatus) => {
      setStatus(next);
      window.clearTimeout(verdict.current);
      verdict.current = window.setTimeout(() => setStatus('idle'), DUR_MS.toast);
    };
    result.then(
      () => land('ok'),
      () => land('error'),
    );
  };

  // B — the tilt is TRAVEL, so reduced motion drops it. The glare below is an opacity change and
  // stays: the card still answers the pointer, it just does not move.
  const tilting = variant === 'B' && pointer && motionSafe;
  // The light source when nothing is pointing at the card: high and to the left, where every
  // other highlight in this system comes from (the recipe's rim is on the TOP edge). B used to be
  // completely inert until a pointer arrived, which in a playground tile — or in a screenshot, or
  // on a phone that is not being touched — is a plain card. A surface that catches light has to
  // look like one at rest; the pointer then MOVES the light rather than switching it on.
  const REST_GLARE = { x: 0.22, y: 0 };
  const glare = pointer ?? REST_GLARE;

  /**
   * A — "Lift-press", as an ELEVATION rather than a 4px hop.
   *
   * The old variant was `whileHover={{ y: -4 }}`: travel and nothing else, so with reduced motion
   * on — or on the touch devices this app is actually used in a gym on, where there is no hover at
   * all — A was the base card. A lift is not a translation, it is a change of PLANE, and this
   * design system already names that change: `--shadow-overlay` + `--overlay-border` are what
   * `surface({ elevation: 'sheet' })` uses for "this has left the page".
   *
   * Borrowing that pair rather than inventing an elevation is what makes it correct in all five
   * packs, F-09 included ("border OR shadow, never both"): the four shadow packs declare
   * `--overlay-border: transparent`, so the border hands over to the shadow, and Mono declares
   * `--shadow-overlay: none` with `--overlay-border: var(--surface-border)`, so the edge keeps the
   * job. One pair of tokens, the pack decides which half of it is visible.
   *
   * PRESS is the other half of the name, and it is not the hover undone. The rim flips from the
   * top edge to the bottom one — light from above catches the LOWER inner lip of something pushed
   * below the surface, which is the whole read of a physical key going down. It is an inset
   * shadow, so it claims no elevation of its own, and it survives reduced motion because it is
   * paint, not travel.
   */
  const lifted = variant === 'A' && hovered && !pressed;
  const liftStyle =
    variant === 'A'
      ? {
          boxShadow: pressed
            ? 'inset 0 -1px 0 var(--card-rim)'
            : lifted
              ? 'var(--shadow-overlay)'
              : undefined,
          borderColor: lifted ? 'var(--overlay-border)' : undefined,
          // The recipe transitions COLOURS; the shadow is the half of the lift it cannot see.
          // Reduced motion collapses this to ~0 through the global backstop, which is the point:
          // the card still changes plane, it just gets there at once.
          transition: [
            'box-shadow var(--duration-fast) var(--ease-standard)',
            'border-color var(--duration-fast) var(--ease-standard)',
            'background-color var(--duration-fast) var(--ease-standard)',
          ].join(', '),
        }
      : undefined;

  const statusChip =
    status === 'idle' ? null : (
      <motion.span
        // Remounted per status so each verdict plays its own entrance instead of cross-fading.
        key={status}
        role="status"
        aria-label={
          status === 'busy' ? t('common.loading') : status === 'ok' ? t('home.done') : t('auth.errors.generic')
        }
        className={cn(
          CORNER,
          status === 'busy' && 'bg-surface-2 text-text-2',
          status === 'ok' && 'bg-success text-on-success',
          status === 'error' && 'bg-danger text-on-danger',
        )}
        initial={motionSafe ? { scale: 0.4 } : false}
        animate={{ scale: 1 }}
        transition={SPRING.tight}
      >
        {status === 'busy' ? (
          <Loader2 size={14} strokeWidth={2.5} aria-hidden className={motionSafe ? 'animate-spin' : undefined} />
        ) : status === 'ok' ? (
          <Check size={16} strokeWidth={3} aria-hidden />
        ) : (
          <TriangleAlert size={14} strokeWidth={2.5} aria-hidden />
        )}
      </motion.span>
    );

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={handleClick}
      // Hover-tracking is mouse-only: on touch, `pointermove` fires during the tap and used to
      // leave the card frozen at an angle. `pointerdown` covers touch instead, and every release
      // path below clears the pose, which is what the old `(pointer: fine)` gate was standing in
      // for — it made the variant inert on the devices this app is actually used on.
      // The A-only state is gated on the variant for the same reason `track` is gated on B: four
      // of the five variants would otherwise re-render on every pointer down for a value nothing
      // reads, and this component renders once per row in a list.
      onPointerEnter={(e) => {
        if (variant === 'A' && e.pointerType === 'mouse') setHovered(true);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') track(e);
      }}
      onPointerDown={(e) => {
        if (variant === 'A') setPressed(true);
        track(e);
      }}
      onPointerUp={() => {
        setPressed(false);
        setPointer(null);
      }}
      onPointerCancel={() => {
        setPressed(false);
        setPointer(null);
      }}
      onPointerLeave={() => {
        setHovered(false);
        setPressed(false);
        setPointer(null);
      }}
      aria-pressed={variant === 'E' ? !!selected : undefined}
      aria-expanded={variant === 'D' ? !!selected : undefined}
      aria-busy={status === 'busy' || undefined}
      className={cn(
        // The card material, the radius, the padding, the pack's border width, the inset rim and
        // the hover/focus pair all come from the surface recipe — the same one every other panel in
        // the app is built from. This component used to hand-write `border bg-surface-1
        // p-[var(--card-pad)]` plus its own focus ring, which is a seventh copy of six decisions.
        // `interactive: true` is the recipe's own branch for "a card that is itself a button".
        surface({
          interactive: true,
          // C — the beam is masked by an inner plate, and a plate can only hide the beam if it is
          // opaque. The glass fill would let the whole rotating cone show through the card face.
          finish: variant === 'C' ? 'solid' : 'veil',
        }),
        'relative block w-full cursor-pointer overflow-hidden text-left',
        // The 44px floor. `--target-min`, never a Tailwind step, so it cannot drift below it.
        'min-h-[var(--target-min)]',
        'aria-busy:pointer-events-none aria-busy:cursor-progress',
        // C — the rotating ring IS the border, so the static one gets out of its way.
        variant === 'C' && 'border-transparent',
        // D — expanded is a state, and it reads on the surface as well as in the geometry.
        // Border, NOT a drop shadow: the recipe already carries the inset rim, and "border or
        // shadow, never both" (F-09) is the one pairing this system exists to prevent. The
        // elevation is told by the scale and the hero band instead.
        variant === 'D' && selected && 'border-[var(--accent-border)]',
        // E — the picked card is tinted, not merely outlined; a 1px edge is not a selection.
        variant === 'E' && selected && 'border-accent bg-accent-subtle',
        className,
      )}
      style={{ transformPerspective: 800, ...liftStyle }}
      // ONE animate target, because Motion writes ONE transform. Feeding B's tilt through
      // `style.transform` (as this file used to) means anything else that animates a transform
      // silently overwrites it.
      animate={{
        scale: variant === 'D' && selected ? 1.03 : 1,
        rotateX: tilting ? (glare.y - 0.5) * -8 : 0,
        rotateY: tilting ? (glare.x - 0.5) * 8 : 0,
        x: status === 'error' && motionSafe ? [0, -6, 6, -4, 0] : 0,
      }}
      transition={{
        scale: motionSafe ? SPRING.base : { duration: 0 },
        y: motionSafe ? SPRING.base : { duration: 0 },
        rotateX: { duration: motionSafe ? secs(DUR_MS.fast) : 0, ease: EASE_STANDARD },
        rotateY: { duration: motionSafe ? secs(DUR_MS.fast) : 0, ease: EASE_STANDARD },
        x: { duration: motionSafe ? secs(DUR_MS.slow) : 0, ease: EASE_STANDARD },
      }}
      // A — the travel half of the lift. It goes PAST its resting plane on the press rather than
      // merely back to it: a key that stops flush with the board has not been pressed, it has been
      // released. The material half (shadow, border, rim) is in `liftStyle` above and is what
      // still happens when travel is switched off.
      whileHover={variant === 'A' && motionSafe ? { y: -6 } : undefined}
      whileTap={
        variant === 'A' ? { y: motionSafe ? 2 : 0, scale: 0.98 } : { scale: 0.99 }
      }
    >
      {/* B — a specular highlight that follows the pointer. Without it "Tilt-glare" was only a
          tilt: the glare is the half that tells you the card has a surface catching light, and it
          is what survives when the tilt is switched off.
          It RESTS at half strength in the top-left rather than at zero, so the variant reads as
          glossy before anything touches it — see REST_GLARE. Tracking the pointer then brightens
          it and moves it, which is a change of position and intensity, not an appearance. */}
      {variant === 'B' ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
          style={{
            opacity: pointer ? 1 : 0.55,
            background: `radial-gradient(circle at ${glare.x * 100}% ${glare.y * 100}%, var(--glass-rim), transparent 55%)`,
          }}
        />
      ) : null}

      {/* C — an accent beam that RUNS the border, continuously.
          It used to be a `hover:opacity-100` on a `pointer-events-none` layer, which can never
          match: the element that has to be hovered is the one that refuses the pointer. The variant
          rendered a plain card in every theme, in every state, forever.
          A rotating cone clipped to the card and covered by an inset plate is the border-beam
          shape, and it needs no keyframe of its own — Motion drives the rotation. */}
      {variant === 'C' ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--card-radius)]"
        >
          {motionSafe ? (
            <motion.span
              className="absolute left-1/2 top-1/2 aspect-square w-[180%]"
              style={{
                x: '-50%',
                y: '-50%',
                background:
                  'conic-gradient(from 0deg, transparent 0deg, var(--accent) 45deg, transparent 110deg)',
              }}
              animate={{ rotate: 360 }}
              // The app's one looping duration, the same the pinned spinner runs at.
              transition={{ duration: secs(DUR_MS.ambient), ease: 'linear', repeat: Infinity }}
            />
          ) : (
            // Reduced motion collapses the travel, not the identity: the card still wears an
            // accent ring, it just stops chasing it.
            <span className="absolute inset-0 rounded-[var(--card-radius)] border-[length:var(--border-width)] border-accent" />
          )}
          <span className="absolute inset-[var(--border-width)] rounded-[var(--card-radius)] bg-surface-1" />
        </span>
      ) : null}

      {statusChip}

      {/* E — multi-select. The empty ring is the point: a card that only shows its checkbox once
          it is checked never told anybody it was selectable. Ring → tick is a GLYPH change, so the
          state survives being read in greyscale. */}
      {!statusChip && variant === 'E' ? (
        <motion.span
          key={selected ? 'picked' : 'free'}
          aria-hidden
          className={cn(
            CORNER,
            selected
              ? 'bg-accent text-accent-fg'
              : 'border-[length:var(--border-width)] border-[var(--surface-border-strong)]',
          )}
          initial={motionSafe ? { scale: 0.4 } : false}
          animate={{ scale: 1 }}
          transition={SPRING.tight}
        >
          {selected ? <Check size={16} strokeWidth={3} /> : null}
        </motion.span>
      ) : null}

      {/* D — the affordance has to be legible BEFORE the press, and it has to change after it.
          Two glyphs, not one rotated chevron: expand and collapse are different actions. */}
      {!statusChip && variant === 'D' ? (
        <span aria-hidden className={cn(CORNER, 'bg-surface-2 text-text-2')}>
          {selected ? <Minimize2 size={14} strokeWidth={2.5} /> : <Maximize2 size={14} strokeWidth={2.5} />}
        </span>
      ) : null}

      <span className="relative block">{children}</span>

      {/* D — "Hero-expand": the card grows a hero band and its detail rather than just scaling.
          Rendered even with no `detail`, because the band alone is the visible half — a variant
          whose whole behaviour depends on a prop the caller may not pass is a variant that does
          nothing most of the time, which is what `active:scale-[0.98]` was. */}
      {variant === 'D' ? (
        <AnimatePresence initial={false}>
          {selected ? (
            <motion.span
              key="hero"
              className="relative block overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: motionSafe ? secs(DUR_MS.base) : 0, ease: EASE_STANDARD }}
            >
              <span
                aria-hidden
                className="mt-3 block h-10 rounded-chip"
                style={{ background: 'var(--gradient-brand)' }}
              />
              {detail ? <span className="text-body-s mt-2 block text-text-2">{detail}</span> : null}
            </motion.span>
          ) : null}
        </AnimatePresence>
      ) : null}
    </motion.button>
  );
}

/* ══ E15 — Toast ════════════════════════════════════════════════════════════════════════════ */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastData {
  id: number;
  kind: ToastKind;
  message: string;
  /** Renders an Undo affordance; variant D morphs the toast when it is used. */
  onUndo?: () => void;
}

const TOAST_ICON: Record<ToastKind, typeof Check> = {
  success: Check,
  error: TriangleAlert,
  info: Info,
};

/**
 * TONE, not just a glyph colour.
 *
 * All three kinds used to render the identical `--toast-bg` box behind the identical hairline, so
 * an error and a success were the same object with a different 20px icon — on the app's ONLY
 * mutation feedback channel. `--info-subtle` and `--info-border` had zero uses in the product and
 * `--danger-subtle` almost none, while the eight `-subtle`/`-border` tokens exist for exactly this.
 *
 * The SURFACE stays `--toast-bg`, deliberately: a toast floats over arbitrary content, and a 12%
 * wash over an unknown background is a toast whose own message cannot be read. The tone is carried
 * by the border and by the icon chip — which is the pattern the offline banner and the copy button
 * already use, rather than a third way of saying "this went wrong".
 */
const TOAST_TONE: Record<ToastKind, { border: string; chip: string; icon: string }> = {
  success: {
    border: 'border-[var(--success-border)]',
    chip: 'bg-[var(--success-subtle)]',
    icon: 'text-success',
  },
  error: {
    border: 'border-[var(--danger-border)]',
    chip: 'bg-[var(--danger-subtle)]',
    icon: 'text-danger',
  },
  info: {
    border: 'border-[var(--info-border)]',
    chip: 'bg-[var(--info-subtle)]',
    icon: 'text-info',
  },
};

export function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  const variant = useElementVariant('E15');
  const motionSafe = useMotionSafe();
  const [undone, setUndone] = useState(false);
  const [paused, setPaused] = useState(false);
  const Icon = TOAST_ICON[toast.kind];
  const tone = TOAST_TONE[toast.kind];

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss, paused]);

  return (
    <motion.div
      layout
      role="status"
      // polite, never assertive: a toast must not interrupt what a screen reader is saying.
      aria-live="polite"
      initial={motionSafe ? { y: 24, opacity: 0, scale: 0.96 } : false}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={motionSafe ? { y: 8, opacity: 0, scale: 0.98 } : undefined}
      transition={motionSafe ? SPRING.base : { duration: 0 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        'relative w-full overflow-hidden rounded-card border bg-[var(--toast-bg)] p-3',
        'shadow-[var(--shadow-overlay)]',
        tone.border,
      )}
    >
      <div className="flex items-center gap-3">
        <motion.span
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-chip',
            tone.chip,
            tone.icon,
          )}
          // C — the icon itself carries the kind: a drawn check, a shaken warning, a popped info.
          animate={
            motionSafe && variant === 'C'
              ? toast.kind === 'error'
                ? { x: [0, -4, 4, -3, 0] }
                : { scale: [0.6, 1.1, 1] }
              : undefined
          }
          transition={{ duration: 0.35 }}
        >
          <Icon size={20} strokeWidth={2.5} aria-hidden />
        </motion.span>

        {/* `text-body`, not `text-body-s`: the scale reserves 13px for CONTROL labels and dense
            secondary lines. This is the sentence the user has four seconds to read, and it is the
            only place the app reports what a mutation did. The Undo beside it stays at 13 — that
            one is a control label. */}
        <span className="text-body flex-1 text-text-1">
          {undone ? t('common.undone') : toast.message}
        </span>

        {toast.onUndo && !undone ? (
          <button
            type="button"
            onClick={() => {
              toast.onUndo?.();
              // D — the toast morphs into its own confirmation instead of vanishing and
              // leaving the user unsure the undo landed.
              if (variant === 'D') setUndone(true);
              else onDismiss(toast.id);
            }}
            className="text-body-s min-h-[var(--target-min)] cursor-pointer px-2 text-accent outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {t('common.undo')}
          </button>
        ) : null}

        <button
          type="button"
          aria-label={t('common.dismiss')}
          onClick={() => onDismiss(toast.id)}
          className="inline-flex size-[var(--target-min)] shrink-0 cursor-pointer items-center justify-center rounded-chip text-text-3 outline-none hover:text-text-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <X size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {/* The hairline shows the remaining time, and pauses on hover so a toast cannot vanish
          from under a cursor that is reading it.
          It used to be the B variant's decoration. It is not decoration: the toast is also the
          undo window, the dismiss timer above runs at the same 4s in every variant, and an undo
          offer with no visible countdown is an offer the user cannot judge. The other four
          variants shipped that window blind, so the countdown is now unconditional — the
          variants differ in how the toast ENTERS and how the icon behaves, not in whether the
          user can see how long they have. */}
      {/*
        ═══ NOT RENDERED AT ALL UNDER REDUCED MOTION ══════════════════════════════════════════
        `animation: 'none'` leaves the bar at its start state — full width, static, forever — so a
        countdown reads as permanently 100%: the one thing it must never say. DESIGN §7 #41 is
        explicit that reduced motion COLLAPSES a duration and does not remove the state change,
        and a frozen progress bar removes it while looking like it did not.

        This defect reached one style variant before; making the bar unconditional would have
        taken it to all five. A countdown nobody can see is better than one that lies, and the
        toast still dismisses on the same timer either way.
      */}
      {motionSafe ? (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent"
          style={{
            animation: 'toast-timer 4s linear forwards',
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      ) : null}
    </motion.div>
  );
}

/* ══ E16 — Progress and ring ════════════════════════════════════════════════════════════════ */

/**
 * What the bar is reporting, beyond how far along it is.
 *
 * `running` covers both "in progress" and "finished" — finished is `value >= 100` and needs no
 * second source of truth. The other two are things a percentage cannot express: work in flight
 * with no known fraction, and work that FAILED. A progress bar with no failure state leaves a
 * stalled upload sitting at 62% forever, which is the shape of the bug, not a missing nicety.
 */
export type ProgressState = 'running' | 'busy' | 'error';

const MILESTONES = [25, 50, 75, 100] as const;

/**
 * The stripe period for variant B, in the axis the gradient is measured along.
 *
 * `stripe-flow` (index.css) shifts `background-position` by 32px horizontally. At 45° that is
 * 32·cos45° across the stripes, so one light+dark pair has to be exactly that wide or the pattern
 * jumps once per loop — a "still working" texture that stutters reads as a stall.
 */
const STRIPE = 32 * Math.SQRT1_2;

/**
 * E — the ramp itself, drawn once across the FULL track.
 *
 * The variant used to compute a single flat colour for the current percentage and paint the fill
 * with it. That is a colour ramp you can only read by remembering what the bar looked like a
 * moment ago: at 45% it is a hair off `--accent`, which is what A, B and C are painted with, so
 * five tiles side by side showed four identical bars and a ring.
 *
 * Drawn as a gradient the whole width of the track instead, the same fact becomes spatial — the
 * colour under any point of the bar is the colour of THAT percentage, so the fill carries the
 * distance already travelled and the dimmed remainder shows where it is going. Nothing has to be
 * remembered, and it is legible in a still screenshot.
 *
 * The stops are the three semantic tokens the system already ranks in this order — `--info` for
 * "started", `--accent` for "under way", `--success` for "done" — so the end of the ramp and the
 * completion colour every other variant lands on are the same value, not a lookalike.
 */
const RAMP = 'linear-gradient(90deg, var(--info), var(--accent) 50%, var(--success))';

export function Progress({
  value,
  label,
  state = 'running',
}: {
  value: number;
  label: string;
  state?: ProgressState;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E16');
  const motionSafe = useMotionSafe();
  const pct = Math.max(0, Math.min(100, value));
  const done = state === 'running' && pct >= 100;

  // D counts from where it was, not from zero: a ring that rewinds to 0 and climbs again on every
  // update reads as the number being recalculated. Read during render, committed after it.
  const previous = useRef(pct);
  const from = previous.current;
  useEffect(() => {
    previous.current = pct;
  }, [pct]);

  /**
   * E — "Color-ramp": the fill travels info → accent → success across the whole range, so how far
   * along it is can be read from the colour alone, with the number covered. The other variants
   * carry the accent and only change tone for a verdict.
   */
  const ramp =
    pct < 50
      ? `color-mix(in oklab, var(--info), var(--accent) ${pct * 2}%)`
      : `color-mix(in oklab, var(--accent), var(--success) ${(pct - 50) * 2}%)`;

  const fill =
    state === 'error'
      ? 'var(--danger)'
      : variant === 'E'
        ? ramp
        : done
          ? 'var(--success)'
          : 'var(--accent)';

  // A busy bar has no fraction to report, so it must not claim one.
  const bar = {
    role: 'progressbar',
    'aria-valuenow': state === 'busy' ? undefined : pct,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-label': label,
  } as const;

  const grow = motionSafe ? 'width var(--duration-slow) var(--ease-standard)' : 'none';

  /**
   * The verdict glyph — shared by all five, because failing is not a style choice.
   *
   * Spinner / tick / warning triangle: the ICON changes, and the tone follows it rather than
   * carrying the message alone.
   */
  const badge =
    state === 'busy' ? (
      <span role="status" aria-label={t('common.loading')} className="inline-flex text-text-2">
        <Loader2 size={20} strokeWidth={2.5} aria-hidden className={motionSafe ? 'animate-spin' : undefined} />
      </span>
    ) : state === 'error' ? (
      <span
        role="status"
        aria-label={t('auth.errors.generic')}
        className="inline-flex size-6 items-center justify-center rounded-chip bg-danger text-on-danger"
      >
        <TriangleAlert size={14} strokeWidth={2.5} aria-hidden />
      </span>
    ) : done ? (
      <motion.span
        role="status"
        aria-label={t('home.done')}
        className="inline-flex size-6 items-center justify-center rounded-chip bg-success text-on-success"
        initial={motionSafe ? { scale: 0.4 } : false}
        animate={{ scale: 1 }}
        transition={SPRING.tight}
      >
        <Check size={16} strokeWidth={3} aria-hidden />
      </motion.span>
    ) : null;

  // A failed bar shakes once. Reduced motion drops the travel; the danger fill and the warning
  // glyph above are what actually carry the state, and they stay.
  const shake = { x: state === 'error' && motionSafe ? [0, -6, 6, -4, 0] : 0 };
  const shakeTransition = { duration: motionSafe ? secs(DUR_MS.slow) : 0, ease: EASE_STANDARD };

  /* D — "Ring-odometer": the only variant that is not a bar, and the one the nutrition and
     rest-timer screens will use. The digits ROLL — `CountUp` is the odometer this project already
     built and documented as "E16-D", and which E16-D was not using — and at the end the number is
     replaced by the glyph, because "100%" and "done" are the same fact told twice. */
  if (variant === 'D') {
    const r = 42;
    const c = 2 * Math.PI * r;
    return (
      <motion.div
        {...bar}
        className="relative inline-grid place-items-center"
        animate={shake}
        transition={shakeTransition}
      >
        <svg viewBox="0 0 100 100" className="size-24 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={8} />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={fill}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={c}
            // A busy ring has no arc to draw; the spinner in the middle is the whole message.
            strokeDashoffset={state === 'busy' ? c : c - (c * pct) / 100}
            style={{
              transition: motionSafe ? 'stroke-dashoffset var(--duration-slow) var(--ease-standard)' : 'none',
            }}
          />
        </svg>
        <span className="absolute inline-flex items-center justify-center">
          {badge ?? (
            <span className="text-title-2 tabular-nums text-text-1">
              <CountUp from={from} to={pct} duration={DUR_MS.slow} />%
            </span>
          )}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div className="w-full" animate={shake} transition={shakeTransition}>
      <div className="flex w-full items-center gap-3">
        <div className="min-w-0 flex-1">
          {/* A — "Spring-fill": the fill is driven by a SPRING, not a linear tween, so it
              overshoots its target and settles back. `--shadow-glow` was the whole of this variant
              before, and that token is `none` in four of the five packs — the variant rendered a
              plain bar almost everywhere. The knob makes the physics readable at a glance instead
              of only in motion. */}
          {variant === 'A' ? (
            <div className="relative w-full py-1">
              <div {...bar} className="h-2 w-full overflow-hidden rounded-chip bg-surface-2">
                <motion.div
                  className="h-full rounded-chip"
                  style={{ background: fill, transformOrigin: 'left' }}
                  // `initial={false}` on both layers: without it Motion reads the computed value —
                  // scaleX 1, and `left: auto` for the knob — and the bar plays a backwards sweep
                  // from full on its very first frame. A progress bar has no entrance.
                  initial={false}
                  animate={{ scaleX: state === 'busy' ? 0 : pct / 100 }}
                  transition={motionSafe ? SPRING.soft : { duration: 0 }}
                />
              </div>
              <motion.span
                aria-hidden
                className="absolute top-1/2 size-4 rounded-chip border-[length:var(--border-width)] border-[var(--surface-0)]"
                style={{ background: fill, x: '-50%', y: '-50%' }}
                initial={false}
                animate={{ left: `${state === 'busy' ? 0 : pct}%` }}
                transition={motionSafe ? SPRING.soft : { duration: 0 }}
              />
            </div>
          ) : null}

          {/* B — "Striped-flow": a diagonal texture that keeps moving while the width does not,
              which is the only way a bar can say "still working" rather than "stuck at 62%". */}
          {variant === 'B' ? (
            <div {...bar} className="h-3 w-full overflow-hidden rounded-chip bg-surface-2">
              <div
                className="h-full rounded-chip"
                style={{
                  // Busy has no fraction, so the stripes run the full width instead of lying.
                  width: state === 'busy' ? '100%' : `${pct}%`,
                  backgroundImage: `repeating-linear-gradient(45deg, ${fill} 0 ${STRIPE / 2}px, color-mix(in oklab, ${fill} 62%, var(--surface-0)) ${STRIPE / 2}px ${STRIPE}px)`,
                  transition: grow,
                  animation: motionSafe ? 'stripe-flow var(--duration-ambient) linear infinite' : undefined,
                }}
              />
            </div>
          ) : null}

          {/* C — "Milestone-pop": the quarters are marked ON the track and each chip POPS as it is
              crossed. It used to swap a number for a tick with no motion at all, which made the
              variant a static legend rather than a reward. */}
          {variant === 'C' ? (
            <>
              <div {...bar} className="relative h-2 w-full overflow-hidden rounded-chip bg-surface-2">
                <div
                  className="h-full rounded-chip"
                  style={{ width: `${state === 'busy' ? 0 : pct}%`, background: fill, transition: grow }}
                />
                {MILESTONES.slice(0, 3).map((m) => (
                  <span key={m} aria-hidden className="absolute inset-y-0 w-px bg-surface-0" style={{ left: `${m}%` }} />
                ))}
              </div>
              <div className="mt-2 flex justify-between">
                {MILESTONES.map((m) => {
                  const reached = state !== 'busy' && pct >= m;
                  return (
                    <motion.span
                      // Remounted when it flips, so the pop plays on the crossing and only then.
                      key={`${m}-${reached}`}
                      className={cn(
                        'text-micro inline-flex size-6 items-center justify-center rounded-chip tabular-nums',
                        reached ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-text-3',
                      )}
                      initial={motionSafe ? { scale: 0.4 } : false}
                      animate={{ scale: 1 }}
                      transition={SPRING.tight}
                    >
                      {/* Lucide, not a ✓ character: the Bible bans glyphs standing in for icons,
                          and a dingbat next to Lucide strokes reads as two icon families. */}
                      {reached ? <Check size={14} strokeWidth={3} aria-hidden /> : m}
                    </motion.span>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* E — "Color-ramp". Two layers of the SAME gradient: the dimmed one is the whole route,
              the clipped one is how much of it has been walked. The number is set in the colour
              under the leading edge, so the pairing is legible at a glance and the colour is never
              the only carrier of the value. */}
          {variant === 'E' ? (
            <div className="flex w-full items-center gap-3">
              <div
                {...bar}
                className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-chip bg-surface-2"
              >
                {/* Where the bar is GOING. A ramp with its destination hidden is just a fill. */}
                <span aria-hidden className="absolute inset-0 opacity-30" style={{ background: RAMP }} />
                {/* Where it IS. Revealed with a clip rather than sized with a width, because a
                    width would squeeze the whole gradient into the fill and every percentage
                    would end on `--success` — the ramp has to stay anchored to the TRACK for the
                    colour to mean a position. Busy clips to nothing: no fraction is known, so the
                    dimmed route and the spinner are the entire message. */}
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background: state === 'error' ? fill : RAMP,
                    clipPath: `inset(0 ${100 - (state === 'busy' ? 0 : pct)}% 0 0)`,
                    transition: motionSafe
                      ? 'clip-path var(--duration-slow) var(--ease-standard)'
                      : 'none',
                  }}
                />
              </div>
              {/* A busy bar knows no percentage and must not print one; the spinner badge beside
                  it is already saying what is true. */}
              {state === 'busy' ? null : (
                <span className="text-title-3 tabular-nums" style={{ color: fill }}>
                  {pct}%
                </span>
              )}
            </div>
          ) : null}
        </div>

        {badge}
      </div>
    </motion.div>
  );
}

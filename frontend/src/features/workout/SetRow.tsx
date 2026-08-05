import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Trophy, Undo2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { useElementVariant } from '../../ui/feedback/ElementStyleProvider';
import { useMotionSafe } from '../../ui/feedback/useMotionSafe';
import type { LogSet, PrRecord } from './useWorkout';

export interface SetRowProps {
  set: LogSet;
  /** What this client did on this set last time, or null on a first encounter. */
  previous?: { weight_kg: number | null; reps: number | null } | null;
  onCheck: (values: { weight: number | null; reps: number | null }) => Promise<PrRecord[]>;
  /** Undo a recorded set. Absent means the row simply offers no undo. */
  onUndo?: () => Promise<void>;
  /** E22-E: this row is the one the finished rest handed over to. */
  autoFocus?: boolean;
  disabled?: boolean;
}

/** How long variant B asks the lifter to hold before the set is recorded. */
const HOLD_MS = 550;
/** Variant C: how far a drag has to travel for one weight step, and how big that step is. */
const SWIPE_PX_PER_STEP = 18;
const SWIPE_STEP_KG = 2.5;
/** Variant E: how long the undo pill stays offered. */
const UNDO_MS = 6000;

/**
 * E21 — the set-check row. The single most-used control in the product: a lifter touches it once
 * per set, mid-effort, with shaking hands.
 *
 * 56 px tall per the Bible. That is BELOW the 44 px floor for the row itself but the row is not the
 * target — the check button inside it is, and it is a full 56 × 56. The number fields are 56 tall
 * too. Nothing here is a small target.
 *
 * ALL FIVE VARIANTS, selected by `element_style_config` through `useElementVariant`:
 *
 *   A · Tap-complete    — one tap records. The baseline.
 *   B · Hold-to-confirm — a short hold records, so a knuckle brushing the screen mid-set does not.
 *   C · Swipe-weight    — drag the row horizontally to trim the weight without opening a keyboard.
 *   D · PR-flash        — the row flashes gold and keeps a badge when the check earns a record.
 *   E · Undo-pill       — a pill offers to take the set back for a few seconds after recording.
 *
 * D is not exclusive: the flash fires under every variant, because a record is a fact about the
 * lift rather than a property of how the row was pressed. It lives in state rather than an
 * animation so a refetch can neither replay the celebration nor erase it.
 */
export function SetRow({ set, previous, onCheck, onUndo, autoFocus, disabled }: SetRowProps) {
  const { t } = useTranslation();
  const variant = useElementVariant('E21');
  const motionSafe = useMotionSafe();
  const done = set.completed_at != null;

  // Seeded from the row, then owned by the input. A completed set shows what was recorded; a
  // pending one shows the target as a placeholder, never as a value — pre-filling the target is
  // how a lifter accidentally logs the prescription instead of what they did.
  const [weight, setWeight] = useState(() => (set.entry_value ?? '').toString());
  const [reps, setReps] = useState(() => (set.reps ?? '').toString());
  const [records, setRecords] = useState<PrRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashing, setFlashing] = useState(false);

  // ── variant B state ──────────────────────────────────────────────────────────────────────────
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  // ── E22-E: the row the finished rest handed over to ──────────────────────────────────────────
  //
  // Scrolled into view but NOT focused. Focusing would open the numeric keyboard, which on a phone
  // covers the set list — so a lifter who set the phone down during a 90-second rest would come
  // back to a keyboard over the rows they need to read. The row is brought to them; typing stays
  // their decision.
  const rowRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!autoFocus || done) return;
    rowRef.current?.scrollIntoView({ block: 'nearest', behavior: motionSafe ? 'smooth' : 'auto' });
  }, [autoFocus, done, motionSafe]);

  // ── variant E state ──────────────────────────────────────────────────────────────────────────
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoOffered, setUndoOffered] = useState(false);
  const [undoing, setUndoing] = useState(false);

  // Every timer this row owns, cleared on unmount. A row unmounts whenever the lifter switches
  // exercise, which is constantly, and a `setState` after that is a warning at best and a leak of
  // one timer per switch at worst.
  useEffect(
    () => () => {
      for (const ref of [flashTimer, holdTimer, undoTimer]) {
        if (ref.current) clearTimeout(ref.current);
      }
    },
    [],
  );

  const submit = async () => {
    if (busy || done) return;
    setBusy(true);
    try {
      const earned = await onCheck({
        weight: weight === '' ? null : Number(weight),
        reps: reps === '' ? null : Number(reps),
      });
      if (earned.length) {
        setRecords(earned);
        setFlashing(true);
        // The flash is a moment, the badge is permanent. Separating them means a refetch cannot
        // replay the celebration but also cannot erase the fact.
        flashTimer.current = setTimeout(() => setFlashing(false), 1400);
      }
      if (variant === 'E' && onUndo) {
        setUndoOffered(true);
        undoTimer.current = setTimeout(() => setUndoOffered(false), UNDO_MS);
      }
    } finally {
      setBusy(false);
    }
  };

  // ── variant B: hold to confirm ───────────────────────────────────────────────────────────────
  //
  // The hold exists because the check button sits directly under the hand that is still holding a
  // bar. A tap is the right gesture for a deliberate press and the wrong one for a knuckle.
  //
  // Pointer events, not touch events: the same code then covers a mouse, a stylus and a finger.
  // `pointercancel` matters as much as `pointerup` — the browser fires it when a scroll takes over
  // the gesture, and without it a hold that turned into a scroll would still record the set.
  const startHold = () => {
    if (busy || done || disabled) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      void submit();
    }, HOLD_MS);
  };

  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  };

  // ── variant C: swipe the weight ──────────────────────────────────────────────────────────────
  //
  // Dragging the row nudges the weight in plate-sized steps, so trimming 2.5 kg off a prescription
  // does not mean opening a numeric keyboard over the set list mid-rest.
  //
  // `touch-action: pan-y` is what makes this survivable: it hands vertical gestures to the scroll
  // container and keeps only horizontal ones. Without it the row would swallow the scroll, and the
  // set list is the one thing on this screen that is allowed to scroll.
  const dragFrom = useRef<{ x: number; base: number } | null>(null);

  const onDragStart = (e: React.PointerEvent) => {
    if (variant !== 'C' || done || disabled) return;
    dragFrom.current = { x: e.clientX, base: weight === '' ? (set.target_weight_kg ?? 0) : Number(weight) };
  };

  const onDragMove = (e: React.PointerEvent) => {
    const from = dragFrom.current;
    if (!from) return;
    const steps = Math.trunc((e.clientX - from.x) / SWIPE_PX_PER_STEP);
    if (steps === 0) return;
    // Clamped at zero. A negative weight is not a lighter lift, it is a corrupt row, and the server
    // would reject it — but the field should never show it in the first place.
    const next = Math.max(0, from.base + steps * SWIPE_STEP_KG);
    // Rounded to the step so a long drag cannot accumulate a value like 47.49999999999999.
    setWeight(String(Math.round(next / SWIPE_STEP_KG) * SWIPE_STEP_KG));
  };

  const onDragEnd = () => {
    dragFrom.current = null;
  };

  // ── variant E: the undo pill ─────────────────────────────────────────────────────────────────
  const undo = async () => {
    if (!onUndo || undoing) return;
    setUndoing(true);
    try {
      await onUndo();
      setUndoOffered(false);
      // The badge goes with the set. Keeping it would leave the row claiming a record for a lift
      // that no longer exists — and the server has already withdrawn the record itself.
      setRecords([]);
    } finally {
      setUndoing(false);
    }
  };

  const prevLabel = previous
    ? [previous.weight_kg != null ? `${previous.weight_kg} kg` : null, previous.reps != null ? `× ${previous.reps}` : null]
        .filter(Boolean)
        .join(' ')
    : '—';

  const holdProps =
    variant === 'B'
      ? {
          onPointerDown: startHold,
          onPointerUp: cancelHold,
          onPointerLeave: cancelHold,
          onPointerCancel: cancelHold,
          // A keyboard cannot hold. Enter and Space record directly rather than leaving this
          // variant unusable without a pointer — the gesture guards against an accidental TOUCH,
          // and a deliberate key press is not one.
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              void submit();
            }
          },
        }
      : { onClick: () => void submit() };

  return (
    <li
      ref={rowRef}
      className={cn(
        'relative grid h-14 grid-cols-[2.5rem_5rem_1fr_1fr_3.5rem] items-center gap-2 rounded-card px-2',
        'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        done ? 'bg-success/10' : 'bg-surface-1',
        flashing && 'bg-warning/25 ring-2 ring-[var(--warning)]',
        // Only variant C claims horizontal gestures, and only while the row is still pending.
        variant === 'C' && !done && 'touch-pan-y select-none',
        // The handover is announced by a ring, not by a jump: nothing moves under the thumb.
        autoFocus && !done && 'ring-2 ring-[var(--accent)]',
      )}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
    >
      <span className="text-body-s text-center tabular-nums text-text-2">{set.set_index}</span>

      {/* The PREVIOUS column. The single most useful number on the screen: it is what turns a set
          into a decision instead of a guess. */}
      <span className="text-caption truncate tabular-nums text-text-3" title={prevLabel}>
        {prevLabel}
      </span>

      <input
        inputMode="decimal"
        aria-label={t('workout.weight')}
        placeholder={set.target_weight_kg != null ? String(set.target_weight_kg) : t('workout.kg')}
        value={weight}
        disabled={done || disabled}
        onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))}
        className={cn(
          'h-14 w-full rounded-field bg-surface-2 px-2 text-center text-body tabular-nums',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          'disabled:opacity-60',
        )}
      />
      <input
        inputMode="numeric"
        aria-label={t('workout.reps')}
        placeholder={set.target_reps != null ? String(set.target_reps) : t('workout.reps')}
        value={reps}
        disabled={done || disabled}
        onChange={(e) => setReps(e.target.value.replace(/[^0-9]/g, ''))}
        className={cn(
          'h-14 w-full rounded-field bg-surface-2 px-2 text-center text-body tabular-nums',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          'disabled:opacity-60',
        )}
      />

      <Pressable
        shape="icon"
        variant={done ? 'primary' : 'secondary'}
        aria-label={done ? t('workout.recorded') : variant === 'B' ? t('workout.holdToCheck') : t('workout.check')}
        aria-pressed={done}
        busy={busy}
        disabled={done || disabled}
        className={cn(
          'relative size-14 overflow-hidden',
          // The hold's own feedback: the button fills over HOLD_MS so the lifter can see the
          // gesture being accepted. Under reduced motion it simply darkens — the information is
          // "this is registering", and that does not require the sweep.
          holding && motionSafe && 'after:absolute after:inset-0 after:origin-left after:bg-[var(--accent)]/30 after:animate-[hold-fill_550ms_linear_forwards]',
          holding && !motionSafe && 'bg-[var(--accent)]/20',
        )}
        {...holdProps}
      >
        {records.length ? (
          <Trophy className="size-icon-m" aria-hidden />
        ) : (
          <Check className="size-icon-m" aria-hidden />
        )}
      </Pressable>

      {/* Variant E — the undo pill. It overlays the row rather than displacing anything: the set
          list must not reflow when a set is recorded, or every row below it moves under the thumb
          that is about to tap the next one. */}
      {variant === 'E' && undoOffered && onUndo ? (
        <div className="absolute inset-y-1 right-1 flex items-center">
          <Pressable
            shape="chip"
            density="compact"
            variant="secondary"
            busy={undoing}
            onClick={() => void undo()}
            className="shadow-[var(--shadow-overlay)]"
          >
            <Undo2 className="size-icon-s" aria-hidden />
            {t('workout.undo')}
          </Pressable>
        </div>
      ) : null}

      {records.length ? (
        // Announced, not just shown. A lifter looking at the bar rather than the phone still hears
        // that they beat something.
        <span role="status" className="sr-only">
          {t('workout.newRecord', { kind: t(`workout.record.${records[0].kind}`) })}
        </span>
      ) : null}
    </li>
  );
}

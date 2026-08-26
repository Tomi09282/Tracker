import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock, Trophy, Undo2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatMeasure } from '../../lib/measure';
import { Pressable } from '../../ui/primitives/Pressable';
import { useElementVariant } from '../../ui/feedback/ElementStyleProvider';
import { useMotionSafe } from '../../ui/feedback/useMotionSafe';
import { ApiError, type LogSet, type PrRecord } from './useWorkout';

/**
 * What the row needs back from a check.
 *
 * `queued` is not a detail: a check that only reached the outbox leaves `completed_at` null, so the
 * row is byte-for-byte a row that was never checked. Without this flag the outcome is invisible and
 * the row goes silently pending — the one failure this screen must never have.
 */
export interface CheckResult {
  records: PrRecord[];
  /** The network was gone; the write is in the outbox and has NOT reached the server yet. */
  queued: boolean;
}

export interface SetRowProps {
  set: LogSet;
  /** What this client did on this set last time, or null on a first encounter. */
  previous?: { weight_kg: number | null; reps: number | null } | null;
  onCheck: (values: { weight: number | null; reps: number | null }) => Promise<CheckResult>;
  /** Undo a recorded set. Absent means the row simply offers no undo. */
  onUndo?: () => Promise<void>;
  /** E22-E: this row is the one the finished rest handed over to. */
  autoFocus?: boolean;
  /**
   * This is the set being worked right now — the first one still to do.
   *
   * Separate from `autoFocus` on purpose. `autoFocus` is the HANDOVER event (a rest just ended,
   * scroll this row into view) and fires once; `active` is a standing fact about the list and is
   * what draws the ring, the circled index and the filled check. Deriving the ring from the
   * handover left every row flat until a rest happened to end.
   */
  active?: boolean;
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
 * THE DECIMAL SEPARATOR, ON THE ONE FIELD NOBODY LOOKS AT WHILE USING IT.
 *
 * The weight field stripped everything but digits and a DOT. A Hungarian numeric keypad offers a
 * COMMA, and both mockups draw `62,5`, so a lifter typing what they read had the separator deleted
 * and the field silently became `625` — a ten-fold weight, mid-set, on a row the schema then
 * freezes. That is the same class of failure as tapping the wrong row, and it is quieter.
 *
 * So: accept both separators on input and normalise on the way to `Number`. Keeping only the FIRST
 * separator matters as much as accepting the comma — `6,2,5` parses to NaN, which JSON-serialises
 * to `null` and would post a set with no weight at all.
 */
const sanitizeDecimal = (raw: string): string => {
  const kept = raw.replace(/[^0-9.,]/g, '');
  const first = kept.search(/[.,]/);
  if (first === -1) return kept;
  return kept.slice(0, first + 1) + kept.slice(first + 1).replace(/[.,]/g, '');
};

/**
 * `''` means "not entered", which is not the same claim as `0`. Whitespace covers a grouping mark.
 * A lone separator resolves to null rather than NaN: NaN JSON-serialises to `null` anyway, and the
 * difference matters at the call sites that branch on it before it ever reaches the wire.
 */
const parseDecimal = (raw: string): number | null => {
  if (raw === '') return null;
  const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * The row's column geometry, exported so the list HEADER above it reads from the same string.
 * Two copies of a five-column track is how `#` ends up over `Előző`, and nothing fails when it
 * does — it just looks wrong to everyone except the person who changed one of them.
 */
export const SET_ROW_COLS = 'grid-cols-[2rem_5rem_1fr_1fr_3.5rem]';

/**
 * E21 — the set-check row. The single most-used control in the product: a lifter touches it once
 * per set, mid-effort, with shaking hands.
 *
 * 56 px tall per the Bible, and the row is not the target — the controls inside it are. The check
 * button sizes itself from `--control-h` (44 px, 48 in the Solar pack) and the two number fields
 * are 44. Nothing here is a small target, and the 6 px of air left over on each edge is what stops
 * four stacked rows reading as a spreadsheet.
 *
 * NOTHING IN THIS ROW MAY CHANGE ITS HEIGHT. Every state that has something extra to say — the
 * record caption, the withdrawn chip, the hold instruction, an error chip, the undo pill — says it
 * in an ABSOLUTE overlay. A row that grows pushes every row below it under a thumb that is already
 * moving toward the next check button, and the failure mode is recording a lift that did not
 * happen on a row the schema then freezes.
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
export function SetRow({ set, previous, onCheck, onUndo, autoFocus, active, disabled }: SetRowProps) {
  const { t, i18n } = useTranslation();
  const variant = useElementVariant('E21');
  const motionSafe = useMotionSafe();
  // THREE STATES, not two. A voided set is neither pending nor done:
  //   - It cannot be shown as DONE — the undo already removed it from the session totals, so a
  //     green check puts the screen at odds with the record. That is exactly what shipped: the row
  //     kept its check after an undo while `total_sets` had already dropped to 3 of 4.
  //   - It cannot be shown as PENDING either — `trg_log_set_void_terminal` makes a void terminal
  //     and `recordSetTx` requires `voided_at IS NULL`, so tapping it would earn a 409. Offering a
  //     control that cannot succeed is worse than offering none.
  // So it renders as WITHDRAWN, and says so.
  const voided = set.voided_at != null;
  const done = set.completed_at != null && !voided;

  // Seeded from the row, then owned by the input. A completed set shows what was recorded; a
  // pending one shows the target as a placeholder, never as a value — pre-filling the target is
  // how a lifter accidentally logs the prescription instead of what they did.
  //
  // The recorded value goes through the app's one-decimal formatter rather than `String(v)`: the
  // mockups draw `62,5`, and `62.5` on a Hungarian screen is the same number written in a language
  // the rest of the row is not written in. The seed only ever produces a formatted string on a row
  // that is already `done`/`voided` — those inputs are disabled and `submit()` returns early on
  // them — so the formatted form is never a value this row parses back.
  const [weight, setWeight] = useState(() =>
    set.entry_value != null ? formatMeasure(set.entry_value, i18n.language) : '',
  );
  const [reps, setReps] = useState(() => (set.reps ?? '').toString());
  // THE TROPHY IS A FACT ABOUT THE SESSION, NOT A THING THAT HAPPENED WHILE THIS ROW WAS MOUNTED.
  //
  // This used to be state seeded empty and written only by the check response — and the row
  // unmounts on every exercise switch. So leaving Fekvenyomás and coming back (or a reload, or an
  // app resume) redrew a record set as an ordinary done row: green fill, plain index, a check where
  // the mockup draws a trophy. The spec's wording is that the fact survives a refetch; it did not.
  //
  // Derived on every render rather than seeded once, because a mount-time seed also loses the
  // offline case: an outbox-queued check resolves with `records: []`, and when the outbox drains
  // and the refetch lands with `set.records` a seed never re-reads it. One expression fixes both.
  //
  // `voided ? []` is load-bearing: `hasRecord` also paints the row fill and the index ring, so a
  // stale `set.records` arriving alongside `voided_at` would draw a struck-through row in warning
  // colours. It also makes `undo()`'s local clear correct before the invalidation lands.
  const [earned, setEarned] = useState<PrRecord[]>([]);
  const records = voided ? [] : set.records?.length ? set.records : earned;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
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

  // The outbox drained and the refetch landed: the set is recorded, so the offline chip has nothing
  // left to say and would otherwise sit in danger colours on a green row. ONLY the offline one — a
  // conflict is still true after a refetch, and that is precisely when the lifter needs to read it.
  useEffect(() => {
    if (done) setFailed((f) => (f === 'offline' ? null : f));
  }, [done]);

  const submit = async () => {
    if (busy || done || voided) return;
    setBusy(true);
    setFailed(null);
    try {
      const { records: justEarned, queued } = await onCheck({
        weight: parseDecimal(weight),
        reps: reps === '' ? null : Number(reps),
      });
      // OFFLINE IS NOT AN EXCEPTION HERE, WHICH IS WHY IT NEEDS SAYING OUT LOUD. A network failure
      // is caught one layer down and turned into an outbox entry, so this promise RESOLVES — the
      // catch below never runs, `completed_at` stays null because the refetch is offline too, and
      // the row rendered exactly like one nobody had touched. The chip is the whole difference
      // between "queued" and "you did not check that set".
      if (queued) setFailed('offline');
      if (justEarned.length) {
        setEarned(justEarned);
        setFlashing(true);
        // The flash is a moment, the badge is permanent. Separating them means a refetch cannot
        // replay the celebration but also cannot erase the fact.
        flashTimer.current = setTimeout(() => setFlashing(false), 1400);
      }
      if (variant === 'E' && onUndo) {
        setUndoOffered(true);
        undoTimer.current = setTimeout(() => setUndoOffered(false), UNDO_MS);
      }
    } catch (err) {
      // A CHECK THAT FAILS MUST SAY SO. Without this the row had try/finally and no catch: the
      // spinner stopped, the row stayed pending, and the lifter — mid-set, not looking closely —
      // had no way to tell a recorded set from a lost one. That is the single worst thing this
      // screen could do quietly.
      //
      // 409 is its own message because it is not a failure to record, it is a REFUSAL to
      // overwrite: the set already carries different values, and the server returns them
      // precisely so the row can offer void-and-relog rather than a shrug.
      const status = err instanceof ApiError ? err.status : 0;
      setFailed(status === 409 ? 'conflict' : status === 0 ? 'offline' : 'failed');
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
    if (busy || done || voided || disabled) return;
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
    if (variant !== 'C' || done || voided || disabled) return;
    // Through the same parser as the check: the field may now legitimately hold `62,5`, and a bare
    // `Number()` on that is NaN — a drag would then start from nothing and write NaN back.
    dragFrom.current = { x: e.clientX, base: parseDecimal(weight) ?? set.target_weight_kg ?? 0 };
  };

  const onDragMove = (e: React.PointerEvent) => {
    const from = dragFrom.current;
    if (!from) return;
    const steps = Math.trunc((e.clientX - from.x) / SWIPE_PX_PER_STEP);
    if (steps === 0) return;
    // Clamped at zero. A negative weight is not a lighter lift, it is a corrupt row, and the server
    // would reject it — but the field should never show it in the first place.
    const next = Math.max(0, from.base + steps * SWIPE_STEP_KG);
    // Rounded to the step so a long drag cannot accumulate a value like 47.49999999999999, then
    // written in the reader's own notation — the drag feeds the same field the lifter types into,
    // and a dot appearing under a thumb on a screen where every other weight carries a comma reads
    // as a different number.
    setWeight(formatMeasure(Math.round(next / SWIPE_STEP_KG) * SWIPE_STEP_KG, i18n.language));
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
      // that no longer exists — and the server has already withdrawn the record itself. The
      // `voided ?` guard above covers the server's answer; this covers the window before it lands.
      setEarned([]);
    } finally {
      setUndoing(false);
    }
  };

  const prevLabel = previous
    ? [previous.weight_kg != null ? `${previous.weight_kg} kg` : null, previous.reps != null ? `× ${previous.reps}` : null]
        .filter(Boolean)
        .join(' ')
    : '—';

  const hasRecord = records.length > 0;
  // A voided row is never "the one you are on": the void is terminal, so pointing the thumb at it
  // would be pointing it at a control that cannot succeed.
  const isActive = Boolean(active) && !done && !voided;

  /* Both number fields, identically. 44px tall inside a 56px row — the floor is met and the row
     still has 6px of air top and bottom, which is what stops four rows reading as a spreadsheet. */
  const fieldClass = cn(
    'h-11 w-full rounded-field bg-surface-2 px-2 text-center text-body tabular-nums text-text-1',
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
    'placeholder:text-text-3 disabled:opacity-70',
  );

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
        'relative grid h-14 items-center gap-2 rounded-card px-2',
        SET_ROW_COLS,
        'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        // A pending row has NO fill. Four tinted rows in a row is a paint chart; the only rows
        // that earn a colour are the ones whose state the lifter has to read at arm's length.
        done && 'bg-success-subtle',
        // The record keeps its fill and ring for good, not just for the flash: a refetch must not
        // be able to erase the fact. The flash below is the moment; this is the record.
        hasRecord && 'bg-warning-subtle ring-2 ring-[var(--warning-border)]',
        flashing && 'ring-2 ring-[var(--warning)]',
        // WITHDRAWN, and it says so. The rule runs the full width of the row rather than striking
        // only the text, so the state is legible as a SHAPE — which is the only way it works for a
        // colour-blind lifter, and the only way it works at all in a gym mirror.
        // (Tailwind 4 supplies `content: ""` on the `before:` variant itself, so the rule needs a
        // box and a colour and nothing else.)
        voided && 'text-text-3 before:absolute before:inset-x-3 before:top-1/2 before:h-px before:bg-text-3',
        // Only variant C claims horizontal gestures, and only while the row is still pending.
        variant === 'C' && !done && !voided && 'touch-pan-y select-none',
        // The row the thumb is aimed at. A ring and a fill, never a size change: a row that grows
        // pushes every row below it under a thumb that is already moving.
        isActive && 'bg-accent-subtle ring-2 ring-[var(--accent)]',
      )}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
    >
      <span className="flex items-center justify-center">
        <span
          className={cn(
            'text-body-s inline-flex size-7 items-center justify-center rounded-chip tabular-nums text-text-2',
            hasRecord && 'border-[length:var(--border-width)] border-[var(--warning-border)] text-warning',
            isActive && 'border-[length:var(--border-width)] border-[var(--accent)] text-text-1',
          )}
        >
          {set.set_index}
        </span>
      </span>

      {/* The PREVIOUS column. The single most useful number on the screen: it is what turns a set
          into a decision instead of a guess. */}
      <span className={cn('text-caption truncate tabular-nums', voided ? 'text-text-3' : 'text-text-2')} title={prevLabel}>
        {prevLabel}
      </span>

      {/* THE LOCK IS NOT DECORATION. It says the value is frozen ON THE SERVER — not merely that
          this input happens to be read-only right now. Do not reuse it for a temporarily disabled
          field. */}
      <div className="relative">
        {done ? (
          <Lock aria-hidden className="size-icon-s pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-3" />
        ) : null}
        <input
          inputMode="decimal"
          aria-label={t('workout.weight')}
          placeholder={set.target_weight_kg != null ? String(set.target_weight_kg) : t('workout.kg')}
          value={weight}
          disabled={done || voided || disabled}
          onChange={(e) => setWeight(sanitizeDecimal(e.target.value))}
          className={cn(fieldClass, done && 'pl-7')}
        />
      </div>
      <input
        inputMode="numeric"
        aria-label={t('workout.reps')}
        placeholder={set.target_reps != null ? String(set.target_reps) : t('workout.reps')}
        value={reps}
        disabled={done || voided || disabled}
        onChange={(e) => setReps(e.target.value.replace(/[^0-9]/g, ''))}
        className={fieldClass}
      />

      {voided ? (
        // No check button at all. `trg_log_set_void_terminal` makes a void terminal, so a check
        // here would earn a 409 — and a control that cannot succeed is worse than no control.
        <span />
      ) : done ? (
        // A recorded set has no action left, so it is not a button. A disabled Pressable would
        // draw button chrome around a thing nobody can press, and `disabled:opacity-45` would
        // wash the one glyph carrying the state.
        <span className="flex items-center justify-center">
          <span className={cn('inline-flex size-11 items-center justify-center', hasRecord ? 'text-warning' : 'text-success')}>
            {hasRecord ? <Trophy className="size-icon-m" aria-hidden /> : <Check className="size-icon-m" aria-hidden />}
          </span>
          <span className="sr-only">{t('workout.recorded')}</span>
        </span>
      ) : (
        <Pressable
          shape="icon"
          variant={isActive ? 'primary' : 'secondary'}
          aria-label={variant === 'B' ? t('workout.holdToCheck') : t('workout.check')}
          busy={busy}
          disabled={disabled}
          // The fill is driven FROM `HOLD_MS`, not from a second copy of it. It used to read
          // `animate-[hold-fill_550ms_...]` while the timer read `const HOLD_MS = 550` — two literals
          // that had to agree, with a comment in index.css asserting they did. Changing the timer
          // alone would have left the bar completing early, which teaches the lifter to let go before
          // the set is recorded: the exact failure that comment exists to warn about.
          style={{ '--hold-fill-ms': `${HOLD_MS}ms` } as CSSProperties}
          className={cn(
            'relative overflow-hidden',
            // The hold's own feedback: the button fills over HOLD_MS so the lifter can see the
            // gesture being accepted. Under reduced motion it simply darkens — the information is
            // "this is registering", and that does not require the sweep.
            holding && motionSafe && 'after:absolute after:inset-0 after:origin-left after:bg-accent-subtle after:animate-[hold-fill_var(--hold-fill-ms)_linear_forwards]',
            holding && !motionSafe && 'bg-accent-subtle',
          )}
          {...holdProps}
        >
          <Check className="size-icon-m" aria-hidden />
        </Pressable>
      )}

      {/* THE WITHDRAWN CHIP. Opacity and a rule alone are hard to tell from "merely disabled" at
          arm's length, so the state gets a word. It floats at the trailing end — where the check
          button would be — rather than taking a line of its own. */}
      {voided ? (
        <span className="text-caption absolute right-2 top-1/2 -translate-y-1/2 rounded-chip border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-1 px-3 py-1 text-text-2">
          {t('workout.withdrawn')}
        </span>
      ) : null}

      {/* Variant B's instruction, on the row it applies to and nowhere else. It straddles the row's
          bottom edge and the 8px gap below it, so it costs the layout nothing — the alternative was
          a taller active row, which moves every check button below it. */}
      {isActive && variant === 'B' ? (
        <span
          aria-hidden
          className="text-micro pointer-events-none absolute bottom-0 right-1 translate-y-1/2 rounded-chip bg-surface-2 px-2 text-text-3"
        >
          {t('workout.holdToCheck')}
        </span>
      ) : null}

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

      {hasRecord ? (
        // Announced AND, for the length of the flash, SHOWN. This was `sr-only` unconditionally:
        // the gold flash and the trophy told a sighted lifter that *something* happened, and the
        // one string that says WHAT was beaten was audible only to a screen reader. The peak of
        // the whole product was invisible to the people looking at it.
        //
        // It overlays the index and previous columns rather than taking a line of its own — the set
        // list must not reflow when a set is recorded, or every row below moves under the thumb —
        // and `pointer-events-none` keeps it clear of the undo pill on the other side of the row.
        // Past the flash window it returns to `sr-only`: the flash is the moment, the trophy on the
        // check button is the permanent fact.
        <span
          role="status"
          className={
            flashing
              ? cn(
                  // max-w-32, not 40: the grid is SET_ROW_COLS with gap-2 px-2, so at 375px each
                  // 1fr is ~60px and a 160px pill starting at 4px reached ~30px into the weight
                  // column — covering the number just entered, for the whole 1400ms flash.
                  //
                  // Solid, not `bg-warning-subtle`: the record ROW is already warning-subtle, so a
                  // subtle chip on it would be an announcement painted in the background colour.
                  'text-caption pointer-events-none absolute inset-y-1 left-1 flex max-w-32',
                  'items-center gap-tight rounded-chip bg-surface-1 px-2 text-warning',
                )
              : 'sr-only'
          }
        >
          <Trophy className="size-icon-s shrink-0" aria-hidden />
          <span className="truncate">
            {t('workout.newRecord', { kind: t(`workout.record.${records[0].kind}`) })}
          </span>
        </span>
      ) : null}

      {/* A FAILED CHECK, SAID OUT LOUD. `role="alert"` rather than `status`, because unlike a
          record this is something the lifter has to act on — and mid-set they are not watching the
          screen closely enough to notice a colour change.

          It overlays like the undo pill rather than displacing anything: the set list must not
          reflow when a check fails, or every row below shifts under the thumb that is about to
          retry. */}
      {failed ? (
        <div className="absolute inset-y-1 right-1 flex items-center gap-1" role="alert">
          <span className="text-caption rounded-chip bg-danger-subtle px-2 py-1 text-danger">
            {t(`workout.checkFailed.${failed}`)}
          </span>
          {/* A conflict is not retryable — the stored values differ, so re-sending the same request
              cannot help. Undo is the actual way forward, which is what the server's 409 is for. */}
          {failed === 'conflict' && onUndo ? (
            <Pressable shape="chip" density="compact" variant="secondary" busy={undoing} onClick={() => void undo()}>
              <Undo2 className="size-icon-s" aria-hidden />
              {t('workout.undo')}
            </Pressable>
          ) : (
            <Pressable shape="chip" density="compact" variant="secondary" onClick={() => void submit()}>
              {t('common.retry')}
            </Pressable>
          )}
        </div>
      ) : null}
    </li>
  );
}

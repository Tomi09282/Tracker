import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Trophy } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatMeasure } from '../../lib/measure';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { NumeralField } from '../../ui/primitives/NumeralField';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
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
  /** Void a recorded set — the way out of a 409. Absent means the row offers none. */
  onUndo?: () => Promise<void>;
  /** This row is the one the finished rest handed over to: it is scrolled into view (never focused). */
  autoFocus?: boolean;
  /**
   * This is the set being worked right now — the first one still to do. It carries the screen's
   * one lime pill; every other pending row carries the ring (which works just the same).
   */
  active?: boolean;
  /**
   * Another control on the screen owns the lime lamp right now (the interval stage's pill): the
   * active row draws the ring instead of the pill. The ring is still the working check.
   */
  lampElsewhere?: boolean;
  disabled?: boolean;
}

/**
 * THE DECIMAL SEPARATOR, ON THE ONE FIELD NOBODY LOOKS AT WHILE USING IT.
 *
 * A Hungarian numeric keypad offers a COMMA, and the frames draw `82,5`, so the field accepts both
 * separators and normalises on the way to `Number`. Keeping only the FIRST separator matters as
 * much as accepting the comma — `6,2,5` parses to NaN, which JSON-serialises to `null` and would
 * post a set with no weight at all.
 */
const sanitizeDecimal = (raw: string): string => {
  const kept = raw.replace(/[^0-9.,]/g, '');
  const first = kept.search(/[.,]/);
  if (first === -1) return kept;
  return kept.slice(0, first + 1) + kept.slice(first + 1).replace(/[.,]/g, '');
};

/** How long the record caption lies over the row. */
const FLASH_MS = 1400;

/** `''` means "not entered", which is not the same claim as `0`; a lone separator is null, not NaN. */
const parseDecimal = (raw: string): number | null => {
  if (raw === '') return null;
  const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * THE SCOREBOARD ROW'S COLUMNS, written once (frames workout-1 / workout-2, `workout-1.body.js`):
 * on the 354 pt content width the index sits at 0, the previous lift at 18 (86 wide, ends 104),
 * the kg field at 128 (104), the reps field at 248 (40), the check cell at 298 (56). Every figure
 * stands on ONE baseline, 51 below the row top. The list header reads the same numbers, so `#`,
 * `Előző`, `kg` and `ism.` stand over their columns.
 *
 * The fields and the check cell are measured from the RIGHT edge (the frame's numbers at 354 pt
 * content), so on a 328 pt phone the free space is taken from the gap after the previous lift, not
 * from the check cell running off the screen.
 *
 * A numeral's BOX starts 2 pt left of its column: Big Shoulders' digits carry a 2 pt left bearing,
 * and the frame puts the INK on the column.
 */
export const SET_COLS = {
  idx: 'left-[-1px]',
  prev: 'left-[18px] w-[86px] max-w-[calc(100%-244px)] text-ellipsis',
  /** The fields' boxes = their lines (104 / 40), measured from the right edge. */
  kg: 'left-[calc(100%-226px)]',
  reps: 'left-[calc(100%-106px)]',
  /** The check cell (56) ends on the content edge; a 44 pt mark is centred in it. */
  pill: 'right-0',
  mark: 'right-1.5',
  /** The list header's words, on the same columns (their ink 0.5 left of the box). */
  headPrev: 'left-[17.5px]',
  headKg: 'left-[calc(100%-226.5px)]',
  headReps: 'left-[calc(100%-106.5px)]',
} as const;

/**
 * One set of the running exercise — the most-used control in the product: a lifter touches it once
 * per set, mid-effort, with shaking hands.
 *
 * Pulse draws it as a line of a scoreboard (Pulse System §4 "Set row"): no card, no fill, no ring.
 * The 48 pt Black numerals are the row; state is ink and one mark at the end —
 *
 *   recorded   figures in ink, a 14 pt lock 6 after the weight's ink, the lime tick
 *   record     the same, the lime trophy instead of the tick, and for 1.4 s the record caption
 *              over the index and previous cells (then it is said once more for a screen reader)
 *   active     the targets as grey placeholders on two 1 pt field edges, THE lime pill (56 x 44)
 *   pending    the same with the 24 pt ring — which is a working check too, as it always was
 *   withdrawn  the row in `text-3`, a hairline through it, no check control, "Visszavonva"
 *   failed     a danger notice line over the right part of the row with ONE way forward
 *
 * NOTHING IN THIS ROW MAY CHANGE ITS HEIGHT (64). Everything a state has to add lies over the row,
 * never under it: a row that grows pushes every row below it under a thumb that is already moving
 * toward the next check, and the failure mode is recording a lift that did not happen.
 *
 * ONE LOOK, TAP (E21 = A, as the database serves it). The hold-to-confirm, swipe-weight and undo-pill
 * looks were admin-switchable variants of the old row; Pulse has one look (`variants.json`, R11).
 */
export function SetRow({ set, previous, onCheck, onUndo, autoFocus, active, lampElsewhere, disabled }: SetRowProps) {
  const { t, i18n } = useTranslation();
  const motionSafe = useMotionSafe();
  // THREE STATES, not two. A voided set is neither pending nor done: the undo removed it from the
  // session totals (so it cannot show a tick) and `trg_log_set_void_terminal` makes the void final
  // (so it cannot offer a check either — that would earn a 409). It is WITHDRAWN, and says so.
  const voided = set.voided_at != null;
  const done = set.completed_at != null && !voided;
  const locked = done || voided;

  // Seeded from the row, then owned by the input. A pending set shows the target as a PLACEHOLDER,
  // never as a value — pre-filling the target is how a lifter logs the prescription instead of what
  // they did. A recorded value goes through the app's formatter (`82,5`, as the frames draw it).
  const [weight, setWeight] = useState(() =>
    set.entry_value != null ? formatMeasure(set.entry_value, i18n.language) : '',
  );
  const [reps, setReps] = useState(() => (set.reps ?? '').toString());
  // A locked row shows what the SERVER holds (below, at the fields), not this state: a check that
  // reached the server from the outbox, or a refetch, may carry values this row never typed.
  // The trophy is a fact about the session, derived on every render: from the server's `records`
  // when it sends them, from this check's answer otherwise. `voided ? []` — a withdrawn set holds
  // no record.
  const [earned, setEarned] = useState<PrRecord[]>([]);
  const records = voided ? [] : set.records?.length ? set.records : earned;
  const [busy, setBusy] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The caption's end is a WALL-CLOCK deadline, as the rest clock's is: the timer only asks for a
  // re-render at the end, and the render decides from the clock — so the caption and the rest clock
  // started by the same check always agree about how long ago it was.
  const [flashUntil, setFlashUntil] = useState<number | null>(null);
  const [, setFlashTick] = useState(0);
  const flashing = flashUntil !== null && Date.now() < flashUntil;

  // The row the finished rest handed over to is scrolled into view but NOT focused: focusing would
  // open the numeric keyboard over the rows the lifter came back to read.
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!autoFocus || done) return;
    rowRef.current?.scrollIntoView({ block: 'nearest', behavior: motionSafe ? 'smooth' : 'auto' });
  }, [autoFocus, done, motionSafe]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // The outbox drained and the refetch landed: the set is recorded, so the offline notice has
  // nothing left to say. ONLY the offline one — a conflict is still true after a refetch.
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
      // Offline is not an exception here: the network failure became an outbox entry one layer
      // down and this promise RESOLVED. The notice is the whole difference between "queued" and
      // "you did not check that set".
      if (queued) setFailed('offline');
      if (justEarned.length) {
        setEarned(justEarned);
        // The caption is a moment, the trophy is permanent.
        setFlashUntil(Date.now() + FLASH_MS);
        flashTimer.current = setTimeout(() => setFlashTick((n) => n + 1), FLASH_MS);
      }
    } catch (err) {
      // A CHECK THAT FAILS MUST SAY SO. 409 is a refusal to overwrite (the set already carries other
      // values), not a failure to record: its way out is the void, not a retry.
      const status = err instanceof ApiError ? err.status : 0;
      setFailed(status === 409 ? 'conflict' : status === 0 ? 'offline' : 'failed');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!onUndo || undoing) return;
    setUndoing(true);
    try {
      await onUndo();
      setFailed(null);
      // The record goes with the set: the server has already withdrawn it.
      setEarned([]);
    } finally {
      setUndoing(false);
    }
  };

  // "72,5 kg × 8" — through the same formatter as the recorded value, so the column and the field
  // write a weight the same way (the old cell printed the raw dot).
  //
  // On a narrow phone (content under 344) the 86 pt cell does not hold the whole line, and an
  // ellipsis would cut the reps — the half the lifter needs. So the unit gives way instead: "72,5 × 8"
  // stands under the column's own ELŐZŐ head, next to the KG head that already names the unit.
  const prevWeight = previous?.weight_kg != null ? formatMeasure(previous.weight_kg, i18n.language) : null;
  const prevReps = previous?.reps != null ? `× ${previous.reps}` : null;
  const prevLabel =
    prevWeight != null || prevReps != null ? (
      <>
        {prevWeight != null ? (
          <>
            {prevWeight}
            <span className="max-[23.5rem]:hidden"> {t('workout.kg')}</span>
          </>
        ) : null}
        {prevWeight != null && prevReps != null ? ' ' : null}
        {prevReps}
      </>
    ) : (
      '—'
    );

  const hasRecord = records.length > 0;
  const isActive = Boolean(active) && !locked;
  const pill = isActive && !lampElsewhere;
  const showCaption = hasRecord && flashing;

  return (
    <div
      ref={rowRef}
      data-active={isActive || undefined}
      className={cn(
        'relative h-16 w-full',
        // Withdrawn: a hairline through the full width, so the state reads as a SHAPE at arm's length.
        voided && 'before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-text-3',
      )}
    >
      {showCaption ? null : (
        <>
          <span
            className={cn(
              'absolute top-[35px] text-data-l',
              SET_COLS.idx,
              isActive ? 'text-text-1' : done ? 'text-text-2' : 'text-text-3',
            )}
          >
            {set.set_index}
          </span>
          <span
            className={cn(
              'absolute top-[37px] overflow-hidden whitespace-nowrap text-data',
              SET_COLS.prev,
              voided ? 'text-text-3' : 'text-text-2',
            )}
          >
            {prevLabel}
          </span>
        </>
      )}

      {/* THE TWO FIELDS — the kit's NumeralField: the 48 pt figure typed on the row's rule, the
          target as the quiet placeholder (never a value: pre-filling the target is how a lifter
          logs the prescription instead of what they did). Recorded = locked: the figure in ink and
          one lock after the weight. Withdrawn = off: the figures in the quiet ink, no lock. A field
          merely disabled while a check is in flight shows no lock. A locked row shows what the
          SERVER holds, not this row's state (a check drained from the outbox may carry values this
          row never typed). */}
      <NumeralField
        label={t('workout.weight')}
        placeholder={locked ? undefined : set.target_weight_kg != null ? formatMeasure(set.target_weight_kg, i18n.language) : t('workout.kg')}
        value={locked && set.entry_value != null ? formatMeasure(set.entry_value, i18n.language) : weight}
        locked={done}
        lockedLabel={t('workout.recorded')}
        disabled={voided || disabled}
        onChange={(e) => setWeight(sanitizeDecimal(e.target.value))}
        className={cn('absolute top-0 w-26', SET_COLS.kg)}
      />
      <NumeralField
        label={t('workout.reps')}
        inputMode="numeric"
        placeholder={locked ? undefined : set.target_reps != null ? String(set.target_reps) : t('workout.reps')}
        value={locked && set.reps != null ? String(set.reps) : reps}
        locked={done}
        lockMark={false}
        lockedLabel={t('workout.recorded')}
        disabled={voided || disabled}
        onChange={(e) => setReps(e.target.value.replace(/[^0-9]/g, ''))}
        className={cn('absolute top-0 w-10', SET_COLS.reps)}
      />

      {/* THE CHECK CELL, 298-354. */}
      {voided ? (
        // No check control at all: a check here would earn a 409. The state gets a word.
        <span className="absolute right-0 top-[23px] bg-surface-0 pl-2 text-cap text-text-3">{t('workout.withdrawn')}</span>
      ) : done ? (
        <span className={cn('absolute top-2.5 size-11', SET_COLS.mark)}>
          {hasRecord ? (
            <span aria-hidden className="flex size-11 items-center justify-center text-accent">
              <Trophy className="size-6" strokeWidth={2} />
            </span>
          ) : (
            <CheckMark done />
          )}
          <span className="sr-only">{t('workout.recorded')}</span>
        </span>
      ) : failed ? null : pill ? (
        // (A failed check hands its way forward to the notice below, which lies over this cell: the
        // pill under it would only leak its glow around the notice.)
        // THE screen's one lime pill: the kit's icon pill, 56 x 44 with the 24 pt tick.
        <Pressable
          variant="primary"
          size="sm"
          shape="icon"
          aria-label={t('workout.check')}
          busy={busy}
          disabled={disabled}
          onClick={() => void submit()}
          className={cn('absolute top-2.5', SET_COLS.pill)}
        >
          <Check aria-hidden />
        </Pressable>
      ) : (
        // A pending row's own check works too, as it always did: the ring is a button.
        <Pressable
          variant="link"
          shape="icon"
          aria-label={t('workout.check')}
          busy={busy}
          disabled={disabled}
          onClick={() => void submit()}
          className={cn('absolute top-2.5', SET_COLS.mark)}
        >
          <CheckMark done={false} />
        </Pressable>
      )}

      {hasRecord ? (
        // Announced AND, for the length of the flash, SHOWN over the index and previous cells — never
        // a new line, never over the weight. Past the flash it is said once more to a screen reader
        // only: the trophy is the permanent fact.
        <span
          role="status"
          className={
            showCaption ? 'absolute left-0 top-3.5 w-[80px] text-cap-m text-text-1' : 'sr-only'
          }
        >
          {t('workout.newRecord', { kind: t(`workout.record.${records[0].kind}`) })}
        </span>
      ) : null}

      {/* A FAILED CHECK, SAID OUT LOUD, over the fields and the check cell (the row keeps its height
          and its typed values: Újra sends them again). A conflict is not retryable — the stored
          values differ — so its one way forward is the void. */}
      {failed ? (
        <NoticeLine
          tone="danger"
          role="alert"
          className="absolute inset-y-2.5 left-[104px] right-0 w-auto bg-surface-0 pl-6"
          action={
            failed === 'conflict' && onUndo ? (
              <TextLink busy={undoing} onClick={() => void undo()}>
                {t('workout.undo')}
              </TextLink>
            ) : (
              <TextLink busy={busy} onClick={() => void submit()}>
                {t('common.retry')}
              </TextLink>
            )
          }
        >
          {t(`workout.checkFailed.${failed}`)}
        </NoticeLine>
      ) : null}
    </div>
  );
}

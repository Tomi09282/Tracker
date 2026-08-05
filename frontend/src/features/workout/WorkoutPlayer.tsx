import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dumbbell, PlayCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { MuscleMap } from '../../ui/muscle-map/MuscleMap';
import { SetRow } from './SetRow';
import { RestTimer } from './RestTimer';
import { useCurrentWorkout, useCheckSet, useUndoSet, useRestTimer, type PrRecord } from './useWorkout';
import { vibrate, speak, tone, unlockAudio } from './cues';
import { groupIntervalBlocks } from './intervalPlan';
import { useIntervalTimer } from './useIntervalTimer';
import { IntervalStage } from './IntervalStage';
import { useElementVariant } from '../../ui/feedback/ElementStyleProvider';

/**
 * Blueprint 3 — the guided workout player.
 *
 * THE LAW THIS SCREEN IS BUILT AROUND: the page never scrolls while sets are being checked. Only
 * the set list scrolls, inside its own box.
 *
 * That is not a stylistic preference. A lifter checks a set with one hand, mid-rest, often without
 * looking. If the page scrolls, the check button is somewhere different every time — and the
 * failure mode is not "mildly annoying", it is tapping the wrong set and recording a lift that did
 * not happen, on a row the schema then freezes.
 *
 * The layout is therefore a fixed-height column: a sticky hero that does not move, a scroll region
 * that owns all the overflow, and a footer pinned above the nav. `min-h-0` on the middle track is
 * what makes a grid child actually scroll instead of growing the page — the single most common way
 * this pattern is got wrong.
 */
export function WorkoutPlayer() {
  const { t, i18n } = useTranslation();
  const { data, isPending } = useCurrentWorkout();
  const check = useCheckSet();
  const undo = useUndoSet();
  // The rest ending is the cue that matters most: the phone is on the floor and nobody is looking
  // at it. A timer that only ends visually has told the lifter nothing.
  const restVariant = useElementVariant('E22');
  // E22-E: which row the finished rest handed over to. Held in state rather than derived, because
  // "the next pending set" changes the moment one is checked — deriving it would move the handover
  // marker onto a different row while the lifter was still looking at this one.
  const [handoverSetId, setHandoverSetId] = useState<number | null>(null);
  const rest = useRestTimer(() => {
    vibrate('restOver');
    speak(t('workout.restOverSpoken'), i18n.language);
    if (restVariant === 'E') setHandoverSetId(nextPendingRef.current);
  });
  const [activeExercise, setActiveExercise] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [showTimer, setShowTimer] = useState(false);

  const exercises = data?.exercises ?? [];
  const current = exercises[activeExercise];

  // Which interval block, if any, the current movement belongs to. A straight or superset block
  // has none, and the hero keeps its ordinary media / muscle-map toggle.
  const intervalBlock = useMemo(() => {
    const blocks = groupIntervalBlocks(exercises, data?.sets ?? []);
    return blocks.find((b) => b.members.some((m) => m.logExerciseId === current?.id)) ?? null;
  }, [exercises, data?.sets, current?.id]);

  const interval = useIntervalTimer({
    // Every cue fires from the TIMER's tick, never from a render — deriving them from
    // `remaining === 0` during a repaint would re-fire them on every frame while the clock sat at
    // zero, which is the mistake `useRestTimer` already documents.
    onEnter: (segment, round, total) => {
      if (segment.kind === 'work') {
        vibrate('intervalWork');
        tone(1320, 260);
        speak(t('workout.interval.spokenWork', { round, total }), i18n.language);
      } else if (segment.kind === 'rest' || segment.kind === 'setBreak') {
        vibrate('intervalRest');
        tone(660, 160);
        speak(t('workout.interval.spokenRest'), i18n.language);
      } else {
        speak(t('workout.interval.spokenPrepare'), i18n.language);
      }
    },
    // No speech on the 3-2-1: `speak` cancels the queue, so three spoken numbers inside a ten
    // second rest would eat the phase announcement that actually matters. A tone is also the only
    // cue that fits in a second — and the only one at all on an iPhone, where `navigator.vibrate`
    // does not exist.
    onCountdown: () => {
      vibrate('intervalTick');
      tone(880, 60);
    },
    onDone: () => {
      vibrate('intervalDone');
      tone(520, 700);
      speak(t('workout.interval.spokenDone'), i18n.language);
    },
    onWorkComplete: async (setId, seconds) => {
      try {
        const result = await check.mutateAsync({ setId, seconds });
        if (!result.replayed) vibrate('setChecked');
        return true;
      } catch {
        // The round is NOT lost: the row stays pending, the stage counts it as unsent, and the
        // lifter keeps going. A conditioning block must not stop for a network error.
        return false;
      }
    },
  });

  const setsForCurrent = useMemo(
    () => (data?.sets ?? []).filter((s) => s.log_exercise_id === current?.id),
    [data?.sets, current?.id],
  );

  // The next set still to do, kept in a ref because the rest-over callback fires from the TIMER's
  // tick, not from a render — reading React state there would give whatever it was when the rest
  // started, which after a 90-second rest is very likely the wrong row.
  const nextPendingRef = useRef<number | null>(null);
  useEffect(() => {
    nextPendingRef.current = setsForCurrent.find((s) => s.completed_at == null)?.id ?? null;
  }, [setsForCurrent]);

  const nextUp = exercises[activeExercise + 1]?.exercise_name_snapshot ?? null;

  if (isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-6">
        <Skeleton className="aspect-video w-full rounded-card" />
        <Skeleton className="h-14 w-full rounded-card" />
        <Skeleton className="h-14 w-full rounded-card" />
      </div>
    );
  }

  if (!data?.log) {
    return (
      <div className="col-mobile screen-x py-6">
        <EmptyState
          icon={PlayCircle} heading="h1"
          title={t('workout.noneTitle')}
          body={t('workout.noneBody')}
        />
      </div>
    );
  }

  const onCheck = async (setId: number, values: { weight: number | null; reps: number | null }): Promise<PrRecord[]> => {
    const result = await check.mutateAsync({ setId, ...values, weight_unit: 'kg' });
    // Rest starts from the set's own prescribed rest, and only after the check lands. Starting it
    // optimistically would run a timer for a set the server refused.
    const set = setsForCurrent.find((s) => s.id === setId);
    if (set?.target_rest_seconds) rest.start(set.target_rest_seconds);

    // A short tick for the check, a longer pattern for a record. Both are confirmations the lifter
    // gets without looking, which is the only time they are worth anything.
    const records = result.records ?? [];
    vibrate(records.length ? 'personalRecord' : 'setChecked');
    if (records.length) speak(t('workout.recordSpoken'), i18n.language);
    return records;
  };

  return (
    <div
      // The whole screen, minus the nav. `h-[...]` rather than `min-h-` on purpose: this container
      // must NOT grow, or the page scrolls and the law above is broken.
      className={cn(
        'col-mobile screen-x grid grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 py-4',
        // Exactly what the layout reserves below it, from the same token — measured, not guessed.
        // Subtracting only `--nav-h` left the page 16 px taller than the viewport, which broke the
        // law this whole layout exists to keep.
        'h-[calc(100dvh-var(--content-pad-b))] lg:h-[calc(100dvh-var(--content-pad-b-lg))]',
      )}
    >
      {/* ── the sticky hero ─────────────────────────────────────────────────────────────────── */}
      <div className="relative aspect-video w-full overflow-hidden rounded-card bg-surface-2">
        {intervalBlock && showTimer ? (
          <IntervalStage
            block={intervalBlock}
            phase={interval.phase}
            remaining={interval.remaining}
            progress={interval.progress}
            round={interval.round}
            totalRounds={interval.totalRounds}
            running={interval.running}
            interrupted={interval.interrupted}
            pendingCount={interval.pendingCount}
            failedRounds={interval.failedRounds}
            nextName={
              interval.segment && intervalBlock.members.length > 1
                ? (intervalBlock.members[interval.segment.memberIndex + 1]?.name ?? null)
                : null
            }
            // `unlockAudio()` runs SYNCHRONOUSLY inside the tap handler, before anything awaits.
            // iOS starts every AudioContext suspended and only a real user gesture resumes it —
            // after an await the browser no longer counts this as one, and the whole block would
            // then run silently on the device where the tone is the only cue available.
            onStart={() => {
              unlockAudio();
              interval.start(intervalBlock, 10);
            }}
            onPause={interval.pause}
            onResume={() => {
              unlockAudio();
              interval.resume();
            }}
            onSkip={interval.skip}
            onStop={interval.stop}
            onConfirmCrossed={() => {
              unlockAudio();
              interval.confirmCrossed();
            }}
            onDiscardCrossed={interval.discardCrossed}
          />
        ) : showMap && current?.exercise_id ? (
          <div className="flex h-full items-center justify-center">
            <MuscleMap className="h-full" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-text-3">
            <Dumbbell className="size-icon-l" aria-hidden />
          </div>
        )}
        {/* The timer toggle only appears on a block that HAS rounds. On a straight set it would be
            a control that does nothing, which is worse than no control. It is also hidden while
            the timer is running, so the lifter cannot navigate away from a live countdown by
            reflex. */}
        {intervalBlock && !interval.running ? (
          <Pressable
            shape="chip"
            density="compact"
            variant={showTimer ? 'primary' : 'secondary'}
            aria-pressed={showTimer}
            onClick={() => setShowTimer((v) => !v)}
            className="absolute bottom-2 left-2"
          >
            {t('workout.showTimer')}
          </Pressable>
        ) : null}
        {!interval.running ? (
          <Pressable
            shape="chip"
            density="compact"
            variant="secondary"
            aria-pressed={showMap}
            onClick={() => setShowMap((v) => !v)}
            className="absolute bottom-2 right-2"
          >
            {t(showMap ? 'workout.showMedia' : 'workout.showMuscles')}
          </Pressable>
        ) : null}
      </div>

      <header className="flex items-baseline justify-between gap-3">
        <h1 className="truncate text-title-2 font-display">
          {current?.exercise_name_snapshot ?? t('workout.freestyle')}
        </h1>
        <span className="text-caption shrink-0 tabular-nums text-text-2">
          {activeExercise + 1} / {exercises.length}
        </span>
      </header>

      {/* ── THE ONLY THING THAT SCROLLS ─────────────────────────────────────────────────────── */}
      <ul className="min-h-0 overflow-y-auto overscroll-contain" aria-label={t('workout.sets')}>
        <li className="grid h-8 grid-cols-[2.5rem_5rem_1fr_1fr_3.5rem] items-center gap-2 px-2 text-caption text-text-3">
          <span className="text-center">#</span>
          <span>{t('workout.previous')}</span>
          <span className="text-center">{t('workout.kg')}</span>
          <span className="text-center">{t('workout.reps')}</span>
          <span />
        </li>
        {setsForCurrent.map((s) => (
          <SetRow
            key={s.id}
            set={s}
            onCheck={(v) => onCheck(s.id, v)}
            onUndo={async () => {
              await undo.mutateAsync({ setId: s.id, reason: 'undone from the player' });
              // The rest that this set started is no longer resting between anything. Leaving it
              // running would count down to a cue for a set the lifter just took back.
              rest.stop();
            }}
            autoFocus={handoverSetId === s.id}
            disabled={check.isPending}
          />
        ))}
      </ul>

      {/* ── exercise switcher, pinned ───────────────────────────────────────────────────────── */}
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label={t('workout.exercises')}>
        {exercises.map((ex, i) => {
          const total = (data.sets ?? []).filter((s) => s.log_exercise_id === ex.id);
          const done = total.filter((s) => s.completed_at != null).length;
          return (
            <Pressable
              key={ex.id}
              shape="chip"
              density="compact"
              variant={i === activeExercise ? 'primary' : 'secondary'}
              aria-current={i === activeExercise ? 'true' : undefined}
              onClick={() => setActiveExercise(i)}
            >
              <span className="max-w-32 truncate">{ex.exercise_name_snapshot}</span>
              <span className="tabular-nums opacity-70">
                {done}/{total.length}
              </span>
            </Pressable>
          );
        })}
      </nav>

      <RestTimer
        remaining={rest.remaining}
        progress={rest.progress}
        running={rest.running}
        nextUp={nextUp}
        onSkip={rest.stop}
      />
    </div>
  );
}

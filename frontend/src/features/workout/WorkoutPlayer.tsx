import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Dumbbell, PersonStanding, Play, PlayCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { MuscleMap, type MuscleRole } from '../../ui/muscle-map/MuscleMap';
import { useExercise } from '../library/useExercises';
import { SetRow, SET_ROW_COLS, type CheckResult } from './SetRow';
import { RestTimer } from './RestTimer';
import {
  useCurrentWorkout,
  useCheckSet,
  useUndoSet,
  useRestTimer,
  usePreviousSets,
} from './useWorkout';
import { vibrate, speak, tone, unlockAudio } from './cues';
import { groupIntervalBlocks } from './intervalPlan';
import { useIntervalTimer } from './useIntervalTimer';
import { IntervalStage } from './IntervalStage';

/**
 * THE FOUR-ROW COLUMN, WRITTEN ONCE.
 *
 * The loading state and the loaded state must be the SAME box, or the swap produces the layout
 * shift a skeleton exists to prevent — and on this screen a layout shift is not cosmetic, it moves
 * the check button. `h-`, never `min-h-`: this container must not be able to grow.
 *
 * The height subtracts exactly what the layout reserves below it, from the same token — measured,
 * not guessed. Subtracting only `--nav-h` left the page 16 px taller than the viewport, which broke
 * the law this whole layout exists to keep.
 */
const SHELL = cn(
  'col-mobile screen-x grid grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-group py-4',
  'h-[calc(100dvh-var(--content-pad-b))] lg:h-[calc(100dvh-var(--content-pad-b-lg))]',
);

/**
 * The hero's footprint, and the single most load-bearing number on the screen.
 *
 * 28dvh is the top third of the column once the nav is subtracted, which is where the anchor
 * belongs — and it is what leaves the set list room for four full rows plus a visibly clipped
 * fifth at 375 x 812. It is a FIXED share of the viewport rather than an aspect ratio because the
 * budget below it is vertical: an aspect ratio would hand a wide phone a taller hero and quietly
 * take a set row away.
 *
 * The hero also keeps this height when it has nothing to show. Collapsing it on an exercise with
 * no muscle map would move the set list up, which means the check button lands somewhere different
 * on that exercise than on the previous one — the exact failure the no-scroll law exists to
 * prevent.
 */
const HERO = 'relative h-[28dvh] w-full shrink-0 overflow-hidden';

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
  const { toast } = useToast();
  // Which row the finished rest handed over to. Held in state rather than derived, because "the
  // next pending set" changes the moment one is checked — deriving it would move the handover
  // marker onto a different row while the lifter was still looking at this one.
  const [handoverSetId, setHandoverSetId] = useState<number | null>(null);
  const rest = useRestTimer(() => {
    // The rest ending is the cue that matters most: the phone is on the floor and nobody is looking
    // at it. A timer that only ends visually has told the lifter nothing.
    vibrate('restOver');
    speak(t('workout.restOverSpoken'), i18n.language);
    // HANDOVER IS A STATE OF THIS SCREEN, NOT A VARIANT. It used to be gated on E22 = 'E', which is
    // seeded 'A', so the ring was drawn on the next row and the row was never brought to it —
    // half of the one behaviour the spec's Handover state describes. Scroll only, never focus:
    // focusing opens the numeric keyboard over the very rows the lifter came back to read.
    setHandoverSetId(nextPendingRef.current);
  });
  const [activeExercise, setActiveExercise] = useState(0);
  // THE MAP IS THE DEFAULT, and the chip offers the media. It used to be the other way round: the
  // hero opened on a grey dumbbell glyph and the anatomy — the whole reason this panel is the
  // anchor — was one tap away behind a chip nobody had a reason to press.
  const [showMedia, setShowMedia] = useState(false);
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

  // ── THE PREVIOUS COLUMN ──────────────────────────────────────────────────────────────────────
  //
  // One request for the whole session rather than one per set, which is what the endpoint was built
  // for. Until this was wired the column rendered an em-dash on every row of every session: the
  // most useful number on the screen was a placeholder, and the server had been answering for it
  // all along.
  const { data: previousData } = usePreviousSets(Boolean(data?.log));
  const previousBySet = useMemo(() => {
    const map = new Map<string, { weight_kg: number | null; reps: number | null }>();
    // The endpoint orders each movement's history newest-session-first, so the FIRST row for a pair
    // is the most recent one. Later rows are older sessions and must not overwrite it — "last time"
    // means last time, not the first time this set index was ever done.
    for (const p of previousData?.previous ?? []) {
      const key = `${p.exercise_id}:${p.set_index}`;
      if (!map.has(key)) map.set(key, p);
    }
    return map;
  }, [previousData]);

  // WHAT THE ANCHOR IS ACTUALLY FOR. A body map with nothing lit is a grey figure — it answers no
  // question at all, and it is the one element on this screen that is not a number. The taxonomy
  // that says which muscles this movement works, primary versus assisting, lives on the exercise,
  // so the hero reads it from there. `enabled` is guarded inside the hook, so a freestyle set with
  // no `exercise_id` costs no request.
  const { data: exerciseDetail } = useExercise(current?.exercise_id ?? null, i18n.language.slice(0, 2));
  const highlights = useMemo<Record<string, MuscleRole>>(
    () => Object.fromEntries((exerciseDetail?.muscles ?? []).map((m) => [m.slug, m.role])),
    [exerciseDetail],
  );

  // WHAT THE PANEL IS ACTUALLY SHOWING, which is not the same question as which way the toggle is
  // set. A freestyle movement carries no `exercise_id`, so the map branch cannot draw and the
  // placeholder is on screen with `showMedia` still false — and the chip, reading the toggle, was
  // offering `Videó` for a panel that was already the video's stand-in. The chip names the OTHER
  // view, so it has to be derived from the contents.
  const mapAvailable = Boolean(current?.exercise_id);
  const mapShown = !showMedia && mapAvailable;

  // The next set still to do, kept in a ref because the rest-over callback fires from the TIMER's
  // tick, not from a render — reading React state there would give whatever it was when the rest
  // started, which after a 90-second rest is very likely the wrong row.
  const nextPendingRef = useRef<number | null>(null);
  useEffect(() => {
    nextPendingRef.current = setsForCurrent.find((s) => s.completed_at == null)?.id ?? null;
  }, [setsForCurrent]);

  const nextUp = exercises[activeExercise + 1]?.exercise_name_snapshot ?? null;

  // The set the thumb is aimed at: the first one still to do. `voided_at` is checked for the same
  // reason the chip counts check it — a void is terminal, so a voided row can never be the one to
  // work next.
  const activeSetId =
    setsForCurrent.find((s) => s.completed_at == null && s.voided_at == null)?.id ?? null;

  if (isPending) {
    return (
      // THE SAME BOX AS THE LOADED SCREEN, in the same proportions. A skeleton whose shapes do not
      // match the real geometry causes precisely the layout shift it was put there to prevent.
      <div className={SHELL} role="status" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className={cn(HERO, 'rounded-card')} />
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-7 w-16 rounded-chip" />
        </div>
        <Surface pad="none" className="flex min-h-0 flex-col overflow-hidden px-2 pt-2">
          <div className="h-7 shrink-0" />
          <div className="flex flex-col gap-tight">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-card" />
            ))}
          </div>
        </Surface>
        <div className="flex gap-3 pb-1">
          <Skeleton className="h-11 w-28 rounded-chip" />
          <Skeleton className="h-11 w-32 rounded-chip" />
          <Skeleton className="h-11 w-24 rounded-chip" />
        </div>
      </div>
    );
  }

  if (!data?.log) {
    return (
      // NO ACTION HERE, DELIBERATELY. Starting a session lives on Home; a second start path is a
      // second thing the server has to reconcile, and the library keeps its door from Home's own
      // empty state (`check-nav` reads that one).
      <div className="col-mobile screen-x flex h-[calc(100dvh-var(--content-pad-b))] items-center justify-center py-4 lg:h-[calc(100dvh-var(--content-pad-b-lg))]">
        <EmptyState icon={PlayCircle} heading="h1" title={t('workout.noneTitle')} body={t('workout.noneBody')} />
      </div>
    );
  }

  const onCheck = async (
    setId: number,
    values: { weight: number | null; reps: number | null },
  ): Promise<CheckResult> => {
    const result = await check.mutateAsync({ setId, ...values, weight_unit: 'kg' });
    // Rest starts from the set's own prescribed rest, and only after the check lands. Starting it
    // optimistically would run a timer for a set the server refused.
    const set = setsForCurrent.find((s) => s.id === setId);
    if (set?.target_rest_seconds) rest.start(set.target_rest_seconds);

    // A short tick for the check, a longer pattern for a record. Both are confirmations the lifter
    // gets without looking, which is the only time they are worth anything.
    const records = result.records ?? [];
    vibrate(records.length ? 'personalRecord' : 'setChecked');
    if (records.length) {
      speak(t('workout.recordSpoken'), i18n.language);
      // THE THIRD CHANNEL, for the lifter who is not looking at the row. The haptic pattern and the
      // spoken line already fire; the toast is the one a person catches out of the corner of an
      // eye. Raised ONCE, and it dismisses itself — the row keeps the trophy, so a permanent toast
      // would be a second permanent statement of the same fact.
      //
      // `record`, not `success`: a saved form and a personal record are both "it worked" and are
      // not the same news, which is why E12E16 ships a fourth KIND with a trophy and an accent rail
      // instead of a green check. `top`, not the default bottom: the bottom of this viewport is the
      // rest timer, the nav AND the thumb path to the next check button, and the same tap that
      // earns the record starts the rest — so a bottom toast lands on the control it celebrates.
      // This is the screen `ToastPlacement` was built for, and it had never opted in.
      //
      // The message is the bare `Új rekord`, not the kind-qualified sentence: that sentence is the
      // ROW's caption, and the toast is not a second permanent statement of the same fact.
      toast(t('workout.recordSpoken'), 'record', { placement: 'top' });
    }
    // `queued` is carried to the row, not swallowed here: the outbox accepted the write but the
    // server has not, so the row has to say `Nincs kapcsolat` instead of sitting there looking
    // untouched. See useWorkout's outbox branch.
    return { records, queued: result.queued === true };
  };

  return (
    <div className={SHELL}>
      {/* ── THE ANCHOR ──────────────────────────────────────────────────────────────────────────
          A framed panel that hosts the map at full bleed, not a centred small figure in a grey box.
          `glass` is earned here and almost nowhere else on this screen: the recipe reserves the
          backdrop blur for surfaces that float over moving content, and a hero anchor is the one
          case on a resting page — it is a single element, so the compositing layer it costs is
          paid once rather than once per card. */}
      <Surface elevation="card" finish="glass" pad="none" className={HERO}>
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
            screenMaySleep={interval.screenMaySleep}
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
        ) : mapShown ? (
          // FULL BLEED. `fill` height-constrains the 260 x 560 figure to the panel instead of
          // capping it at 280px wide, which on a wide hero left the map floating in an empty box.
          // Read-only — no `onSelect` — so the map is not an interactive target here at all, which
          // is the rule that lets a component with 9px-wide regions exist in this product.
          //
          // `sideControl="segmented"` is the whole reason that prop exists: 02-workout-player.webp
          // draws ONE rounded track with `Elöl` in an inner pill, not the filled-accent chip pair
          // the library and exercise-detail mockups draw. The pair also put a second saturated
          // accent object in the hero, competing with the row's check button.
          <MuscleMap highlights={highlights} fill sideControl="segmented" className="h-full p-3" />
        ) : (
          // THE HONEST STAND-IN for an exercise with no map and no media: a custom movement, a
          // coach's own entry, anything the taxonomy has not been filled in for. A mark at anchor
          // scale rather than a small grey glyph in an empty panel — one reads as "nothing to show
          // here", the other reads as a broken image.
          //
          // Both sizes are FRACTIONS of the panel, never px. The hero is 28dvh, so a fixed glyph
          // drifts against the circle on every viewport — which is how it ended up at 64px inside a
          // mark only 3/5 of the panel tall: a big glyph in a circle too small for it. Measured off
          // 02b-workout-states.webp the mark is ~77% of the panel's height; the glyph is half the
          // mark, matching the ratio `EmptyState`'s own `anchor` mark uses, so the two anchor-scale
          // marks in the product are drawn to one proportion.
          <div className="flex h-full items-center justify-center">
            <span
              aria-hidden
              className="inline-flex aspect-square h-3/4 items-center justify-center rounded-chip bg-accent-subtle text-accent"
            >
              <Dumbbell className="size-1/2" strokeWidth={1.5} />
            </span>
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
            // `selected`, not `primary`. Rule 47 / DESIGN §5.6: the one saturated accent object on
            // this screen is the row's check button, and a toggle that is merely ON is the
            // selected-chip idiom. Rule-derived rather than mockup-derived — the mockups draw no
            // `Időzítő` chip at all, since both are straight-set blocks.
            variant="secondary"
            selected={showTimer}
            aria-pressed={showTimer}
            onClick={() => setShowTimer((v) => !v)}
            className={cn('absolute left-3', mapShown ? 'bottom-9' : 'bottom-3')}
          >
            {t('workout.showTimer')}
          </Pressable>
        ) : null}
        {/* THE OFFSET FOLLOWS WHAT IS ACTUALLY UNDER THE CHIP. `bottom-9` clears the map's
            `Fő célizom` / `Segédizom` legend, which owns the bottom band of the panel — a chip
            parked on the one line that explains the colours has eaten the anchor's caption. With no
            map there is no legend, and 36px above the edge is 16% of a 28dvh hero left as dead
            space; 02b-workout-states.webp puts the chip just inside the corner. */}
        {!interval.running ? (
          <Pressable
            shape="chip"
            density="compact"
            variant="secondary"
            // Inert on a movement with no taxonomy, rather than a control that redraws the panel it
            // is already showing. The chip STAYS — the next movement may well have a map, and the
            // toggle has to be discoverable when it does.
            //
            // `aria-disabled` + a no-op handler, NOT `disabled`: the control recipe washes a
            // disabled chip to `opacity-45`, and over a glass hero that is the one place the label
            // stops being readable. The mockup draws this chip at full strength on exactly the
            // state that has no map. The refusal is kept; only the fade is dropped.
            aria-disabled={!mapAvailable || undefined}
            aria-pressed={mapAvailable ? showMedia : undefined}
            onClick={() => {
              if (!mapAvailable) return;
              setShowMedia((v) => !v);
            }}
            className={cn('absolute right-3', mapShown ? 'bottom-9' : 'bottom-3')}
          >
            {mapShown ? (
              <Play className="size-icon-s" aria-hidden />
            ) : (
              <PersonStanding className="size-icon-s" aria-hidden />
            )}
            {t(mapShown ? 'workout.showMedia' : 'workout.showMuscles')}
          </Pressable>
        ) : null}
      </Surface>

      <header className="flex items-center justify-between gap-3">
        <h1 className="text-title-1 truncate font-display">
          {current?.exercise_name_snapshot ?? t('workout.freestyle')}
        </h1>
        {/* The counter is a PILL, not bare grey text. It is the one number on this row, and it has
            to survive being read past a long exercise name that is already truncating. */}
        <span className="text-body-s shrink-0 rounded-chip bg-surface-2 px-3 py-1 tabular-nums text-text-3">
          <span className="text-text-1">{activeExercise + 1}</span> / {exercises.length}
        </span>
      </header>

      {/* ── THE ONLY THING THAT SCROLLS ─────────────────────────────────────────────────────────
          The Surface is the frame and does NOT scroll; the `ul` inside it owns all the overflow.
          `min-h-0` on both is what makes a grid child scroll instead of growing the page — the
          single most common way this pattern is got wrong. The list runs to the panel's bottom edge
          with no padding under it on purpose: a half-clipped fifth row is the affordance that says
          "there is more", and padding would turn it into a gap. */}
      <Surface pad="none" className="flex min-h-0 flex-col overflow-hidden px-2 pt-2">
        {/* SENTENCE CASE, at the caption step. Both mockups draw `#  Előző  kg  ism.` with a capital
            E and lowercase `kg` / `ism.` — a deliberate difference from the bottom nav's caps, since
            `ism.` is an abbreviation whose full stop disappears into an uppercase run. `text-micro`
            carries +0.06em tracking that exists for uppercase eyebrows and is wrong under sentence
            case; `text-caption` is the step for metadata under a thing. */}
        <div className={cn('text-caption grid h-7 shrink-0 items-center gap-2 px-2 text-text-3', SET_ROW_COLS)}>
          <span className="text-center">#</span>
          <span>{t('workout.previous')}</span>
          <span className="text-center">{t('workout.kg')}</span>
          <span className="text-center">{t('workout.reps')}</span>
          <span />
        </div>
        <ul
          className="flex min-h-0 flex-1 flex-col gap-tight overflow-y-auto overscroll-contain"
          aria-label={t('workout.sets')}
        >
          {setsForCurrent.map((s) => (
            <SetRow
              key={s.id}
              set={s}
              // A freestyle movement has no `exercise_id`, so it has no history to compare against
              // and the column is honestly an em-dash there.
              previous={
                current?.exercise_id != null
                  ? (previousBySet.get(`${current.exercise_id}:${s.set_index}`) ?? null)
                  : null
              }
              onCheck={(v) => onCheck(s.id, v)}
              onUndo={async () => {
                await undo.mutateAsync({ setId: s.id, reason: 'undone from the player' });
                // The rest that this set started is no longer resting between anything. Leaving it
                // running would count down to a cue for a set the lifter just took back.
                rest.stop();
              }}
              autoFocus={handoverSetId === s.id}
              active={activeSetId === s.id}
              disabled={check.isPending}
            />
          ))}
        </ul>
      </Surface>

      {/* ── exercise switcher, pinned ───────────────────────────────────────────────────────────
          `gap-3` rather than `gap-2`: five tight chips read as a second navigation bar competing
          with the real one at the bottom, and loose ones read as the filter row this actually is.
          The chip clipped at the trailing edge is deliberate — it is what says the row scrolls. */}
      <nav className="flex shrink-0 gap-3 overflow-x-auto pb-1" aria-label={t('workout.exercises')}>
        {exercises.map((ex, i) => {
          const total = (data.sets ?? []).filter((s) => s.log_exercise_id === ex.id);
          // `voided_at` matters here for the same reason it matters on the row: the server dropped
          // a voided set from the session totals, so counting it would make this chip say 4/4 while
          // the record says 3. Second instance of that drift found by sweeping every read of
          // `completed_at` after the row defect — the row was not the only place that had to agree.
          const done = total.filter((s) => s.completed_at != null && s.voided_at == null).length;
          const complete = total.length > 0 && done === total.length;
          return (
            <Pressable
              key={ex.id}
              shape="chip"
              density="compact"
              // A ~140px saturated accent pill here made the screen's largest accent object a
              // NAVIGATION chip while the one real action — the row's check button — was the
              // smaller of the two. Both mockups draw this as the pale selected-filter pill, which
              // is also what the row's own comment above calls this: a filter row, not a second nav.
              //
              // `selected` rather than a hand-written `bg-accent-subtle`: the variant carries the
              // `hover:bg-accent-subtle` half a call site forgets, without which the current chip
              // reverts to surface-2 under the pointer and reads as "you are about to deselect".
              // No `text-*` at the call site — twMerge would let it swallow `density="compact"`'s
              // `text-body-s` and render this chip a different size from its neighbours.
              variant="secondary"
              selected={i === activeExercise}
              // Kept as-is: `selected` is a visual variant and carries no semantics.
              aria-current={i === activeExercise ? 'true' : undefined}
              onClick={() => setActiveExercise(i)}
            >
              <span className="max-w-32 truncate">{ex.exercise_name_snapshot}</span>
              {/* A finished movement gets a tick as well as a full count — the count alone is two
                  numbers to compare at arm's length, and the tick is the same fact as a shape. */}
              {complete ? <Check className="size-icon-s shrink-0" aria-hidden /> : null}
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

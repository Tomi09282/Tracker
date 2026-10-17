import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { Check, PersonStanding, Play } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Screen } from '../../ui/shell/Screen';
import { Rule } from '../../ui/data/Rule';
import { RoleKey } from '../../ui/data/RoleKey';
import { RowStack } from '../../ui/data/RowStack';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { MuscleMap, type MuscleRole, type MuscleSide } from '../../ui/muscle-map/MuscleMap';
import { useExercise } from '../library/useExercises';
import { SetRow, SET_COLS, type CheckResult } from './SetRow';
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
 * THE HEIGHT BUDGET, in the frame's points (re-derived from `workout-1` / `workout-2`):
 *
 *   header line 44 · hero 187 · table pad 16 + strong rule 1 + list header 36 + rule 1 · the rows
 *   (64 + 1 per row) · closing strong rule 1 · the bottom cell: the switcher 88, or the rest band 137
 *
 * The column is one viewport tall and never grows (`Screen fill="fixed"`), and it ends 28 above
 * the bar (`bottom="near"`). At 402 x 874 the blocks share 682 under y 72: 308 for the rows with
 * the switcher, 259 with the rest band — exactly the 4 rows drawn. At 360 x 640 the
 * rows would get 74 / 25, so the Q7 default gives way, in this order and never by choice of the
 * moment:
 *
 *   1. the figure — with the side switch and the legend, which only steer it: the hero becomes the
 *      title alone (12 + 68 = 80, +107 for the rows)
 *   2. the header line — the counter and the hero toggle (+44)
 *
 * A step is taken when the rows would otherwise get less than two of themselves (129). It is
 * decided by the HEIGHT OF THIS COLUMN, measured, so the offline line and the rest band count; the
 * title, the set rows and the rest band never yield. The interval stage is not the figure: while it
 * is shown the hero keeps it, and only the header line can go.
 */
const BUDGET = { header: 44, hero: 187, heroCompact: 80, table: 54, close: 1, switcher: 88, rest: 137, rows: 129 } as const;

/** 0 = everything, 1 = no figure, 2 = no figure and no header line. */
type Fit = 0 | 1 | 2;

function fitFor(height: number, resting: boolean, stage: boolean): Fit {
  const fixed = BUDGET.table + BUDGET.close + (resting ? BUDGET.rest : BUDGET.switcher);
  const rows = (hero: number, header: number) => height - fixed - hero - header;
  if (rows(BUDGET.hero, BUDGET.header) >= BUDGET.rows) return 0;
  if (!stage && rows(BUDGET.heroCompact, BUDGET.header) >= BUDGET.rows) return 1;
  return 2;
}

/**
 * The list's top edge once it is scrolled (a short phone, or the rest band taking the room): a row
 * leaving under the column head's rule fades out over 16 pt instead of being sliced at the rule.
 * At rest (scrollTop 0, every frame) there is no mask at all. A mask reads only alpha.
 */
const LIST_MASK_SCROLLED = 'linear-gradient(to bottom, transparent, currentColor 16px)';

/** Presentational only: the mask follows the list's own scroll position (no state, no re-render). */
function fadeListEdge(el: HTMLElement) {
  const mask = el.scrollTop > 0 ? LIST_MASK_SCROLLED : '';
  el.style.setProperty('mask-image', mask);
  el.style.setProperty('-webkit-mask-image', mask);
}

/** The gutter the switcher and the rest band bleed into, so the row runs off the screen edge. */
const BLEED_RIGHT = '-mr-6 pr-6 max-[23.5rem]:-mr-4 max-[23.5rem]:pr-4';

/**
 * The guided workout player — frames `workout-1` (a set running) and `workout-2` (record + rest).
 *
 * THE LAW THIS SCREEN IS BUILT AROUND: the page never scrolls while sets are being checked. A
 * lifter checks a set with one hand, mid-rest, often without looking; if the page moved, the check
 * would be somewhere different every time, and the failure is recording a lift that did not happen
 * on a row the schema then freezes. Only the set list scrolls, inside its own box.
 *
 * Pulse composition, top to bottom on the gutter — no card, no header bar, nothing enclosed:
 *
 *   header line   where you are in the session ("1 / 5") · the hero toggle (Videó / Izomtérkép)
 *   hero 187      the exercise title (two lines reserved, balanced) · the side switch · the legend;
 *                 the read-only mannequin on the right, standing on the table's top rule
 *   the table     strong rule · `#  Előző  kg  ism.` · the rows as a ruled scoreboard (64 each)
 *                 · strong rule
 *   bottom cell   the exercise switcher — or, while resting, the rest band over it
 *
 * The ONE lime pill is the check of the active set. No finish-workout control (D3).
 */
export function WorkoutPlayer() {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError, refetch } = useCurrentWorkout();
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


  // The side of the figure, owned by the screen (the map draws the figure alone). Every visit opens
  // on the front; nothing flips it by itself.
  const [side, setSide] = useState<MuscleSide>('front');

  // Q7: what gives way when the column is short. Measured on the column itself, before paint.
  const columnRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [columnHeight, setColumnHeight] = useState(0);
  useLayoutEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    setColumnHeight(el.clientHeight);
    const observer = new ResizeObserver(() => setColumnHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [data?.log]);
  const stageShown = Boolean(intervalBlock && showTimer);
  const fit: Fit = columnHeight > 0 ? fitFor(columnHeight, rest.running, stageShown) : 0;

  // THE ACTIVE ROW STAYS IN REACH. When the rest band rises (49 pt more than the switcher) or the
  // column gives way, the list region shrinks — on a small phone the active row could end up below
  // its fold (the offline line takes its height too). It is scrolled back into view, never focused.
  //
  // The SMALLEST scroll that shows the whole active row, computed from the top every time — not
  // `scrollIntoView({ block: 'nearest' })`, which keeps whatever offset an earlier, shorter column
  // left behind (a 360 x 640 phone opened with row 1 scrolled away and the next figure pressed
  // against the header rule). The 1 pt under the row is its field edges.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[data-active]');
    if (!list || !row) return;
    const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const bottom = top + row.offsetHeight + 1;
    list.scrollTop = Math.min(top, Math.max(0, bottom - list.clientHeight));
    fadeListEdge(list);
  }, [rest.running, fit, activeSetId, columnHeight]);

  if (isPending) {
    return (
      // THE SAME COLUMN AS THE LOADED SCREEN, block for block: a skeleton whose shapes do not match
      // the real geometry causes the layout shift it is there to prevent — and here a shift moves
      // the check. Plain blocks in place of text lines; the figure is withheld, never a grey shape.
      <Screen top="root" gap="none" fill="fixed" bottom="near" role="status" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
        <div className="flex h-11 shrink-0 items-center justify-between">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="flex h-[187px] shrink-0 flex-col gap-3 pt-3">
          <div className="flex h-[68px] w-[268px] max-w-full flex-col justify-center gap-2">
            <Skeleton className="h-6 w-[70%]" />
            <Skeleton className="h-6 w-1/2" />
          </div>
          <div className="flex flex-col gap-4 pt-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <div className="flex shrink-0 flex-col pt-4">
          <Rule strong />
          <div className="flex h-9 items-center">
            <Skeleton className="h-3 w-40" />
          </div>
          <Rule />
          <RowStack as="div">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex h-16 items-end gap-6 pb-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-9 w-6" />
              </div>
            ))}
          </RowStack>
          <Rule strong />
        </div>
        <div className="flex shrink-0 gap-8 pt-8">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </Screen>
    );
  }

  if (isError && !data) {
    return (
      // A FAILED READ IS NOT "NO SESSION". Redirecting here would send a lifter whose session IS
      // running to the library on a network blip, so the failure says so and offers the one way
      // forward: ask again. A refetch that fails while the last answer is still cached keeps the
      // player on screen instead (`data` is still there), which is the right thing mid-set.
      <Screen top="root">
        <h1 className="sr-only">{t('nav.workout')}</h1>
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink onClick={() => void refetch()}>{t('common.retry')}</TextLink>
          }
        >
          {t('workout.loadFailed')}
        </NoticeLine>
      </Screen>
    );
  }

  if (!data?.log) {
    // NO SESSION: THE EDZÉS TAB OPENS THE LIBRARY (owner decision D2). The empty player is never
    // drawn (frame `workout-3` is not built). `replace`, so Back does not return to a URL that
    // would only redirect again. Keep this element literal: `check-nav` names it as a required
    // door (REQUIRED_DOORS), and `verify-gates` probes that deleting it is caught.
    return <Navigate to="/library" replace />;
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
      // `record`, not `success`: a saved form and a personal record are not the same news, so the
      // toast kind carries the trophy. Pulse has ONE toast band, at the top (F13): the old
      // `placement` option is gone with the bottom toasts, and the band drops over the header line,
      // never over the rest band or the next check (frame workout-2).
      //
      // The message is the bare `Új rekord`, not the kind-qualified sentence: that sentence is the
      // ROW's caption, and the toast is not a second permanent statement of the same fact.
      toast(t('workout.recordSpoken'), 'record');
    }
    // `queued` is carried to the row, not swallowed here: the outbox accepted the write but the
    // server has not, so the row has to say `Nincs kapcsolat` instead of sitting there looking
    // untouched. See useWorkout's outbox branch.
    return { records, queued: result.queued === true };
  };

  const lampElsewhere = stageShown && !interval.running;
  const showHeader = fit < 2;
  // The figure and its two steering controls go together (Q7 step 1), and with the stand-in.
  const figureRoom = fit === 0 || stageShown;

  return (
    <Screen top="root" gap="none" fill="fixed" bottom="near">
      <div ref={columnRef} className="flex min-h-0 flex-1 flex-col">
        {/* ── 1 · the header line, 72-116: where you are · the hero toggle ─────────────────────── */}
        {showHeader ? (
          <div className="flex h-11 shrink-0 items-center justify-between gap-6">
            <span className="text-data text-text-1">
              {activeExercise + 1}
              <span className="text-text-2"> / {exercises.length}</span>
            </span>
            {!interval.running ? (
              <div className="flex items-center gap-6">
                {/* The timer toggle exists only on a block that HAS rounds; on a straight set it
                    would be a control that does nothing. */}
                {intervalBlock ? (
                  <TextLink aria-pressed={showTimer} onClick={() => setShowTimer((v) => !v)}>
                    {t('workout.showTimer')}
                  </TextLink>
                ) : null}
                {/* The toggle names the OTHER view. Inert (not removed) on a movement with no
                    taxonomy: the next movement may well have a map, and the toggle has to stay
                    where the thumb learned it. */}
                <TextLink
                  lead={mapShown ? <Play aria-hidden /> : <PersonStanding aria-hidden />}
                  aria-disabled={!mapAvailable || undefined}
                  aria-pressed={mapAvailable ? showMedia : undefined}
                  onClick={() => {
                    if (!mapAvailable) return;
                    setShowMedia((v) => !v);
                  }}
                >
                  {t(mapShown ? 'workout.showMedia' : 'workout.showMuscles')}
                </TextLink>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── 2 · the hero, 116-303: title · side switch · legend · the figure on the right ──── */}
        <div className={cn('relative flex shrink-0 flex-col gap-3 pt-3', figureRoom ? 'h-[187px]' : 'h-20')}>
          <h1 className="min-h-[68px] w-[268px] max-w-[calc(100%-86px)] text-balance text-display uppercase text-text-1">
            {current?.exercise_name_snapshot ?? t('workout.freestyle')}
          </h1>
          {stageShown && intervalBlock ? (
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
              // `unlockAudio()` runs SYNCHRONOUSLY inside the tap handler, before anything awaits:
              // iOS starts every AudioContext suspended and only a real user gesture resumes it.
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
          ) : mapShown && fit === 0 ? (
            <>
              <div className="flex flex-col gap-1">
                <Segmented<MuscleSide>
                  label={t('muscleMap.viewLabel')}
                  options={[
                    { value: 'front', label: t('muscleMap.front') },
                    { value: 'back', label: t('muscleMap.back') },
                  ]}
                  value={side}
                  onChange={setSide}
                  className="self-start"
                />
                {Object.keys(highlights).length > 0 ? (
                  <RoleKey
                    size={6}
                    items={[
                      { role: 'primary', label: t('muscleMap.primary') },
                      { role: 'secondary', label: t('muscleMap.secondary') },
                    ]}
                  />
                ) : null}
              </div>
              {/* Read-only (no `onSelect`), so the map is not a target at all. Head 8 under the
                  hero top, soles on the table's rule, the right hand on the gutter: the box runs 14
                  past it and the screen clips it (FIGURE_BOX; workout-1 x 287, y 111, 105 x 221). */}
              <MuscleMap
                sideControl="none"
                side={side}
                highlights={highlights}
                className="absolute right-[-14px] top-[-5px] h-[221px]"
              />
            </>
          ) : null}
        </div>

        {/* ── 3 · the table: strong rule · header · the rows (the ONLY thing that scrolls) ───── */}
        <div className="flex min-h-0 shrink flex-col pt-4">
          <Rule strong />
          <div aria-hidden className="relative h-9 shrink-0 text-eyebrow uppercase text-text-2">
            <span className={cn('absolute top-[9px]', SET_COLS.idx)}>#</span>
            <span className={cn('absolute top-[9px]', SET_COLS.headPrev)}>{t('workout.previous')}</span>
            <span className={cn('absolute top-[9px]', SET_COLS.headKg)}>{t('workout.kg')}</span>
            <span className={cn('absolute top-[9px]', SET_COLS.headReps)}>{t('workout.reps')}</span>
          </div>
          <Rule />
          {/* `min-h-0` is what lets a flex child scroll instead of growing the column. The 1 pt of
              padding keeps the last row's field edges, which lie ON the closing rule, inside the
              scroll box; the closing rule is drawn over them, as in the frame. */}
          <div
            ref={listRef}
            onScroll={(e) => fadeListEdge(e.currentTarget)}
            // The gutter on both sides is room for the active pill's glow, which a scroll box would clip.
            className="-mx-6 min-h-0 overflow-y-auto overscroll-contain px-6 pb-px max-[23.5rem]:-mx-4 max-[23.5rem]:px-4"
          >
            <RowStack aria-label={t('workout.sets')}>
              {setsForCurrent.map((s) => (
                <SetRow
                  key={s.id}
                  set={s}
                  // A freestyle movement has no `exercise_id`, so it has no history to compare
                  // against and the column is honestly an em-dash there.
                  previous={
                    current?.exercise_id != null
                      ? (previousBySet.get(`${current.exercise_id}:${s.set_index}`) ?? null)
                      : null
                  }
                  onCheck={(v) => onCheck(s.id, v)}
                  onUndo={async () => {
                    await undo.mutateAsync({ setId: s.id, reason: 'undone from the player' });
                    // The rest this set started is no longer resting between anything.
                    rest.stop();
                  }}
                  autoFocus={handoverSetId === s.id}
                  active={activeSetId === s.id}
                  lampElsewhere={lampElsewhere}
                  disabled={check.isPending}
                />
              ))}
            </RowStack>
          </div>
          <Rule strong className="relative z-[2] -mt-px" />
        </div>

        {/* ── 4 · the bottom cell: the exercise switcher, and the rest band rising over it ─────── */}
        <div className="grid shrink-0">
          <nav
            aria-label={t('workout.exercises')}
            inert={rest.running}
            className={cn('[grid-area:1/1] overflow-x-auto overscroll-x-contain pt-5 [scrollbar-width:none]', BLEED_RIGHT)}
          >
            <ul className="flex w-max gap-8">
              {exercises.map((ex, i) => {
                const rows = (data.sets ?? []).filter((s) => s.log_exercise_id === ex.id);
                // `voided_at` matters: the server dropped a voided set from the session totals.
                const done = rows.filter((s) => s.completed_at != null && s.voided_at == null).length;
                const complete = rows.length > 0 && done === rows.length;
                const on = i === activeExercise;
                return (
                  <li key={ex.id}>
                    <Pressable
                      variant="link"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => setActiveExercise(i)}
                      // INTERIM (R-S-workout-03): the kit has no stacked, scrolling rail yet; the link is laid
                      // out as the frame's item here — count over name, 68 high, the ink mark under the name.
                      className="h-[68px] flex-col items-start justify-start gap-0.5 whitespace-nowrap pt-3"
                    >
                      <span className="flex items-center gap-1 text-data">
                        <span className={done > 0 ? (on ? 'text-text-1' : 'text-text-2') : 'text-text-3'}>
                          {done}
                          <span className="text-text-3">/{rows.length}</span>
                        </span>
                        {/* A finished movement gets a tick as well as a full count: the same fact
                            as a shape, readable at arm's length. Done = lime. */}
                        {complete ? <Check aria-hidden className="size-4 text-accent" strokeWidth={2.5} /> : null}
                      </span>
                      <span className={cn('text-body-m', on ? 'text-text-1' : 'text-text-2')}>{ex.exercise_name_snapshot}</span>
                      {on ? <span aria-hidden className="absolute inset-x-0 top-[58px] h-0.5 bg-text-1" /> : null}
                    </Pressable>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="[grid-area:1/1] -mr-6 max-[23.5rem]:-mr-4">
            <RestTimer
              remaining={rest.remaining}
              progress={rest.progress}
              running={rest.running}
              nextUp={nextUp}
              onSkip={rest.stop}
            />
          </div>
        </div>
      </div>
    </Screen>
  );
}

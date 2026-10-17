import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useLocation } from 'react-router';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { Monogram } from '../../ui/data/Monogram';
import { SegmentBar } from '../../ui/data/SegmentBar';
import { Dot } from '../../ui/data/Dot';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import {
  usePlan, useCreateDay, useDeleteDay, useCreateBlock, useDeleteBlock,
  useAddExercise, useDeleteExercise, useReorder, useUpdatePlan, useClonePlan, useCopyDays,
  type PlanBlock, type PlanDay, type PlanExercise, type PlanSummary,
} from './usePlans';
import { useOnline } from './useOnline';
import { useExercises } from '../library/useExercises';
import { useClients } from '../coaching/useCoaching';
import { personLabel } from '../../lib/person';

const STATUSES = ['draft', 'active', 'paused', 'ended'] as const;

/*
 * ═══ THE GLYPH COLUMNS ═════════════════════════════════════════════════════════════════════════
 *
 * Every control on a day, a block and an exercise is a 16 pt glyph in a 44 x 44 target, and the
 * targets stand on ONE grid of 44 pt columns that ends 16 past the right gutter (plan-editor-1/-2:
 * columns at x 218 / 262 / 306 / 350, the trash's INK ending on x 378 while its target reaches
 * 394). `-me-4` is that overhang — placement, the cluster keeps its own width. An empty column is
 * a 44 pt spacer, so the trash never moves when the reorder arrows appear beside it.
 */
function Columns({ children }: { children: ReactNode }) {
  return (
    <div className="-me-4 flex shrink-0 items-center">
      {/* A section head lines its trailing node up with the eyebrow by BASELINE, and a row of
          glyphs has none: the browser would invent one at the 44 pt box's bottom and push the
          eyebrow down. This empty eyebrow line gives the columns the eyebrow's own baseline. */}
      <span aria-hidden className="invisible w-0 text-eyebrow">{'​'}</span>
      {children}
    </div>
  );
}

const EmptyColumn = () => <span aria-hidden className="size-11 shrink-0" />;

/** The disclosure mark of a day: drawn, not operated — the row (or the open day's name) is the button. */
function Disclosure({ open, flush = false }: { open: boolean; flush?: boolean }) {
  return (
    <span aria-hidden className={flush ? '-me-4 flex size-11 items-center justify-center text-text-3' : 'flex size-11 items-center justify-center text-text-3'}>
      {open ? <ChevronUp className="size-4" strokeWidth={1.75} /> : <ChevronDown className="size-4" strokeWidth={1.75} />}
    </span>
  );
}

/** A figure in ink inside a line of quiet words ("4 edzésnap"): the count is split out of the translated string, never re-worded. */
function CountWords({ text, count }: { text: string; count: number }) {
  const figure = String(count);
  const at = text.indexOf(figure);
  if (at < 0) return <span className="text-data text-text-2">{text}</span>;
  return (
    <span className="text-data text-text-2">
      {text.slice(0, at)}
      <span className="text-text-1">{figure}</span>
      {text.slice(at + figure.length)}
    </span>
  );
}

/**
 * The plan editor — [[55-Screens/coach-plan-editor]].
 *
 * ═══ THE CYCLE STRIP IS THE SCREEN ═════════════════════════════════════════════════════════════
 *
 * A plan IS a cycle, and the strip is the only element that shows the whole of it at once: where
 * the rest days fall, whether the week is front-loaded, whether a slot is still empty. The old
 * editor made that shape derivable only by scrolling four collapsed cards and counting, because
 * the top of the screen was spent on a wrapping row of four status pills — a control used a few
 * times in a plan's life, sitting where the thing looked at every single visit belongs.
 *
 * Status is now a word in the meta line that discloses the four options when tapped.
 *
 * ═══ REORDERING IS UP/DOWN BUTTONS, NOT DRAG ═══════════════════════════════════════════════════
 *
 * A deliberate first cut rather than an unfinished one. A drag needs a pointer, a keyboard, a
 * screen-reader and a touch path before it is usable by everyone; two buttons are all four at
 * once, meet the 44px floor, and send the same whole-list reorder the server expects.
 *
 * On an EXERCISE row they are revealed rather than removed: the row at rest carries its trash
 * only, and selecting the row (tap, or focus from the keyboard) reveals its two chevrons with the
 * first and last item's respective arrow disabled. Removing them outright would delete the only
 * accessible way to reorder inside a superset, which is a completely ordinary edit — and hiding
 * them behind `hover` would have deleted it on exactly the devices this app is used on.
 */
export function PlanEditorPage() {
  const { t } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const planId = Number.parseInt(params.id ?? '', 10);
  const { data, isPending, isError } = usePlan(Number.isFinite(planId) ? planId : null);
  const online = useOnline();
  const offline = !online;

  const updatePlan = useUpdatePlan();
  const createDay = useCreateDay();
  const deleteDay = useDeleteDay();
  const createBlock = useCreateBlock();
  const deleteBlock = useDeleteBlock();
  const addExercise = useAddExercise();
  const deleteExercise = useDeleteExercise();
  const reorder = useReorder();
  const clone = useClonePlan();
  const copyDays = useCopyDays();
  const clients = useClients();
  const navigate = useNavigate();
  // The host is already mounted app-wide in `app/providers.tsx`; this is the whole wiring.
  const { toast } = useToast();

  const [openDay, setOpenDay] = useState<number | null>(null);
  const [activeExercise, setActiveExercise] = useState<number | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pickerBlock, setPickerBlock] = useState<number | null>(null);
  // Collapsed rather than open, so a block is expanded until the coach says otherwise: the day was
  // just opened to look at what is in it. A Set of ids, not a single id — collapsing one block must
  // not re-open another.
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<number>>(new Set());
  const [cloning, setCloning] = useState(false);
  const [copyNotice, setCopyNotice] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  // `null` means "untouched", which is what makes the header pill honest: it is disabled until one
  // of the plan-level fields actually differs from the server's copy. Holding the plan's own value
  // in state instead would make every freshly-loaded plan look like it had unsaved work.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<PlanSummary['status'] | null>(null);

  // A CLIENT plan knows whose it is, so the picker can be annotated against that client without
  // asking anyone. On a template there is no client and the flags simply do not appear — which is
  // correct: a template is written for nobody in particular.
  const forClient = data?.plan?.coach_client_id ?? undefined;
  const results = useExercises({ q: search || undefined, forClient }, 'hu');

  /*
   * The library's `Új terv` creates a draft with a default name and lands here. If the title does
   * not arrive focused AND selected, that library fills with rows that all read the same string —
   * the naming step was MOVED here, so losing it here loses it entirely.
   */
  const nameInput = useRef<HTMLInputElement>(null);
  /* Live connectivity for the undo toasts below. A ref rather than the `offline` local, because an
     undo callback outlives the render that created it: the value captured at delete time is stale
     by the time the toast is tapped, which is exactly the window a connection drops in. Declared
     up here with the other hooks — the helpers that read it sit after this component's early
     returns, and a `useRef` down there would be a conditional hook. */
  const onlineNow = useRef(true);
  onlineNow.current = !offline;
  const wantsName = Boolean((location.state as { focusName?: boolean } | null)?.focusName);
  const loaded = !isPending && Boolean(data?.plan);
  useEffect(() => {
    if (!wantsName || !loaded) return;
    const el = nameInput.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [wantsName, loaded]);

  /*
   * A CYCLE LONGER THAN SEVEN DAYS. The strip keeps its pitch and scrolls sideways (the kit's
   * `perView`), so two things are the page's to keep honest: the lit (open) slot must be on screen
   * whichever way the day was opened — a day row far below opens day 11 just as well as its slot —
   * and a strip with more days than it shows must say so. The first is a sideways scroll of the
   * strip ONLY (never `scrollIntoView`, which would also drag the page up to the strip); the second
   * is the strip feathering out at the edge that has more days behind it.
   */
  const strip = useRef<HTMLDivElement>(null);
  const [stripMore, setStripMore] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });
  const cycleDays = data?.plan?.cycle_days ?? 0;
  const readStripEdges = () => {
    const scroller = strip.current?.querySelector<HTMLElement>('[data-kit="segBar"]');
    if (!scroller) return;
    const start = scroller.scrollLeft > 1;
    const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
    setStripMore((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  };
  useEffect(() => {
    const scroller = strip.current?.querySelector<HTMLElement>('[data-kit="segBar"]');
    if (!scroller) return;
    const lit = scroller.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (lit) {
      // Comfortably on screen = a whole slot clear of either edge, out of the feather and with
      // the next day showing beside it. Otherwise the lit slot is brought to the middle (the
      // browser clamps the scroll at both ends, so day 1 or day 14 simply sit at their edge).
      const box = scroller.getBoundingClientRect();
      const slot = lit.getBoundingClientRect();
      if (slot.left < box.left + slot.width || slot.right > box.right - slot.width) {
        scroller.scrollLeft += slot.left + slot.width / 2 - (box.left + box.width / 2);
      }
    }
    readStripEdges();
    // `readStripEdges` only reads the DOM and sets state through an updater: no dependency of its own.
  }, [openDay, cycleDays, loaded]);

  if (isPending) {
    return (
      <Screen top="push" role="status" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
        {/* Where the name will stand, and where the cycle will stand — one block each. The strip is
            NOT drawn as seven slots: a row of slots from nothing would claim a cycle length that
            nothing has confirmed yet. */}
        <Skeleton className="mt-15 h-7 w-1/2" />
        <Skeleton className="h-14 w-full" />
      </Screen>
    );
  }

  if (isError || !data?.plan) {
    // One message for "not yours", "archived" and "never existed" alike — including the member who
    // reached this URL. The server refuses either way, and telling them which it was tells them
    // whether the plan exists.
    return (
      <Screen top="push">
        {/* The way back, as on every pushed screen (EDZÉSTERVEK from `routeMeta`): without it the
            tab bar was the only way out of a plan the server refused. */}
        <ScreenHeader kind="push" />
        <EmptyState title={t('plans.missingTitle')} heading="h1" body={t('plans.missingBody')} />
      </Screen>
    );
  }

  const { plan, days, blocks, exercises } = data;
  const usedIndexes = new Set(days.map((d) => d.day_index));
  const nextFreeIndex = Array.from({ length: plan.cycle_days }, (_, i) => i).find((i) => !usedIndexes.has(i));
  const dayByIndex = new Map(days.map((d) => [d.day_index, d]));
  const trainingDays = days.filter((d) => !d.is_rest).length;

  const nameValue = nameDraft ?? plan.name;
  const statusValue = statusDraft ?? plan.status;
  const nameChanged = nameValue.trim().length > 0 && nameValue.trim() !== plan.name;
  const statusChanged = statusValue !== plan.status;
  const canSave = (nameChanged || statusChanged) && !offline;

  const blocksOf = (dayId: number) => blocks.filter((b) => b.day_id === dayId).sort((a, b) => a.position - b.position);
  const exercisesOf = (blockId: number) =>
    exercises.filter((e) => e.block_id === blockId).sort((a, b) => a.position - b.position);

  const move = async (what: 'blocks' | 'exercises', list: (PlanBlock | PlanExercise)[], index: number, delta: number) => {
    const next = [...list];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    await reorder.mutateAsync({ planId, what, ids: next.map((x) => x.id) });
  };

  /* ── DELETE, WITH A WAY BACK ─────────────────────────────────────────────
     A trash tap on a day card takes the day and every block and exercise inside it, immediately
     and irreversibly, and until now said nothing at all. The spec's answer is an undo toast rather
     than a confirm sheet: a confirm interrogates every delete including the ones that were meant,
     while an undo costs nothing until the one that was not.

     Three things make it an undo rather than a gesture:

     · THE SNAPSHOT IS TAKEN BEFORE THE MUTATION. Every plan mutation invalidates the whole
       ['plans'] namespace, so a lazy read inside `onUndo` would find the rows already gone.
     · THE REPLAY IS MAPPED, NOT ECHOED. All three POST schemas are `.strict()` and none of them
       accepts the shape the GET returns — `is_rest` is `0 | 1` on the wire and a boolean on the
       way in, and the exercise endpoint REJECTS `target_weight_kg`, because the server computes
       canonical kilograms itself from `target_weight` + `target_weight_unit` and a CHECK enforces
       that the pair agrees. Echoing a row verbatim is a 400 on every single exercise.
     · A ROW THAT CANNOT COME BACK FAITHFULLY GETS NO UNDO. `exercise_name_snapshot` is derived
       server-side from the joined exercise and is never client-supplied, so a row whose source
       exercise is gone (`exercise_id === null`) returns named "Exercise". The toast still says
       what happened; it just does not offer a button that would quietly rename the work.

     The host's limits are accepted rather than fought: a 4s dwell and a hard cap of three toasts,
     so a burst of deletes pushes the oldest undo off screen. That is `ToastHost`'s decision. */

  const runUndo = (job: () => Promise<void>) => {
    // One try, one message. A half-restored day that says nothing is the same defect this exists
    // to remove, and an undo tapped after the connection dropped must fail loudly, not silently.
    if (!onlineNow.current) {
      toast(t('plans.undoFailed'), 'error');
      return;
    }
    void job().catch(() => toast(t('plans.undoFailed'), 'error'));
  };

  const undoable = (rows: PlanExercise[]) => rows.every((r) => r.exercise_id != null);

  /** The POST body for one prescribed exercise, under whatever block it is being restored into. */
  const exerciseBody = (ex: PlanExercise, blockId: number) => ({
    planId,
    block_id: blockId,
    exercise_id: ex.exercise_id,
    position: ex.position,
    target_metric: ex.target_metric,
    load_mode: ex.load_mode,
    target_sets: ex.target_sets,
    target_reps_min: ex.target_reps_min,
    target_reps_max: ex.target_reps_max,
    target_seconds: ex.target_seconds,
    target_distance_m: ex.target_distance_m,
    // What the coach TYPED, in the unit they typed it in — never the canonical kilograms.
    target_weight: ex.target_weight_entry_value,
    target_weight_unit: ex.target_weight_entry_unit ?? 'kg',
    target_percent_1rm: ex.target_percent_1rm,
    target_rpe: ex.target_rpe,
    rest_seconds: ex.rest_seconds,
    tempo: ex.tempo,
    notes: ex.notes,
  });

  /** One block and its rows, awaited in order because each child needs the parent's fresh id. */
  const replayBlock = async (block: PlanBlock, rows: PlanExercise[], dayId: number) => {
    const created = await createBlock.mutateAsync({
      planId,
      day_id: dayId,
      kind: block.kind,
      position: block.position,
      rounds: block.rounds,
      rest_seconds: block.rest_seconds,
      cap_seconds: block.cap_seconds,
      label: block.label,
    });
    for (const ex of rows) await addExercise.mutateAsync(exerciseBody(ex, created.id));
  };

  const removeDay = async (day: PlanDay) => {
    const dayBlocks = blocksOf(day.id);
    const rows = new Map(dayBlocks.map((b) => [b.id, exercisesOf(b.id)]));
    await deleteDay.mutateAsync({ planId, dayId: day.id });
    const faithful = [...rows.values()].every(undoable);
    toast(
      t('plans.dayDeleted'),
      'info',
      faithful
        ? {
            onUndo: () =>
              runUndo(async () => {
                const created = await createDay.mutateAsync({
                  planId,
                  // `day_index` and `slot` are replayed, or the day comes back in the wrong slot
                  // of the cycle — which is the one thing the strip above exists to show.
                  day_index: day.day_index,
                  slot: day.slot,
                  name: day.name,
                  notes: day.notes,
                  is_rest: Boolean(day.is_rest),
                  est_minutes: day.est_minutes,
                  start_time: day.start_time,
                });
                for (const b of dayBlocks) await replayBlock(b, rows.get(b.id) ?? [], created.id);
              }),
          }
        : undefined,
    );
  };

  const removeBlock = async (block: PlanBlock) => {
    const rows = exercisesOf(block.id);
    await deleteBlock.mutateAsync({ planId, blockId: block.id });
    toast(
      t('plans.blockDeleted'),
      'info',
      undoable(rows)
        ? { onUndo: () => runUndo(() => replayBlock(block, rows, block.day_id)) }
        : undefined,
    );
  };

  const removeExercise = async (ex: PlanExercise) => {
    await deleteExercise.mutateAsync({ planId, rowId: ex.id });
    toast(
      t('plans.exerciseDeleted'),
      'info',
      undoable([ex])
        ? {
            onUndo: () =>
              runUndo(async () => {
                await addExercise.mutateAsync(exerciseBody(ex, ex.block_id));
              }),
          }
        : undefined,
    );
  };

  /* Only what CHANGED goes over the wire — a PATCH that resends the name on a status flip is a
     write that can collide with an edit made on another device for no reason. */
  const save = async () => {
    const body: Record<string, unknown> = {};
    if (nameChanged) body.name = nameValue.trim();
    if (statusChanged) body.status = statusValue;
    if (Object.keys(body).length === 0) return;
    await updatePlan.mutateAsync({ id: planId, ...body });
    // The drafts are NOT cleared here. Clearing them would fall back to `plan.name` for the frame
    // between the mutation resolving and the refetch landing, so the title would flicker back to
    // the old name after a rename. They stop counting as pending the moment the server's copy
    // agrees with them — and if the write fails, the coach's typing is still on screen.
  };


  /* ── The render ───────────────────────────────────────────────────────────────────────────────
     Inline functions that RETURN elements, never components declared in here: a component
     declared inside the render gets a new identity on every render, React remounts it, and the
     keyboard focus you just put on a slot or a row is thrown away. */

  const exerciseTarget = (ex: PlanExercise) =>
    `${ex.target_sets} × ${ex.target_reps_min ?? '?'}` +
    (ex.target_reps_max && ex.target_reps_max !== ex.target_reps_min ? `–${ex.target_reps_max}` : '') +
    (ex.target_weight_entry_value != null ? ` · ${ex.target_weight_entry_value} ${ex.target_weight_entry_unit}` : '');

  const closePicker = () => {
    setPickerBlock(null);
    setSearch('');
  };

  /** A closed day: the index row — numeral, name, start time, the disclosure mark and the trash. */
  const dayRow = (day: PlanDay) => (
    <ListRow
      key={day.id}
      leadSlot
      lead={<Monogram initials={String(day.day_index + 1)} tone={day.is_rest ? 'pending' : 'ink'} />}
      // The visible numeral replaces the old "N. nap" caption; the words stay for assistive tech,
      // so the row is still announced (and found) as "<name> N. nap".
      title={
        <>
          {day.name}
          <span className="sr-only"> {t('plans.dayIndex', { n: day.day_index + 1 })}</span>
        </>
      }
      tone={day.is_rest ? 'muted' : 'default'}
      // `||` rather than `??`: `start_time` is `string | null`, and an empty string is no time either.
      sub={day.start_time || t('plans.noTime')}
      subFace={day.start_time ? 'data' : 'cap'}
      trailing={<Disclosure open={false} flush />}
      aria-expanded={false}
      onClick={() => setOpenDay(day.id)}
      control={
        <Pressable
          variant="link"
          shape="icon"
          glyph="sm"
          tone="dangerQuiet"
          className="-me-4"
          aria-label={t('plans.deleteDay')}
          disabled={offline}
          onClick={() => void removeDay(day)}
        >
          <Trash2 />
        </Pressable>
      }
    />
  );

  /** One exercise of a block. Selecting it (tap, or keyboard focus) reveals its two reorder arrows. */
  const exerciseRow = (ex: PlanExercise, xi: number, arr: PlanExercise[]) => {
    const picked = activeExercise === ex.id;
    // `ListRow` has no `onFocus`; focus events bubble in React, so the wrapper hears the row's own
    // button being focused (and only that — the controls beside it are not the row). Only KEYBOARD
    // focus selects: a pointer focuses the button on press, and selecting there would make the
    // click that follows toggle the row straight back off.
    const onRowFocus = (event: FocusEvent<HTMLDivElement>) => {
      const el = event.target;
      if (el instanceof HTMLElement && el.hasAttribute('data-row-pad') && el.matches(':focus-visible')) setActiveExercise(ex.id);
    };
    return (
      <div key={ex.id} onFocus={onRowFocus}>
        <ListRow
          title={ex.name ?? ex.exercise_name_snapshot}
          sub={exerciseTarget(ex)}
          subFace="data"
          aria-expanded={picked}
          onClick={() => setActiveExercise(picked ? null : ex.id)}
          control={
            <Columns>
              {picked ? (
                <>
                  <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label={t('plans.moveUp')} disabled={xi === 0 || offline} onClick={() => void move('exercises', arr, xi, -1)}>
                    <ArrowUp />
                  </Pressable>
                  <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label={t('plans.moveDown')} disabled={xi === arr.length - 1 || offline} onClick={() => void move('exercises', arr, xi, 1)}>
                    <ArrowDown />
                  </Pressable>
                  <EmptyColumn />
                </>
              ) : null}
              <Pressable variant="link" shape="icon" glyph="sm" tone="dangerQuiet" aria-label={t('plans.removeExercise')} disabled={offline} onClick={() => void removeExercise(ex)}>
                <Trash2 />
              </Pressable>
            </Columns>
          }
        />
      </div>
    );
  };

  /** The exercise picker, in place of "+ Gyakorlat": the list it adds to stays in view while you search. */
  const picker = (block: PlanBlock) => (
    <div className="mt-2 flex flex-col">
      <Field label={t('plans.findExercise')} value={search} autoFocus onChange={(e) => setSearch(e.target.value)} />
      {/* At most three and a half rows (a row is 56 + its hairline): the half row cut at the
          bottom is what says the list scrolls. The closing rule is the scroller's own, so it
          stays under the list instead of scrolling away with the last row. */}
      <div className={(results.data?.pages?.[0]?.exercises ?? []).length > 0 ? 'max-h-50 overflow-y-auto border-b border-hair-strong' : 'max-h-50 overflow-y-auto'}>
        <RowStack>
          {(results.data?.pages?.[0]?.exercises ?? []).slice(0, 12).map((r) => {
            /* FLAGS, NOT A FILTER. The coach may know the client's knee is fine this week, or that the
               gym has kit the questionnaire predates. An option that vanishes teaches them nothing;
               one that carries a reason lets them decide. */
            const avoid = r.conflicts?.some((c) => c.severity === 'avoid' && c.relation === 'loads');
            const flags =
              r.missing_equipment?.length || r.conflicts?.length ? (
                <span className="flex items-baseline gap-3">
                  {r.missing_equipment?.length ? (
                    <span className="text-data text-text-2">{t('plans.missingKit', { count: r.missing_equipment.length })}</span>
                  ) : null}
                  {r.conflicts?.length ? (
                    <span
                      className={avoid ? 'text-micro text-danger' : 'text-micro text-warning'}
                      title={r.conflicts.map((c) => t(`onboarding.area.${c.body_area}`)).join(', ')}
                    >
                      {t(`onboarding.area.${r.conflicts[0].body_area}`)}
                    </span>
                  ) : null}
                </span>
              ) : undefined;
            return (
              <ListRow
                key={r.id}
                title={r.name}
                trailing={flags}
                disabled={offline}
                onClick={async () => {
                  await addExercise.mutateAsync({
                    planId, block_id: block.id, exercise_id: r.id,
                    target_sets: 3, target_reps_min: 8,
                  });
                  closePicker();
                }}
              />
            );
          })}
        </RowStack>
      </div>
      <div className="flex h-11 items-center">
        <TextLink text="body" onClick={closePicker}>
          {t('common.cancel')}
        </TextLink>
      </div>
    </div>
  );

  /** A block of the open day: a section head with its four columns, then its rows. */
  const blockSection = (block: PlanBlock, bi: number, dayBlocks: PlanBlock[]) => {
    const collapsed = collapsedBlocks.has(block.id);
    const rows = exercisesOf(block.id);
    // A superset or a circuit is ONE group: its rows step in 20 behind a single edge line.
    const grouped = block.kind !== 'single' && rows.length > 1;
    const list = <RowStack>{rows.map((ex, xi, arr) => exerciseRow(ex, xi, arr))}</RowStack>;
    return (
      <section key={block.id} className="flex flex-col gap-group">
        <SectionHeader
          heading="h3"
          title={`${t(`plans.blockKind.${block.kind}`)}${block.rounds ? ` · ${t('plans.rounds', { n: block.rounds })}` : ''}`}
          trailing={
            <Columns>
              <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label={t('plans.moveUp')} disabled={bi === 0 || offline} onClick={() => void move('blocks', dayBlocks, bi, -1)}>
                <ArrowUp />
              </Pressable>
              <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label={t('plans.moveDown')} disabled={bi === dayBlocks.length - 1 || offline} onClick={() => void move('blocks', dayBlocks, bi, 1)}>
                <ArrowDown />
              </Pressable>
              <Pressable
                variant="link"
                shape="icon"
                glyph="sm"
                tone="faint"
                aria-label={t('plans.collapseBlock')}
                aria-expanded={!collapsed}
                aria-controls={`block-${block.id}`}
                onClick={() =>
                  setCollapsedBlocks((prev) => {
                    const next = new Set(prev);
                    if (next.has(block.id)) {
                      next.delete(block.id);
                      return next;
                    }
                    next.add(block.id);
                    // Collapsing the block unmounts the picker, so its state must not stay
                    // pointing at a block nobody can see.
                    if (pickerBlock === block.id) closePicker();
                    return next;
                  })
                }
              >
                {collapsed ? <ChevronDown /> : <ChevronUp />}
              </Pressable>
              <Pressable variant="link" shape="icon" glyph="sm" tone="danger" aria-label={t('plans.deleteBlock')} disabled={offline} onClick={() => void removeBlock(block)}>
                <Trash2 />
              </Pressable>
            </Columns>
          }
        />
        {/* The block body, behind its own disclosure: `aria-controls` resolves to this element. */}
        {collapsed ? null : (
          <div id={`block-${block.id}`} className="flex flex-col">
            {grouped ? (
              <div className="relative ps-5">
                <span aria-hidden className="absolute inset-y-3 start-0 w-0.5 bg-edge" />
                {list}
              </div>
            ) : (
              list
            )}
            {pickerBlock === block.id ? (
              picker(block)
            ) : (
              <div className="flex h-11 items-center">
                <TextLink text="body" lead={<Plus />} disabled={offline} onClick={() => setPickerBlock(block.id)}>
                  {t('plans.addExercise')}
                </TextLink>
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  /** The ONE open day: its head, its name as the screen's subject line, its blocks, the add-block links. */
  const openDaySection = (day: PlanDay) => {
    const dayBlocks = blocksOf(day.id);
    const close = () => setOpenDay(null);
    return (
      <section key={day.id} className="flex flex-col">
        <SectionHeader
          trailing={
            <Columns>
              {/* The pointer's way to close the day. The name below is the one accessible toggle,
                  so this copy of it stays out of the tab order and the accessibility tree. */}
              <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-hidden tabIndex={-1} onClick={close}>
                <ChevronUp />
              </Pressable>
              <Pressable variant="link" shape="icon" glyph="sm" tone="danger" aria-label={t('plans.deleteDay')} disabled={offline} onClick={() => void removeDay(day)}>
                <Trash2 />
              </Pressable>
            </Columns>
          }
        >
          <p className="flex h-5 min-w-0 flex-1 items-baseline gap-2.5">
            <span className="text-eyebrow text-text-2">{t('plans.dayIndex', { n: day.day_index + 1 })}</span>
            {day.start_time ? <span className="text-data text-text-1">{day.start_time}</span> : null}
          </p>
        </SectionHeader>
        {/* The day's name is the screen's subject line AND the open day's toggle (a link look, so the
            48 pt words carry the type on a child: the link's own step would win on the button). */}
        <h2 className="mt-4 flex min-w-0">
          {/* Named as written, not as drawn: the display face upper-cases the words, and a name
              read out in capitals is spelled letter by letter by some screen readers. */}
          <Pressable
            variant="link"
            aria-expanded
            aria-label={`${day.name} ${t('plans.dayIndex', { n: day.day_index + 1 })}`}
            onClick={close}
            className="min-w-0 max-w-full"
          >
            <span className="min-w-0 truncate text-display-xl text-text-1">{day.name}</span>
          </Pressable>
        </h2>
        <div className="mt-7 flex flex-col gap-group">
          {dayBlocks.map((block, bi) => blockSection(block, bi, dayBlocks))}
          <div role="group" aria-label={t('plans.addBlock')} className="flex flex-wrap gap-x-6 border-t border-hair-strong">
            {(['single', 'superset', 'circuit'] as const).map((kind) => (
              <div key={kind} className="flex h-11 items-center">
                <TextLink
                  text="body"
                  lead={<Plus />}
                  busy={createBlock.isPending}
                  disabled={offline}
                  onClick={() =>
                    void createBlock.mutateAsync({
                      planId,
                      day_id: day.id,
                      kind,
                      position: dayBlocks.length,
                      // A circuit repeats the BLOCK, so the schema requires a round count. Defaulting
                      // it here means the coach is not shown a constraint error for a field the form
                      // never offered.
                      ...(kind === 'circuit' ? { rounds: 3 } : {}),
                    })
                  }
                >
                  {t(`plans.blockKind.${kind}`)}
                </TextLink>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };

  const openIndex = days.findIndex((d) => d.id === openDay);
  const daysBefore = openIndex < 0 ? days : days.slice(0, openIndex);
  const daysAfter = openIndex < 0 ? [] : days.slice(openIndex + 1);
  const isActive = statusValue === 'active';

  return (
    <Screen top="push">
      {/* The commit lives in the header so it is reachable without scrolling to the end of a long
          plan — and it is disabled unless a plan-level field is actually pending, because every
          structural edit below (a day, a block, an exercise, a reorder) commits immediately and a
          pill implying otherwise would be a lie in every state but one. The way back and the
          parent's name come from `routeMeta` (/coach/plans/:id -> /coach/plans, "Edzéstervek"). */}
      <ScreenHeader
        kind="push"
        trailing={
          <Pressable variant="primary" size="sm" busy={updatePlan.isPending} disabled={!canSave} onClick={() => void save()}>
            {t('common.save')}
          </Pressable>
        }
      >
        {/* The visible title IS the input — a plan is renamed by typing over it, not by opening a
            form. The heading is kept for document structure: an input contributes no text to a
            heading's accessible name, so an `h1` wrapping one is an `h1` nobody can navigate to. */}
        <h1 className="sr-only">{nameValue}</h1>
        <div className="mt-3 flex flex-col gap-1">
          <Field variant="title" label={t('plans.newName')} ref={nameInput} maxLength={120} value={nameValue} onChange={(e) => setNameDraft(e.target.value)} />
          {/* ONE meta line: the status word that opens its sheet, the revision on the right. */}
          <div className="flex h-8 items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {isActive ? <Dot /> : null}
              <TextLink
                text="cap"
                trail={<ChevronDown />}
                aria-haspopup="dialog"
                aria-expanded={statusOpen}
                onClick={() => setStatusOpen((v) => !v)}
              >
                {t(`plans.status.${statusValue}`)}
              </TextLink>
            </div>
            <span className="text-data text-text-2">{t('plans.revision', { n: plan.revision })}</span>
          </div>
        </div>
      </ScreenHeader>

      {/* ── THE CYCLE STRIP IS THE SCREEN: seven numerals over one segment bar, every slot a button. */}
      <section aria-label={t('plans.cycle', { days: plan.cycle_days })} className="flex flex-col gap-3">
        <SectionHeader
          rule={false}
          title={t('plans.cycle', { days: plan.cycle_days })}
          trailing={<CountWords text={t('plans.trainingDayCount', { count: trainingDays })} count={trainingDays} />}
        />
        {/* The wrapper is the strip's own box (the strip overhangs the gutter by 4 on each side, and
            so does this): the feather is a mask on it, at the edge that has more days behind it.
            Scroll events do not bubble; the capture phase still passes through here. */}
        <div
          ref={strip}
          className="-mx-1 px-1"
          onScrollCapture={readStripEdges}
          style={
            stripMore.start || stripMore.end
              ? {
                  maskImage: `linear-gradient(to right, ${stripMore.start ? 'transparent, black 2rem' : 'black, black'}, ${stripMore.end ? 'black calc(100% - 2rem), transparent' : 'black'})`,
                }
              : undefined
          }
        >
        <SegmentBar
          // A cycle longer than the view cuts the next slot at the edge: the kit's cue that the
          // strip scrolls. The kit floors `perView` today (R-S-plan-editor-fix-01 lets it take
          // 7.5); until that lands the page sets the same 7.5-slot pitch on the slots itself, so a
          // 14-day strip never looks like a 7-day one. Drop the class when the request lands.
          perView={plan.cycle_days > 7 ? 7.5 : 7}
          className={plan.cycle_days > 7 ? '[&_[data-kit=segSlot]]:!w-[calc(100%/7.5)]' : undefined}
          label={t('plans.cycle', { days: plan.cycle_days })}
          slots={Array.from({ length: plan.cycle_days }, (_, i) => {
            const day = dayByIndex.get(i);
            const selected = day != null && openDay === day.id;
            const label = t('plans.dayIndex', { n: i + 1 });
            return {
              state: selected ? ('on' as const) : day && !day.is_rest ? ('half' as const) : ('off' as const),
              label: day ? i + 1 : <Plus />,
              labelTone: day && !day.is_rest ? ('ink' as const) : ('pending' as const),
              pressed: day ? selected : undefined,
              busy: !day && createDay.isPending,
              disabled: !day && offline,
              srText: day ? `${day.name} · ${label}` : `${t('plans.addDay')} · ${label}`,
              onPress: () => {
                if (day) {
                  setOpenDay(selected ? null : day.id);
                  return;
                }
                void createDay.mutateAsync({ planId, day_index: i, name: label });
              },
            };
          })}
        />
        </div>
      </section>

      {/* The server refuses to activate a client plan with no start date — it would generate zero
          occurrences and the client would see an empty home screen forever. Saying so here means
          the coach reads a REASON in advance rather than a rejection afterwards. */}
      {plan.scope === 'client' && !plan.starts_on ? (
        <NoticeLine tone="danger" role="alert">
          {t('plans.needsStart')}
        </NoticeLine>
      ) : null}

      {days.length === 0 ? (
        <EmptyState title={t('plans.noDaysTitle')} body={t('plans.noDaysBody')} />
      ) : (
        <div className="flex flex-col gap-section">
          {daysBefore.length > 0 ? <RowStack open>{daysBefore.map(dayRow)}</RowStack> : null}
          {openIndex >= 0 ? openDaySection(days[openIndex]) : null}
          {daysAfter.length > 0 ? <RowStack open>{daysAfter.map(dayRow)}</RowStack> : null}
        </div>
      )}

      {/* ── The plan foot: the things done once per plan, not once per edit. */}
      <div className="flex flex-col gap-group">
        <RowStack open close>
          {/* Handing a template to a client. The whole reason templates exist, and it is a DEEP COPY:
              the two plans are independent the moment it lands. */}
          <ListRow
            leadSlot
            lead={<Copy />}
            title={t('plans.cloneOpen')}
            className="min-h-16"
            disabled={offline}
            aria-expanded={cloning}
            onClick={() => setCloning((v) => !v)}
          />
          {cloning ? (
            <div className="flex flex-col gap-group py-4">
              <p className="text-cap text-text-2">{t('plans.cloneHint')}</p>
              <RowStack>
                {(clients.data?.clients ?? []).map((c) => (
                  <ListRow
                    key={c.link_id}
                    title={personLabel(c)}
                    busy={clone.isPending}
                    disabled={offline}
                    onClick={async () => {
                      const created = await clone.mutateAsync({
                        id: planId,
                        coach_client_id: c.link_id,
                        name: `${plan.name} — ${personLabel(c)}`,
                      });
                      setCloning(false);
                      void navigate(`/coach/plans/${created.id}`);
                    }}
                  />
                ))}
              </RowStack>
              <div className="flex h-11 items-center">
                <TextLink
                  text="body"
                  lead={<Copy />}
                  busy={clone.isPending}
                  disabled={offline}
                  onClick={async () => {
                    const created = await clone.mutateAsync({ id: planId, name: `${plan.name} (2)` });
                    setCloning(false);
                    void navigate(`/coach/plans/${created.id}`);
                  }}
                >
                  {t('plans.cloneAsTemplate')}
                </TextLink>
              </div>
            </div>
          ) : null}
          {/* Copy the whole cycle forward — the consequence is stated on the row, not discovered after. */}
          {days.length > 0 ? (
            <ListRow
              leadSlot
              lead={<Copy />}
              title={t('plans.duplicateCycle', { days: plan.cycle_days })}
              // A two-digit cycle ("A teljes 14 napos ciklus másolása előre") no longer fits one
              // line at 354 - 44; the sentence wraps instead of losing its end.
              lines={2}
              className="min-h-16"
              busy={copyDays.isPending}
              disabled={offline}
              onClick={async () => {
                const result = await copyDays.mutateAsync({
                  planId,
                  day_ids: days.map((d) => d.id),
                  offset: plan.cycle_days,
                });
                setCopyNotice(result.cycleGrewTo);
              }}
            />
          ) : null}
        </RowStack>
        {/* Growing the cycle re-dates every future occurrence, and the strip above re-renders at the
            new length — which is the honest way to show what just happened. */}
        {copyNotice ? (
          <NoticeLine tone="warn" role="status">
            {t('plans.cycleGrew', { days: copyNotice })}
          </NoticeLine>
        ) : null}
        {nextFreeIndex !== undefined ? (
          <div className="flex h-11 items-center">
            <TextLink
              text="body"
              lead={<Plus />}
              busy={createDay.isPending}
              disabled={offline}
              onClick={() =>
                void createDay.mutateAsync({
                  planId,
                  day_index: nextFreeIndex,
                  name: t('plans.dayIndex', { n: nextFreeIndex + 1 }),
                })
              }
            >
              {t('plans.addDay')}
            </TextLink>
          </div>
        ) : (
          // Every slot in the cycle is taken. Saying so beats a link that returns a constraint error.
          <p className="text-cap text-text-2">{t('plans.cycleFull', { days: plan.cycle_days })}</p>
        )}
      </div>

      {/* The status picker: four words, the current one marked; nothing is sent until "Mentés". */}
      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title={t('plans.statusTitle')}>
        <ChipRow wrap label={t('plans.statusTitle')} disabled={offline}>
          {STATUSES.map((s) => (
            <Chip
              key={s}
              selected={statusValue === s}
              onClick={() => {
                setStatusDraft(s);
                setStatusOpen(false);
              }}
            >
              {t(`plans.status.${s}`)}
            </Chip>
          ))}
        </ChipRow>
      </Sheet>
    </Screen>
  );
}

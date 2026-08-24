import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useNavigate, useLocation } from 'react-router';
import {
  AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Copy, Dumbbell, Layers, Moon, Plus, Trash2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import {
  usePlan, useCreateDay, useDeleteDay, useCreateBlock, useDeleteBlock,
  useAddExercise, useDeleteExercise, useReorder, useUpdatePlan, useClonePlan, useCopyDays,
  type PlanBlock, type PlanExercise, type PlanSummary,
} from './usePlans';
import { useOnline } from './useOnline';
import { useExercises } from '../library/useExercises';
import { useClients } from '../coaching/useCoaching';
import { personLabel } from '../../lib/person';

const STATUSES = ['draft', 'active', 'paused', 'ended'] as const;

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
  const wantsName = Boolean((location.state as { focusName?: boolean } | null)?.focusName);
  const loaded = !isPending && Boolean(data?.plan);
  useEffect(() => {
    if (!wantsName || !loaded) return;
    const el = nameInput.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [wantsName, loaded]);

  if (isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-group py-6" role="status" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-1/2" />
        {/* The strip is NOT skeletoned as a strip: a row of slots drawn from partial data would
            claim a cycle length nothing has confirmed yet. One card-shaped block, its real height. */}
        <Skeleton className="h-[136px] w-full rounded-card" />
      </div>
    );
  }

  if (isError || !data?.plan) {
    // One message for "not yours", "archived" and "never existed" alike — including the member who
    // reached this URL. The server refuses either way, and telling them which it was tells them
    // whether the plan exists.
    return (
      <div className="col-mobile screen-x py-6">
        <EmptyState icon={Layers} title={t('plans.missingTitle')} heading="h1" body={t('plans.missingBody')} />
      </div>
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

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      {/* The commit lives in the header so it is reachable without scrolling to the end of a long
          plan — and it is disabled unless a plan-level field is actually pending, because every
          structural edit below (a day, a block, an exercise, a reorder) commits immediately and a
          pill implying otherwise would be a lie in every state but one. */}
      <div className="flex items-center justify-between gap-group">
        <Link
          to="/coach/plans"
          className="text-body-s inline-flex min-h-[var(--target-min)] items-center gap-tight text-text-2"
        >
          <ArrowLeft className="size-icon-s" aria-hidden />
          {t('plans.title')}
        </Link>
        <Pressable
          variant="primary"
          shape="chip"
          busy={updatePlan.isPending}
          disabled={!canSave}
          onClick={() => void save()}
        >
          {t('common.save')}
        </Pressable>
      </div>

      <header className="flex flex-col gap-tight">
        {/* The visible title IS the input — a plan is renamed by typing over it, not by opening a
            form. The heading is kept for document structure: an input contributes no text to a
            heading's accessible name, so an `h1` wrapping one is an `h1` a screen-reader user
            cannot navigate to. */}
        <h1 className="sr-only">{nameValue}</h1>
        <input
          ref={nameInput}
          value={nameValue}
          maxLength={120}
          aria-label={t('plans.newName')}
          onChange={(e) => setNameDraft(e.target.value)}
          className={cn(
            'text-title-1 w-full min-h-[var(--target-min)] rounded-field bg-transparent font-display text-text-1',
            'border-[length:var(--border-width)] border-transparent px-2 -mx-2',
            'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            'hover:border-[var(--field-border)] focus-visible:border-accent',
            'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          )}
        />

        {/* ONE metadata line, one grey, one size. The status is still a word rather than a button
            at rest — but the type and colour go on a CHILD span, never on the Pressable's own
            `className`: `cn` is `twMerge`, which files this project's custom font sizes and text
            colours in the same bucket, so a `text-*` from a call site silently eats the density's
            `text-body-s` and leaves the label at the inherited size. */}
        <div className="flex flex-wrap items-center gap-tight">
          <Pressable
            variant="ghost"
            density="compact"
            className="-ml-3"
            aria-haspopup="dialog"
            aria-expanded={statusOpen}
            onClick={() => setStatusOpen((v) => !v)}
          >
            <span className="text-caption text-text-3">{t(`plans.status.${statusValue}`)}</span>
          </Pressable>
          {/* Its own `aria-hidden` element rather than a character inside either half: it is not
              announced, and it stays out of the `tabular-nums` run. */}
          <span aria-hidden className="text-caption text-text-3">
            ·
          </span>
          <span className="text-caption tabular-nums text-text-3">
            {t('plans.revision', { n: plan.revision })}
          </span>
        </div>
      </header>

      {/* ── The anchor ────────────────────────────────────────────────────────────────────── */}
      <Surface as="section" aria-label={t('plans.cycle', { days: plan.cycle_days })} className="flex flex-col gap-tight">
        {/* Written inline rather than as a nested `<DayTile>` component: a component declared
            inside the render body gets a new identity every render, so React remounts the tiles
            on every state change and the keyboard focus you just put on one is thrown away. */}
        <ul className="flex gap-1 overflow-x-auto">
          {Array.from({ length: plan.cycle_days }, (_, i) => {
            const day = dayByIndex.get(i);
            const selected = day != null && openDay === day.id;
            const label = t('plans.dayIndex', { n: i + 1 });
            return (
              <li key={i} className="flex min-w-11 flex-1">
                <Pressable
                  variant="secondary"
                  aria-pressed={day ? selected : undefined}
                  aria-label={day ? `${day.name} · ${label}` : `${t('plans.addDay')} · ${label}`}
                  busy={!day && createDay.isPending}
                  disabled={!day && offline}
                  className={cn(
                    'h-20 w-full flex-col gap-1 rounded-field px-0',
                    selected
                      ? 'border-accent bg-accent-subtle text-accent'
                      : day
                        ? 'bg-surface-2 text-text-2'
                        : 'border-dashed bg-transparent text-text-3',
                  )}
                  onClick={() => {
                    if (day) {
                      setOpenDay(selected ? null : day.id);
                      return;
                    }
                    void createDay.mutateAsync({ planId, day_index: i, name: label });
                  }}
                >
                  {day ? (
                    day.is_rest ? (
                      <Moon className="size-icon-m" aria-hidden />
                    ) : (
                      <Dumbbell className="size-icon-m" aria-hidden />
                    )
                  ) : (
                    <Plus className="size-icon-m" aria-hidden />
                  )}
                  <span className="text-caption tabular-nums">{i + 1}</span>
                </Pressable>
              </li>
            );
          })}
        </ul>
        <p className="text-caption text-center tabular-nums text-text-3">
          {/* `trainingDayCount`, not the shared `dayCount`: the first half of this line already
              said how many days the cycle has, so a second "4 nap" beside it reads as a
              contradiction rather than as the number of days that actually carry work. */}
          {t('plans.cycle', { days: plan.cycle_days })} ·{' '}
          {t('plans.trainingDayCount', { count: trainingDays })}
        </p>
      </Surface>

      {/* The server refuses to activate a client plan with no start date — it would generate zero
          occurrences and the client would see an empty home screen forever. Saying so here means
          the coach reads a REASON in advance rather than a rejection afterwards. */}
      {plan.scope === 'client' && !plan.starts_on ? (
        <div role="alert" className="flex items-center gap-group">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-danger-subtle text-danger"
          >
            <AlertTriangle className="size-icon-m" strokeWidth={2} />
          </span>
          <p className="text-body-s min-w-0 flex-1 text-text-2">{t('plans.needsStart')}</p>
        </div>
      ) : null}

      <section className="flex flex-col gap-group">
        {days.length === 0 ? (
          <EmptyState icon={Layers} title={t('plans.noDaysTitle')} body={t('plans.noDaysBody')} />
        ) : null}

        {days.map((day) => {
          const dayBlocks = blocksOf(day.id);
          const open = openDay === day.id;
          return (
            <Surface key={day.id} pad="none">
              <div className="flex items-center gap-tight p-[var(--card-pad)]">
                <span
                  aria-hidden
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-accent-subtle text-accent"
                >
                  {day.is_rest ? <Moon className="size-icon-m" /> : <Dumbbell className="size-icon-m" />}
                </span>
                <Pressable
                  variant="ghost"
                  shape="field"
                  aria-expanded={open}
                  onClick={() => setOpenDay(open ? null : day.id)}
                  className="min-w-0 flex-1 gap-tight px-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-body-strong block truncate text-text-1">{day.name}</span>
                    <span className="text-caption block truncate tabular-nums text-text-3">
                      {/* Every day card carries the same two-part suffix, so the column of
                          captions keeps one shape. `||` rather than `??`: `start_time` is
                          `string | null`, but an empty string would pass `??` through and leave a
                          bare trailing separator. */}
                      {t('plans.dayIndex', { n: day.day_index + 1 })}
                      {` · ${day.start_time || t('plans.noTime')}`}
                    </span>
                  </span>
                  {open ? (
                    <ChevronUp className="size-icon-m shrink-0 text-text-3" aria-hidden />
                  ) : (
                    <ChevronDown className="size-icon-m shrink-0 text-text-3" aria-hidden />
                  )}
                </Pressable>
                <Pressable
                  shape="icon"
                  variant="ghost"
                  aria-label={t('plans.deleteDay')}
                  disabled={offline}
                  onClick={() => void deleteDay.mutateAsync({ planId, dayId: day.id })}
                >
                  <Trash2 className="size-icon-s text-danger" aria-hidden />
                </Pressable>
              </div>

              {open ? (
                // ── THE LADDER ONLY EVER RISES ──────────────────────────────────────────────
                // It used to invert: this panel filled to surface-2, the block card climbed to
                // surface-3, and then the exercise rows DROPPED to surface-1 — a level below both
                // of their parents and level with the collapsed card behind them, so the rows sank
                // into the block instead of sitting on it.
                // The open area is now the day card's own body, divided by the rule rather than by
                // a tone; the block is delimited by the app's one card separator, the hairline; and
                // the single content fill left is spent on the rows, which is the thing the mockup
                // draws as the brightest element on the screen. The ghost `+ Gyakorlat` under them
                // then sits a step below without any class of its own.
                <div className="flex flex-col gap-group border-t border-[var(--surface-border)] p-[var(--card-pad)]">
                  {dayBlocks.map((block, bi) => (
                    // `border-[length:var(--border-width)]` rather than Tailwind's `border`, so the
                    // Mono pack's 2px edge is honoured — the same form `surfaceRecipe` uses.
                    <div
                      key={block.id}
                      className="rounded-card border-[length:var(--border-width)] border-[var(--surface-border)] p-tight"
                    >
                      {/* Tonal squares rather than bare glyphs: on an unfilled block card a ghost
                          icon has no edge of its own, and these are the only controls a coach hits
                          while restructuring a day. The trash KEEPS its red glyph — only the
                          chrome becomes tonal; destructive stays destructive. */}
                      <div className="flex items-center gap-tight">
                        <span className="text-caption min-w-0 flex-1 truncate text-text-2">
                          {t(`plans.blockKind.${block.kind}`)}
                          {block.rounds ? ` · ${t('plans.rounds', { n: block.rounds })}` : ''}
                        </span>
                        {/* ChevronUp-when-open, matching the day header directly above it. The
                            mockup draws chevron-down on an expanded block, but one convention
                            across both disclosure levels beats agreeing with a static frame. */}
                        <Pressable
                          shape="icon"
                          variant="secondary"
                          aria-label={t('plans.collapseBlock')}
                          aria-expanded={!collapsedBlocks.has(block.id)}
                          aria-controls={`block-${block.id}`}
                          onClick={() =>
                            setCollapsedBlocks((prev) => {
                              const next = new Set(prev);
                              if (next.has(block.id)) {
                                next.delete(block.id);
                                return next;
                              }
                              next.add(block.id);
                              // Collapsing the block unmounts the picker, so its state must not
                              // stay pointing at a block nobody can see.
                              if (pickerBlock === block.id) {
                                setPickerBlock(null);
                                setSearch('');
                              }
                              return next;
                            })
                          }
                        >
                          {collapsedBlocks.has(block.id) ? (
                            <ChevronDown className="size-icon-s" aria-hidden />
                          ) : (
                            <ChevronUp className="size-icon-s" aria-hidden />
                          )}
                        </Pressable>
                        <Pressable shape="icon" variant="secondary" aria-label={t('plans.moveUp')} disabled={bi === 0 || offline} onClick={() => void move('blocks', dayBlocks, bi, -1)}>
                          <ChevronUp className="size-icon-s" aria-hidden />
                        </Pressable>
                        <Pressable shape="icon" variant="secondary" aria-label={t('plans.moveDown')} disabled={bi === dayBlocks.length - 1 || offline} onClick={() => void move('blocks', dayBlocks, bi, 1)}>
                          <ChevronDown className="size-icon-s" aria-hidden />
                        </Pressable>
                        <Pressable shape="icon" variant="secondary" aria-label={t('plans.deleteBlock')} disabled={offline} onClick={() => void deleteBlock.mutateAsync({ planId, blockId: block.id })}>
                          <Trash2 className="size-icon-s text-danger" aria-hidden />
                        </Pressable>
                      </div>

                      {/* The block body, behind its own disclosure. `aria-controls` resolves to
                          this wrapper, which is why it exists as an element rather than as a
                          fragment. */}
                      {collapsedBlocks.has(block.id) ? null : (
                        <div id={`block-${block.id}`}>
                        <ul className="mt-tight flex flex-col gap-tight">
                          {exercisesOf(block.id).map((ex, xi, arr) => {
                            const picked = activeExercise === ex.id;
                            return (
                              <li key={ex.id} className="flex items-center gap-tight rounded-field bg-surface-2 p-tight">
                                <Pressable
                                  variant="ghost"
                                  shape="field"
                                  className="min-w-0 flex-1 px-0"
                                  aria-expanded={picked}
                                  onFocus={() => setActiveExercise(ex.id)}
                                  onClick={() => setActiveExercise(picked ? null : ex.id)}
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="text-body-strong block truncate text-text-1">
                                      {ex.name ?? ex.exercise_name_snapshot}
                                    </span>
                                    <span className="text-caption block tabular-nums text-text-2">
                                      {ex.target_sets} × {ex.target_reps_min ?? '?'}
                                      {ex.target_reps_max && ex.target_reps_max !== ex.target_reps_min ? `–${ex.target_reps_max}` : ''}
                                      {ex.target_weight_entry_value != null
                                        ? ` · ${ex.target_weight_entry_value} ${ex.target_weight_entry_unit}`
                                        : ''}
                                    </span>
                                  </span>
                                </Pressable>
                                {picked ? (
                                  <>
                                    <Pressable shape="icon" variant="ghost" aria-label={t('plans.moveUp')} disabled={xi === 0 || offline} onClick={() => void move('exercises', arr, xi, -1)}>
                                      <ChevronUp className="size-icon-s" aria-hidden />
                                    </Pressable>
                                    <Pressable shape="icon" variant="ghost" aria-label={t('plans.moveDown')} disabled={xi === arr.length - 1 || offline} onClick={() => void move('exercises', arr, xi, 1)}>
                                      <ChevronDown className="size-icon-s" aria-hidden />
                                    </Pressable>
                                  </>
                                ) : null}
                                <Pressable shape="icon" variant="ghost" aria-label={t('plans.removeExercise')} disabled={offline} onClick={() => void deleteExercise.mutateAsync({ planId, rowId: ex.id })}>
                                  <Trash2 className="size-icon-s text-danger" aria-hidden />
                                </Pressable>
                              </li>
                            );
                          })}
                        </ul>

                        {pickerBlock === block.id ? (
                          // The picker REPLACES the add button in place rather than opening over it:
                          // the list it is adding to has to stay visible while you search it.
                          <div className="mt-tight flex flex-col gap-tight">
                            <Field
                              label={t('plans.findExercise')}
                              value={search}
                              autoFocus
                              onChange={(e) => setSearch(e.target.value)}
                            />
                            <ul className="max-h-56 overflow-y-auto">
                              {(results.data?.pages?.[0]?.exercises ?? []).slice(0, 12).map((r) => (
                                <li key={r.id}>
                                  <Pressable
                                    variant="ghost"
                                    shape="field"
                                    className="w-full"
                                    disabled={offline}
                                    onClick={async () => {
                                      await addExercise.mutateAsync({
                                        planId, block_id: block.id, exercise_id: r.id,
                                        target_sets: 3, target_reps_min: 8,
                                      });
                                      setPickerBlock(null);
                                      setSearch('');
                                    }}
                                  >
                                    <span className="truncate">{r.name}</span>
                                    {/* FLAGS, NOT A FILTER. The coach may know the client's knee is
                                        fine this week, or that the gym has kit the questionnaire
                                        predates. An option that vanishes teaches them nothing; one
                                        that carries a reason lets them decide. */}
                                    {r.conflicts?.length ? (
                                      <span
                                        className={cn(
                                          'text-caption ml-auto shrink-0 rounded-chip px-2 py-0.5',
                                          r.conflicts.some((c) => c.severity === 'avoid' && c.relation === 'loads')
                                            ? 'bg-danger-subtle text-danger'
                                            : 'bg-warning-subtle text-warning',
                                        )}
                                        title={r.conflicts
                                          .map((c) => t(`onboarding.area.${c.body_area}`))
                                          .join(', ')}
                                      >
                                        {t(`onboarding.area.${r.conflicts[0].body_area}`)}
                                      </span>
                                    ) : null}
                                    {r.missing_equipment?.length ? (
                                      <span className="text-caption shrink-0 rounded-chip bg-surface-1 px-2 py-0.5 text-text-3">
                                        {t('plans.missingKit', { count: r.missing_equipment.length })}
                                      </span>
                                    ) : null}
                                  </Pressable>
                                </li>
                              ))}
                            </ul>
                            <Pressable
                              variant="ghost"
                              density="compact"
                              className="w-full"
                              onClick={() => {
                                setPickerBlock(null);
                                setSearch('');
                              }}
                            >
                              {t('common.cancel')}
                            </Pressable>
                          </div>
                        ) : (
                          <Pressable
                            variant="ghost"
                            density="compact"
                            className="mt-tight w-full"
                            icon={<Plus className="size-icon-s" aria-hidden />}
                            disabled={offline}
                            onClick={() => setPickerBlock(block.id)}
                          >
                            {t('plans.addExercise')}
                          </Pressable>
                        )}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-tight">
                    {(['single', 'superset', 'circuit'] as const).map((kind) => (
                      <Pressable
                        key={kind}
                        shape="chip"
                        density="compact"
                        icon={<Plus className="size-icon-s" aria-hidden />}
                        busy={createBlock.isPending}
                        disabled={offline}
                        onClick={() =>
                          void createBlock.mutateAsync({
                            planId,
                            day_id: day.id,
                            kind,
                            position: dayBlocks.length,
                            // A circuit repeats the BLOCK, so the schema requires a round count.
                            // Defaulting it here means the coach is not shown a constraint error
                            // for a field the form never offered.
                            ...(kind === 'circuit' ? { rounds: 3 } : {}),
                          })
                        }
                      >
                        {t(`plans.blockKind.${kind}`)}
                      </Pressable>
                    ))}
                  </div>
                </div>
              ) : null}
            </Surface>
          );
        })}
      </section>

      {/* ── Below the fold: the things done once per plan, not once per edit ───────────────── */}
      <section className="flex flex-col gap-group">
        {nextFreeIndex !== undefined ? (
          <Pressable
            variant="secondary"
            className="w-full"
            icon={<Plus className="size-icon-s" aria-hidden />}
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
          </Pressable>
        ) : (
          // Every slot in the cycle is taken. Saying so beats a button that returns a constraint
          // error the coach has no way to interpret.
          <p className="text-caption text-text-3">{t('plans.cycleFull', { days: plan.cycle_days })}</p>
        )}

        {/* Handing a template to a client. The whole reason templates exist, and it is a DEEP COPY:
            the two plans are independent the moment it lands, so tailoring one client's rep range
            cannot touch anyone else's. */}
        <Pressable
          variant="secondary"
          className="w-full"
          icon={<Copy className="size-icon-s" aria-hidden />}
          disabled={offline}
          onClick={() => setCloning((v) => !v)}
          aria-expanded={cloning}
        >
          {t('plans.cloneOpen')}
        </Pressable>

        {cloning ? (
          <Surface className="flex flex-col gap-group">
            <p className="text-caption text-text-2">{t('plans.cloneHint')}</p>
            <ul className="flex flex-col gap-tight">
              {(clients.data?.clients ?? []).map((c) => (
                <li key={c.link_id}>
                  <Pressable
                    variant="ghost"
                    shape="field"
                    className="w-full"
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
                  >
                    <span className="truncate">{personLabel(c)}</span>
                  </Pressable>
                </li>
              ))}
            </ul>
            <Pressable
              variant="secondary"
              density="compact"
              busy={clone.isPending}
              disabled={offline}
              onClick={async () => {
                const created = await clone.mutateAsync({ id: planId, name: `${plan.name} (2)` });
                setCloning(false);
                void navigate(`/coach/plans/${created.id}`);
              }}
            >
              {t('plans.cloneAsTemplate')}
            </Pressable>
          </Surface>
        ) : null}

        {/* Copy the whole cycle forward. Framed as "duplicate this week" because that is what a
            coach is doing — and the consequence is stated on the button, not discovered after. */}
        {days.length > 0 ? (
          <Surface className="flex flex-col gap-tight">
            <Pressable
              variant="secondary"
              density="compact"
              icon={<Copy className="size-icon-s" aria-hidden />}
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
            >
              {t('plans.duplicateCycle', { days: plan.cycle_days })}
            </Pressable>
            {/* Growing the cycle re-dates every future occurrence, and the strip above re-renders at
                the new length — which is the honest way to show what just happened. The coach can
                still undo it by deleting the copied days. */}
            {copyNotice ? (
              <p role="status" className="text-body-s text-warning">
                {t('plans.cycleGrew', { days: copyNotice })}
              </p>
            ) : null}
          </Surface>
        ) : null}
      </section>

      {/* The status picker, out of the header and into the sheet the spec names for it. Inline, it
          pushed the cycle strip — the anchor — down the page every time it opened, and its selected
          chip was a second filled accent control beside the `Mentés` pill. Selected is the
          `accent-subtle` wash instead: `secondary` already inks it at `--text-1`, which is what
          `--on-accent-subtle` resolves to, so no `text-*` is passed (see the meta-line note). */}
      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title={t('plans.statusTitle')}>
        <div className="flex flex-wrap gap-tight">
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              shape="chip"
              density="compact"
              variant="secondary"
              className={statusValue === s ? 'border-accent bg-accent-subtle' : undefined}
              aria-pressed={statusValue === s}
              disabled={offline}
              onClick={() => {
                setStatusDraft(s);
                setStatusOpen(false);
              }}
            >
              {t(`plans.status.${s}`)}
            </Pressable>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

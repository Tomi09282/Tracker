import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2, Moon, Layers, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import {
  usePlan, useCreateDay, useDeleteDay, useCreateBlock, useDeleteBlock,
  useAddExercise, useDeleteExercise, useReorder, useUpdatePlan, useClonePlan, useCopyDays,
  type PlanBlock, type PlanExercise,
} from './usePlans';
import { useExercises } from '../library/useExercises';
import { useClients } from '../coaching/useCoaching';

/**
 * The plan editor.
 *
 * Reordering is UP/DOWN BUTTONS, not drag-and-drop, and that is a deliberate first cut rather than
 * an unfinished one. A drag needs a pointer, a keyboard path, a screen-reader path and a touch path
 * before it is usable by everyone; two buttons are all four at once, meet the 44 px floor, and send
 * exactly the same whole-list reorder the server expects. Drag can be added ON TOP later without
 * changing the API — the payload is already "here is the new order".
 */
export function PlanEditorPage() {
  const { t } = useTranslation();
  const params = useParams();
  const planId = Number.parseInt(params.id ?? '', 10);
  const { data, isPending, isError } = usePlan(Number.isFinite(planId) ? planId : null);

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
  const [pickerBlock, setPickerBlock] = useState<number | null>(null);
  const [cloning, setCloning] = useState(false);
  const [copyNotice, setCopyNotice] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  // A CLIENT plan knows whose it is, so the picker can be annotated against that client without
  // asking anyone. On a template there is no client and the flags simply do not appear — which is
  // correct: a template is written for nobody in particular.
  const forClient = data?.plan?.coach_client_id ?? undefined;
  const results = useExercises({ q: search || undefined, forClient }, 'hu');

  if (isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    );
  }

  if (isError || !data?.plan) {
    return (
      <div className="col-mobile screen-x py-6">
        <EmptyState icon={Layers} title={t('plans.missingTitle')} heading="h1" body={t('plans.missingBody')} />
      </div>
    );
  }

  const { plan, days, blocks, exercises } = data;
  const usedIndexes = new Set(days.map((d) => d.day_index));
  const nextFreeIndex = Array.from({ length: plan.cycle_days }, (_, i) => i).find((i) => !usedIndexes.has(i));

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

  return (
    <div className="col-mobile screen-x flex flex-col gap-8 py-6">
      <Link to="/coach/plans" className="inline-flex min-h-[var(--target-min)] items-center gap-2 text-body-s text-text-2">
        <ArrowLeft className="size-icon-s" aria-hidden />
        {t('plans.title')}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 font-display">{plan.name}</h1>
        <p className="text-caption text-text-2">
          {t(`plans.status.${plan.status}`)} · {t('plans.cycle', { days: plan.cycle_days })} ·{' '}
          {t('plans.revision', { n: plan.revision })}
        </p>
        <div className="flex flex-wrap gap-2">
          {(['draft', 'active', 'paused', 'ended'] as const).map((s) => (
            <Pressable
              key={s}
              shape="chip"
              density="compact"
              variant={plan.status === s ? 'primary' : 'secondary'}
              aria-pressed={plan.status === s}
              busy={updatePlan.isPending}
              onClick={() => void updatePlan.mutateAsync({ id: planId, status: s })}
            >
              {t(`plans.status.${s}`)}
            </Pressable>
          ))}
        </div>
        {/* The server refuses to activate a client plan with no start date — it would generate zero
            occurrences and the client would see an empty home screen forever. Saying so here means
            the coach reads a reason rather than a rejection. */}
        {plan.scope === 'client' && !plan.starts_on ? (
          <p role="alert" className="text-body-s text-warning">
            {t('plans.needsStart')}
          </p>
        ) : null}

        {/* Handing a template to a client. The whole reason templates exist, and it is a DEEP COPY:
            the two plans are independent the moment it lands, so tailoring one client's rep range
            cannot touch anyone else's. */}
        <Pressable
          variant="secondary"
          density="compact"
          icon={<Copy className="size-icon-s" aria-hidden />}
          onClick={() => setCloning((v) => !v)}
          aria-expanded={cloning}
        >
          {t('plans.cloneOpen')}
        </Pressable>

        {cloning ? (
          <div className="flex flex-col gap-4 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
            <p className="text-caption text-text-2">{t('plans.cloneHint')}</p>
            <ul className="flex flex-col gap-1">
              {(clients.data?.clients ?? []).map((c) => (
                <li key={c.link_id}>
                  <Pressable
                    variant="ghost"
                    shape="field"
                    className="w-full"
                    busy={clone.isPending}
                    onClick={async () => {
                      const created = await clone.mutateAsync({
                        id: planId,
                        coach_client_id: c.link_id,
                        name: `${plan.name} — ${c.email.split('@')[0]}`,
                      });
                      setCloning(false);
                      void navigate(`/coach/plans/${created.id}`);
                    }}
                  >
                    <span className="truncate">{c.email}</span>
                  </Pressable>
                </li>
              ))}
            </ul>
            <Pressable
              variant="secondary"
              density="compact"
              busy={clone.isPending}
              onClick={async () => {
                const created = await clone.mutateAsync({ id: planId, name: `${plan.name} (2)` });
                setCloning(false);
                void navigate(`/coach/plans/${created.id}`);
              }}
            >
              {t('plans.cloneAsTemplate')}
            </Pressable>
          </div>
        ) : null}
      </header>

      <section className="flex flex-col gap-4">
        {days.length === 0 ? (
          <EmptyState icon={Layers} title={t('plans.noDaysTitle')} body={t('plans.noDaysBody')} />
        ) : null}

        {days.map((day) => {
          const dayBlocks = blocksOf(day.id);
          const open = openDay === day.id;
          return (
            <div key={day.id} className="rounded-card border border-[var(--surface-border)] bg-surface-1">
              <div className="flex items-center gap-2 p-4">
                <Pressable
                  variant="ghost"
                  shape="field"
                  aria-expanded={open}
                  onClick={() => setOpenDay(open ? null : day.id)}
                  className="min-w-0 flex-1"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {day.is_rest ? <Moon className="size-icon-s shrink-0 text-text-3" aria-hidden /> : null}
                    <span className="truncate">{day.name}</span>
                    <span className="text-caption shrink-0 tabular-nums text-text-3">
                      {t('plans.dayIndex', { n: day.day_index + 1 })}
                      {day.start_time ? ` · ${day.start_time}` : ''}
                    </span>
                  </span>
                </Pressable>
                <Pressable
                  shape="icon"
                  variant="ghost"
                  aria-label={t('plans.deleteDay')}
                  onClick={() => void deleteDay.mutateAsync({ planId, dayId: day.id })}
                >
                  <Trash2 className="size-icon-s text-danger" aria-hidden />
                </Pressable>
              </div>

              {open ? (
                <div className="flex flex-col gap-4 border-t border-[var(--surface-border)] p-4">
                  {dayBlocks.map((block, bi) => (
                    <div key={block.id} className="rounded-card bg-surface-2 p-2">
                      <div className="flex items-center gap-2">
                        <span className="text-caption flex-1 truncate text-text-2">
                          {t(`plans.blockKind.${block.kind}`)}
                          {block.rounds ? ` · ${t('plans.rounds', { n: block.rounds })}` : ''}
                        </span>
                        <Pressable shape="icon" variant="ghost" aria-label={t('plans.moveUp')} disabled={bi === 0} onClick={() => void move('blocks', dayBlocks, bi, -1)}>
                          <ChevronUp className="size-icon-s" aria-hidden />
                        </Pressable>
                        <Pressable shape="icon" variant="ghost" aria-label={t('plans.moveDown')} disabled={bi === dayBlocks.length - 1} onClick={() => void move('blocks', dayBlocks, bi, 1)}>
                          <ChevronDown className="size-icon-s" aria-hidden />
                        </Pressable>
                        <Pressable shape="icon" variant="ghost" aria-label={t('plans.deleteBlock')} onClick={() => void deleteBlock.mutateAsync({ planId, blockId: block.id })}>
                          <Trash2 className="size-icon-s text-danger" aria-hidden />
                        </Pressable>
                      </div>

                      <ul className="mt-2 flex flex-col gap-1">
                        {exercisesOf(block.id).map((ex, xi, arr) => (
                          <li key={ex.id} className="flex items-center gap-2 rounded-field bg-surface-1 p-2">
                            <span className="min-w-0 flex-1">
                              <span className="text-body-s block truncate">{ex.name ?? ex.exercise_name_snapshot}</span>
                              <span className="text-caption tabular-nums text-text-2">
                                {ex.target_sets} × {ex.target_reps_min ?? '?'}
                                {ex.target_reps_max && ex.target_reps_max !== ex.target_reps_min ? `–${ex.target_reps_max}` : ''}
                                {ex.target_weight_entry_value != null
                                  ? ` · ${ex.target_weight_entry_value} ${ex.target_weight_entry_unit}`
                                  : ''}
                              </span>
                            </span>
                            <Pressable shape="icon" variant="ghost" aria-label={t('plans.moveUp')} disabled={xi === 0} onClick={() => void move('exercises', arr, xi, -1)}>
                              <ChevronUp className="size-icon-s" aria-hidden />
                            </Pressable>
                            <Pressable shape="icon" variant="ghost" aria-label={t('plans.moveDown')} disabled={xi === arr.length - 1} onClick={() => void move('exercises', arr, xi, 1)}>
                              <ChevronDown className="size-icon-s" aria-hidden />
                            </Pressable>
                            <Pressable shape="icon" variant="ghost" aria-label={t('plans.removeExercise')} onClick={() => void deleteExercise.mutateAsync({ planId, rowId: ex.id })}>
                              <Trash2 className="size-icon-s text-danger" aria-hidden />
                            </Pressable>
                          </li>
                        ))}
                      </ul>

                      {pickerBlock === block.id ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <Field
                            label={t('plans.findExercise')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                          <ul className="max-h-56 overflow-y-auto">
                            {(results.data?.pages?.[0]?.exercises ?? []).slice(0, 12).map((r) => (
                              <li key={r.id}>
                                <Pressable
                                  variant="ghost"
                                  shape="field"
                                  className="w-full"
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
                                    <span className="text-caption shrink-0 rounded-chip bg-surface-3 px-2 py-0.5 text-text-3">
                                      {t('plans.missingKit', { count: r.missing_equipment.length })}
                                    </span>
                                  ) : null}
                                </Pressable>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <Pressable
                          variant="ghost"
                          density="compact"
                          icon={<Plus className="size-icon-s" aria-hidden />}
                          onClick={() => setPickerBlock(block.id)}
                          className="mt-2"
                        >
                          {t('plans.addExercise')}
                        </Pressable>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    {(['single', 'superset', 'circuit'] as const).map((kind) => (
                      <Pressable
                        key={kind}
                        shape="chip"
                        density="compact"
                        icon={<Plus className="size-icon-s" aria-hidden />}
                        busy={createBlock.isPending}
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
            </div>
          );
        })}

        {/* Copy the whole cycle forward. Framed as "duplicate this week" because that is what a
            coach is doing — and the consequence is stated on the button, not discovered after. */}
        {days.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
            <Pressable
              variant="secondary"
              density="compact"
              icon={<Copy className="size-icon-s" aria-hidden />}
              busy={copyDays.isPending}
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
            {/* Growing the cycle re-dates every future occurrence. Saying so AFTER the fact is the
                honest minimum; the coach can still undo by deleting the copied days. */}
            {copyNotice ? (
              <p role="status" className="text-body-s text-warning">
                {t('plans.cycleGrew', { days: copyNotice })}
              </p>
            ) : null}
          </div>
        ) : null}

        {nextFreeIndex !== undefined ? (
          <Pressable
            variant="secondary"
            icon={<Plus className="size-icon-s" aria-hidden />}
            busy={createDay.isPending}
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
      </section>
    </div>
  );
}

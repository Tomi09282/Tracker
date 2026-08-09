import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Apple, Plus, Trash2 } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { apiWithRefresh } from '../../lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import {
  useNutritionPlans,
  useNutritionPlan,
  useCreateNutritionPlan,
  useFoodSearch,
} from '../nutrition/useNutrition';

/**
 * The coach's nutrition tab (T4.1.8).
 *
 * ═══ WHAT THIS SHOWS IS WHAT THE COACH PRESCRIBED, NOT WHAT THE CLIENT ATE ═════════════════════
 *
 * And that is a boundary rather than an omission. A client's food log is single-table on their own
 * user id, with no coach arm at all — the same shape their measurements had before a consent flag
 * existed. Adding a coach read would need the same decision `progress_shares` made: an explicit,
 * revocable, per-link grant, defaulting to nobody. A food diary is close enough to health data
 * that quietly wiring a coach into it because coaching seems to imply it is exactly the move this
 * product does not make.
 *
 * So the tab is the PRESCRIPTION. The adherence half lives on the client's own screen, where they
 * can see it without anybody having decided on their behalf, and the coach's read is recorded as a
 * follow-up needing a consent design rather than shipped by default.
 *
 * ═══ AND THE MACROS ARE NEVER TYPED ════════════════════════════════════════════════════════════
 *
 * A portion is a food and a number of grams. The kcal shown beside the input is computed here from
 * the food's own per-100 g figures purely so the number is not a surprise after saving — it is
 * never sent, and sending one is a 400.
 */
export function NutritionTab({ linkId }: { linkId: number }) {
  const { t, i18n } = useTranslation();
  const plans = useNutritionPlans();
  const create = useCreateNutritionPlan();
  const [openId, setOpenId] = useState<number | null>(null);

  const mine = (plans.data?.plans ?? []).filter((p) => p.coach_client_id === linkId);

  if (plans.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 rounded-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {mine.length === 0 ? (
        <EmptyState
          icon={Apple}
          title={t('coaching.nutrition.emptyTitle')}
          body={t('coaching.nutrition.emptyBody')}
          action={
            <Pressable
              variant="primary"
              busy={create.isPending}
              onClick={() =>
                create.mutate({
                  name: t('coaching.nutrition.defaultName'),
                  coach_client_id: linkId,
                  starts_on: todayLocal(),
                })
              }
            >
              {t('coaching.nutrition.create')}
            </Pressable>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {mine.map((p) => (
              <li key={p.id}>
                <Pressable
                  variant={openId === p.id ? 'secondary' : 'ghost'}
                  className="w-full justify-between text-left"
                  onClick={() => setOpenId(openId === p.id ? null : p.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-body block truncate text-text-1">{p.name}</span>
                    <span className="text-caption text-text-3">
                      {t(`plans.status.${p.status}`, { defaultValue: p.status })} ·{' '}
                      {t('coaching.nutrition.cycle', { count: p.cycle_days })}
                    </span>
                  </span>
                </Pressable>
                {openId === p.id ? <PlanEditor planId={p.id} lang={i18n.language} /> : null}
              </li>
            ))}
          </ul>
          <Pressable
            variant="ghost"
            busy={create.isPending}
            onClick={() =>
              create.mutate({
                name: t('coaching.nutrition.defaultName'),
                coach_client_id: linkId,
                starts_on: todayLocal(),
              })
            }
          >
            <Plus className="size-4" aria-hidden />
            {t('coaching.nutrition.create')}
          </Pressable>
        </>
      )}
    </div>
  );
}

/* ── the editor ─────────────────────────────────────────────────────────────────────────────── */

function PlanEditor({ planId, lang }: { planId: number; lang: string }) {
  const { t } = useTranslation();
  const tree = useNutritionPlan(planId);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['nutrition-plan', planId] });

  const [dayIndex, setDayIndex] = useState(0);

  const addDay = useMutation({
    mutationFn: (body: { day_index: number; kcal_target?: number }) =>
      apiWithRefresh(`/nutrition-plans/${planId}/days`, { method: 'POST', body }),
    onSuccess: refresh,
  });
  const addMeal = useMutation({
    mutationFn: (body: { day_id: number; name: string }) =>
      apiWithRefresh(`/nutrition-plans/${planId}/meals`, { method: 'POST', body }),
    onSuccess: refresh,
  });
  const addItem = useMutation({
    mutationFn: (body: { meal_id: number; food_id: number; grams: number }) =>
      apiWithRefresh(`/nutrition-plans/${planId}/items?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        body,
      }),
    onSuccess: refresh,
  });
  const delItem = useMutation({
    mutationFn: (id: number) =>
      apiWithRefresh(`/nutrition-plans/${planId}/items/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const activate = useMutation({
    mutationFn: () =>
      apiWithRefresh(`/nutrition-plans/${planId}`, { method: 'PATCH', body: { status: 'active' } }),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ['nutrition-plans'] });
    },
  });

  if (tree.isLoading || !tree.data) {
    return <Skeleton className="mt-2 h-24 rounded-card" />;
  }

  const { plan, days, meals, items } = tree.data;
  const day = days.find((d) => d.day_index === dayIndex);
  const dayMeals = day ? meals.filter((m) => m.day_id === day.id) : [];

  return (
    <div className="mt-2 rounded-card border border-line bg-surface-2 p-3">
      {/* THE CYCLE IS THE SCHEDULE RULE'S INPUT, so the day picker is exactly cycle_days wide. A
          day outside it is refused by a trigger, and a picker that could produce one would be
          offering a control that cannot succeed. */}
      <div className="mb-3 flex flex-wrap gap-1">
        {Array.from({ length: plan.cycle_days }, (_, i) => {
          const exists = days.some((d) => d.day_index === i);
          return (
            <Pressable
              key={i}
              density="compact"
              variant={i === dayIndex ? 'primary' : exists ? 'secondary' : 'ghost'}
              onClick={() => setDayIndex(i)}
            >
              {i + 1}
            </Pressable>
          );
        })}
      </div>

      {!day ? (
        <Pressable
          variant="secondary"
          busy={addDay.isPending}
          onClick={() => addDay.mutate({ day_index: dayIndex })}
        >
          <Plus className="size-4" aria-hidden />
          {t('coaching.nutrition.addDay')}
        </Pressable>
      ) : (
        <>
          {dayMeals.map((m) => {
            const mine = items.filter((i) => i.meal_id === m.id);
            // Totals are SUM over the rows the server already computed. The card does not do its
            // own macro arithmetic, because a second sum is a second answer.
            const kcal = mine.reduce((a, b) => a + b.kcal, 0);
            return (
              <section key={m.id} className="mb-3">
                <h4 className="text-caption mb-1 flex justify-between uppercase text-text-3">
                  <span>{m.name}</span>
                  <span className="tabular-nums">{Math.round(kcal)} kcal</span>
                </h4>
                <ul className="flex flex-col gap-1">
                  {mine.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 rounded-card bg-surface-3 px-3">
                      <span className="min-w-0 flex-1 py-2">
                        <span className="text-body-s block truncate text-text-1">{i.name}</span>
                        <span className="text-caption tabular-nums text-text-3">
                          {round(i.grams)}g · {round(i.kcal)} kcal · {round(i.protein_g)}g P
                        </span>
                      </span>
                      <Pressable
                        variant="ghost"
                        shape="icon"
                        onClick={() => delItem.mutate(i.id)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Pressable>
                    </li>
                  ))}
                </ul>
                <FoodPicker
                  lang={lang}
                  busy={addItem.isPending}
                  onPick={(foodId, grams) => addItem.mutate({ meal_id: m.id, food_id: foodId, grams })}
                />
              </section>
            );
          })}

          <Pressable
            variant="ghost"
            density="compact"
            busy={addMeal.isPending}
            onClick={() =>
              addMeal.mutate({ day_id: day.id, name: t('coaching.nutrition.mealDefault') })
            }
          >
            <Plus className="size-4" aria-hidden />
            {t('coaching.nutrition.addMeal')}
          </Pressable>
        </>
      )}

      {plan.status === 'draft' ? (
        <div className="mt-3 border-t border-line pt-3">
          {/* A DRAFT IS INVISIBLE TO THE CLIENT, and the coach is told so rather than left to
              wonder why nothing appeared on the client's phone. */}
          <p className="text-caption mb-2 text-text-3">{t('coaching.nutrition.draftNote')}</p>
          <Pressable variant="primary" busy={activate.isPending} onClick={() => activate.mutate()}>
            {t('coaching.nutrition.activate')}
          </Pressable>
        </div>
      ) : null}
    </div>
  );
}

function FoodPicker({
  lang,
  busy,
  onPick,
}: {
  lang: string;
  busy: boolean;
  onPick: (foodId: number, grams: number) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [grams, setGrams] = useState('100');
  const [picked, setPicked] = useState<{ id: number; name: string; kcal_per_100g: number } | null>(null);
  const search = useFoodSearch(q, lang);

  return (
    <div className="mt-1">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPicked(null);
        }}
        placeholder={t('nutrition.searchPlaceholder')}
        aria-label={t('nutrition.searchPlaceholder')}
        className="text-body-s min-h-[var(--target-min)] w-full rounded-card border border-line bg-surface-3 px-3 text-text-1"
      />
      {q && !picked ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {(search.data?.foods ?? []).slice(0, 5).map((f) => (
            <li key={f.id}>
              <Pressable
                variant="ghost"
                density="compact"
                className="w-full justify-start text-left"
                onClick={() => setPicked(f)}
              >
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-caption shrink-0 tabular-nums text-text-3">
                  {round(f.kcal_per_100g)}
                </span>
              </Pressable>
            </li>
          ))}
        </ul>
      ) : null}
      {picked ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-body-s min-w-0 flex-1 truncate text-text-1">{picked.name}</span>
          <input
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            aria-label={t('nutrition.grams')}
            className="text-body-s min-h-[var(--target-min)] w-16 rounded-card border border-line bg-surface-3 px-2 text-right tabular-nums text-text-1"
          />
          <Pressable
            variant="primary"
            density="compact"
            busy={busy}
            onClick={() => {
              const g = Number(grams.replace(',', '.'));
              if (!Number.isFinite(g) || g <= 0) return;
              onPick(picked.id, g);
              setPicked(null);
              setQ('');
            }}
          >
            {t('common.add')}
          </Pressable>
        </div>
      ) : null}
    </div>
  );
}

/** Local calendar day. `toISOString()` is UTC and would be yesterday at 01:00 in Budapest. */
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { SearchField } from '../../ui/primitives/SearchField';
import { Field } from '../../ui/primitives/Field';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { LedgerRow } from '../../ui/data/LedgerRow';
import { StatusLine } from '../../ui/data/StatusLine';
import { Rule } from '../../ui/data/Rule';
import { apiWithRefresh } from '../../lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
 *
 * ═══ THE LOOK (client-detail-2) ════════════════════════════════════════════════════════════════
 *
 * Nothing is enclosed. A diet is a row (name; the status line with the lime dot only for an active
 * diet); the open one is followed by its editor: the day picker as seven equal cells on a hairline
 * with the ink mark of the chosen day, then each meal as an open ledger — the eyebrow name and the
 * 48 pt kcal numeral on one baseline, the items as rows with the delete cross, the food search line
 * closing the meal. The two create controls are quiet text links on two levels: a meal hangs on the
 * day, a new diet opens its own block under a section rule.
 */
export function NutritionTab({ linkId }: { linkId: number }) {
  const { t, i18n } = useTranslation();
  const plans = useNutritionPlans();
  const create = useCreateNutritionPlan();
  const [openId, setOpenId] = useState<number | null>(null);

  const mine = (plans.data?.plans ?? []).filter((p) => p.coach_client_id === linkId);

  if (plans.isLoading) {
    return (
      <div role="status" aria-label={t('common.loading')}>
        <RowStack as="div">
          <ListRowSkeleton sub index={0} />
          <ListRowSkeleton sub index={1} />
        </RowStack>
      </div>
    );
  }

  const createDiet = () =>
    create.mutate({
      name: t('coaching.nutrition.defaultName'),
      coach_client_id: linkId,
      starts_on: todayLocal(),
    });

  if (mine.length === 0) {
    // The empty state carries the screen's one pill: creating the first diet IS the action here.
    return (
      <EmptyState
        className="mt-2"
        title={t('coaching.nutrition.emptyTitle')}
        body={t('coaching.nutrition.emptyBody')}
        action={
          <Pressable variant="primary" size="lg" busy={create.isPending} onClick={createDiet}>
            {t('coaching.nutrition.create')}
          </Pressable>
        }
      />
    );
  }

  // The open editor follows ITS row: the rows up to the open one, the editor, then the rest — so an
  // editor never sits inside a row and a closed diet below it keeps its own hairline.
  const openAt = mine.findIndex((p) => p.id === openId);
  const groups = openAt < 0 ? [mine] : [mine.slice(0, openAt + 1), mine.slice(openAt + 1)];

  const row = (p: (typeof mine)[number]) => {
    const open = openId === p.id;
    const Caret = open ? ChevronUp : ChevronDown;
    return (
      <ListRow
        key={p.id}
        title={p.name}
        sub={
          <StatusLine
            tone={p.status === 'active' ? 'live' : undefined}
            word={t(`plans.status.${p.status}`, { defaultValue: p.status })}
            meta={t('coaching.nutrition.cycle', { count: p.cycle_days })}
          />
        }
        // the 16 pt caret's ink (8 wide, 4 inside its box) ends on the content edge, as drawn
        trailing={<Caret className="-mr-1 size-4 text-text-3" strokeWidth={1.75} aria-hidden />}
        aria-expanded={open}
        onClick={() => setOpenId(open ? null : p.id)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-section">
      <div className="flex flex-col gap-2">
        {groups.map((g, i) =>
          g.length ? (
            <Fragment key={g[0].id}>
              <RowStack>{g.map(row)}</RowStack>
              {i === 0 && openAt >= 0 ? <PlanEditor planId={mine[openAt].id} lang={i18n.language} /> : null}
            </Fragment>
          ) : null,
        )}
      </div>
      {/* A new diet belongs under the diet LIST, not under the open day: its own block. */}
      <div className="flex flex-col gap-4">
        <Rule strong />
        <TextLink text="body" className="self-start" lead={<Plus />} busy={create.isPending} onClick={createDiet}>
          {t('coaching.nutrition.create')}
        </TextLink>
      </div>
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
    return (
      <div role="status" aria-label={t('common.loading')}>
        <RowStack as="div">
          {[0, 1, 2].map((i) => (
            <ListRowSkeleton key={i} sub index={i} />
          ))}
        </RowStack>
      </div>
    );
  }

  const { plan, days, meals, items } = tree.data;
  const day = days.find((d) => d.day_index === dayIndex);
  const dayMeals = day ? meals.filter((m) => m.day_id === day.id) : [];

  return (
    <div className="flex flex-col gap-4">
      {/* THE CYCLE IS THE SCHEDULE RULE'S INPUT, so the day picker is exactly cycle_days wide. A
          day outside it is refused by a trigger, and a picker that could produce one would be
          offering a control that cannot succeed. Choosing a day is local state: nothing is
          written until "Nap hozzáadása" is pressed, so the arrows may select as they move. */}
      <Segmented
        layout="cells"
        label={t('coaching.nutrition.cycle', { count: plan.cycle_days })}
        options={Array.from({ length: plan.cycle_days }, (_, i) => ({ value: String(i), label: String(i + 1) }))}
        value={String(dayIndex)}
        onChange={(v) => setDayIndex(Number(v))}
      />

      {!day ? (
        <TextLink
          text="body"
          className="self-start"
          lead={<Plus />}
          busy={addDay.isPending}
          onClick={() => addDay.mutate({ day_index: dayIndex })}
        >
          {t('coaching.nutrition.addDay')}
        </TextLink>
      ) : (
        <>
          {dayMeals.length ? (
            <div className="flex flex-col gap-section">
              {dayMeals.map((m) => {
                const mine = items.filter((i) => i.meal_id === m.id);
                // Totals are SUM over the rows the server already computed. The card does not do its
                // own macro arithmetic, because a second sum is a second answer.
                const kcal = mine.reduce((a, b) => a + b.kcal, 0);
                return (
                  <section key={m.id} aria-label={m.name}>
                    <RowStack as="div">
                      <LedgerRow label={m.name} value={Math.round(kcal)} unit={t('nutrition.unitKcal')} />
                      {mine.map((i) => (
                        <ListRow
                          key={i.id}
                          title={i.name}
                          sub={t('coaching.nutrition.itemLine', {
                            grams: round(i.grams),
                            kcal: round(i.kcal),
                            protein: round(i.protein_g),
                          })}
                          control={
                            <Pressable
                              variant="link"
                              shape="icon"
                              glyph="field"
                              onClick={() => delItem.mutate(i.id)}
                              aria-label={t('common.delete')}
                            >
                              <X />
                            </Pressable>
                          }
                        />
                      ))}
                      <FoodPicker
                        lang={lang}
                        busy={addItem.isPending}
                        onPick={(foodId, grams) => addItem.mutate({ meal_id: m.id, food_id: foodId, grams })}
                      />
                    </RowStack>
                  </section>
                );
              })}
            </div>
          ) : null}

          <TextLink
            text="body"
            className="self-start"
            lead={<Plus />}
            busy={addMeal.isPending}
            onClick={() => addMeal.mutate({ day_id: day.id, name: t('coaching.nutrition.mealDefault') })}
          >
            {t('coaching.nutrition.addMeal')}
          </TextLink>
        </>
      )}

      {plan.status === 'draft' ? (
        <div className="flex flex-col gap-4 pt-4">
          {/* A DRAFT IS INVISIBLE TO THE CLIENT, and the coach is told so rather than left to
              wonder why nothing appeared on the client's phone. Activating is the one action of a
              draft diet, so it is the screen's one pill. */}
          <NoticeLine tone="info">{t('coaching.nutrition.draftNote')}</NoticeLine>
          <Pressable variant="primary" size="lg" className="w-full" busy={activate.isPending} onClick={() => activate.mutate()}>
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

  const add = (food: { id: number }) => {
    const g = Number(grams.replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0) return;
    onPick(food.id, g);
    setPicked(null);
    setQ('');
  };

  return (
    <div>
      <SearchField
        label={t('nutrition.searchPlaceholder')}
        placeholder={t('nutrition.searchPlaceholder')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPicked(null);
        }}
        onClear={() => setPicked(null)}
      />
      {q && !picked ? (
        <RowStack>
          {(search.data?.foods ?? []).slice(0, 5).map((f) => (
            <ListRow key={f.id} title={f.name} value={String(round(f.kcal_per_100g))} onClick={() => setPicked(f)} />
          ))}
        </RowStack>
      ) : null}
      {picked ? (
        <ListRow
          title={picked.name}
          control={
            <span className="flex items-center gap-4">
              <Field
                label={t('nutrition.grams')}
                labelHidden
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                className="w-16"
              />
              <TextLink text="body" busy={busy} onClick={() => add(picked)}>
                {t('common.add')}
              </TextLink>
            </span>
          }
        />
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

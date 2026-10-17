import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { MacroColumns } from '../../ui/data/MacroColumns';
import { Numeral } from '../../ui/data/Numeral';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { RowStack } from '../../ui/data/RowStack';
import { Rule } from '../../ui/data/Rule';
import { Section } from '../../ui/data/SectionHeader';
import { StatBlock } from '../../ui/data/StatBlock';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pic } from '../../ui/media/Pic';
import { DateTrigger } from '../../ui/primitives/DateTrigger';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { SearchField } from '../../ui/primitives/SearchField';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { useFoodSearch, useNutritionDay, useLogFood, useDeleteLogItem } from './useNutrition';
import type { FoodRow, LogItem } from './useNutrition';

/**
 * The client's food day — frames `nutrition-1` (the day) and `nutrition-2` (a food picked).
 *
 * ═══ THE COMPOSITION OF THE FRAMES (`figma-build/app/nutrition-*.body.js`) ═════════════════════
 *
 *   Screen top="root"        header at y 72, blocks 32 apart
 *   ScreenHeader root        "TÁPLÁLKOZÁS", the day under it as a control ("Péntek, október 9. ⌄",
 *                            the inline DateTrigger over the platform's picker)
 *   hero stage               "KALÓRIA" + the giant calorie figure, the bowl glowing beside it and cut
 *                            by the right screen edge, then the lime meter with the plan day on the
 *                            left and "/ 2600 kcal" on the right, one baseline
 *   macros                   strong rule, the trio at the `num` step: name, figure + g, ink bar, "cél"
 *   Section "Hozzáadás"      the search line; the results (undrawn) or the picked food: its name, the
 *                            gram field with the live kcal on its baseline, the screen's ONE lime pill
 *   Section "Naplózva"       meal groups in the order first logged: a mono label, then rows of
 *                            name + grams, kcal on the right edge and the one-tap delete cross
 *
 * ═══ RULES CARRIED OVER ════════════════════════════════════════════════════════════════════════
 *
 * - The fill CLAMPS, the figure never does (3200 against 2400: a full bar and "3200").
 * - Over target is WARNING, never danger — on the calorie figure and bar and on each macro.
 * - The date is the client's local calendar day (`todayLocal`), never the server's.
 * - No "remaining calories", no streak, no undo toast on delete: the feedback of a delete is the
 *   figure rolling down. Delete is one tap and final, as it always was.
 *
 * ═══ WHAT THE FRAMES DO NOT DRAW, BUILT IN THE SAME LANGUAGE (owner answer Q4) ═════════════════
 *
 * Loading (blocks where the figures and rows will be), a day with nothing logged (the empty state),
 * no target for the date (the unit joins the figure, no bar, the no-target sentence), the search
 * results and "Nincs találat", an invalid gram amount (0 kcal, no tick, the pill disabled). A failed
 * day read keeps today's behaviour: the zero day, no retry.
 */
export function NutritionPage() {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState(todayLocal);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<FoodRow | null>(null);
  const [grams, setGrams] = useState('100');

  const day = useNutritionDay(date);
  const search = useFoodSearch(q, i18n.language);
  const log = useLogFood(date);
  const remove = useDeleteLogItem(date);

  // Grouped by the label the user typed, in first-seen order — not alphabetically, because the
  // order they ate in is the order they remember.
  const groups = useMemo(() => {
    const out = new Map<string, LogItem[]>();
    for (const item of day.data?.items ?? []) {
      const key = item.meal_label ?? t('nutrition.unlabelled');
      const bucket = out.get(key) ?? [];
      bucket.push(item);
      out.set(key, bucket);
    }
    return [...out.entries()];
  }, [day.data, t]);

  const totals = day.data?.totals ?? EMPTY;
  const targets = day.data?.targets ?? null;

  const kcalTarget = targets?.kcal_target ?? null;
  const kcalOver = kcalTarget != null && totals.kcal > kcalTarget;
  // Clamped by the bar itself; the figure above it is the unclamped truth.
  const kcalFill = kcalTarget != null && kcalTarget > 0 ? totals.kcal / kcalTarget : 0;
  // A missing target is a fact about the PLAN's schedule, not a zero. Said out loud under the meter.
  const noTarget = !day.isLoading && day.data != null && targets == null;

  const macros = [
    { key: 'protein', value: totals.protein_g, target: targets?.protein_g_target ?? null },
    { key: 'carb', value: totals.carb_g, target: targets?.carb_g_target ?? null },
    { key: 'fat', value: totals.fat_g, target: targets?.fat_g_target ?? null },
  ];

  const gramsNumber = Number(grams.replace(',', '.'));
  const gramsValid = Number.isFinite(gramsNumber) && gramsNumber > 0;

  const submit = async () => {
    if (!picked || !gramsValid) return;
    // food_id and grams. NO macros — the server reads those from its own row, and sending one is
    // a 400 rather than an ignore.
    await log.mutateAsync({ food_id: picked.id, grams: gramsNumber });
    setPicked(null);
    setQ('');
    setGrams('100');
  };

  const unitG = t('nutrition.unitG');
  const unitKcal = t('nutrition.unitKcal');
  const foods = (search.data?.foods ?? []).slice(0, 8);

  return (
    <Screen top="root">
      <ScreenHeader kind="root" title={t('nutrition.title')}>
        {/* The frame lays the 44 pt control over the title bar's lower edge (its words 3 under the
            title, y 116-134) and ends the header 13 above the control's own end (y 134): the row
            keeps that 10 pt and the control hangs from it. */}
        <div className="relative h-2.5">
          <DateTrigger
            variant="inline"
            label={t('nutrition.date')}
            value={date}
            onChange={setDate}
            className="absolute -top-[21px] left-0"
          />
        </div>
      </ScreenHeader>

      {/* ── THE HERO: the day's calories ─────────────────────────────────────────────────────── */}
      <div className="relative flex flex-col gap-5">
        {/* The bowl glows out of the black beside the figure, cut by the right screen edge
            (frame box 231,51 267 x 272, the stage starts at 24,166). */}
        <Pic slot="hero-bowl" width={267} priority bleed className="pointer-events-none absolute left-[207px] -top-[115px]" />

        <StatBlock label={t('nutrition.macro.kcal')} className="relative">
          {day.isLoading ? (
            // A numeral is one block at its cap height (the four-digit ink box of the frame).
            <Skeleton className="h-[102px] w-[210px]" />
          ) : (
            <Numeral
              size="giant"
              value={Math.round(totals.kcal)}
              mode="roll"
              from={0}
              tone={kcalOver ? 'warn' : 'ink'}
              // With no denominator to draw, the unit joins the figure instead.
              unit={kcalTarget == null ? unitKcal : undefined}
            />
          )}
        </StatBlock>

        <div className="relative flex flex-col gap-2">
          {kcalTarget != null || day.isLoading ? (
            <ProgressBar
              tone="accent"
              value={day.isLoading ? 0 : kcalFill}
              label={t('nutrition.macro.kcal')}
              valueText={
                kcalTarget != null
                  ? `${Math.round(totals.kcal)} ${t('nutrition.slash')} ${round(kcalTarget)} ${unitKcal}`
                  : undefined
              }
            />
          ) : null}
          <div className="flex items-baseline gap-1">
            {day.isLoading ? (
              <Skeleton className="h-3 w-28" />
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-cap text-text-2">
                  {targets?.day_name ?? t('nutrition.totals')}
                </span>
                {kcalTarget != null ? (
                  <>
                    <span className="text-data-l text-text-1">
                      <span className="text-text-3">{t('nutrition.slash')}</span> {round(kcalTarget)}
                    </span>
                    <span className="text-cap text-text-2">{unitKcal}</span>
                  </>
                ) : null}
              </>
            )}
          </div>
          {noTarget ? <NoticeLine tone="info">{t('nutrition.noTargetToday')}</NoticeLine> : null}
        </div>
      </div>

      {/* ── THE MACROS: the same instrument one size down ────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Rule strong />
        {day.isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {macros.map((m) => (
              <StatBlock key={m.key} label={t(`nutrition.macro.${m.key}`)}>
                <Skeleton className="h-[39px] w-14" />
              </StatBlock>
            ))}
          </div>
        ) : (
          <MacroColumns
            size="num"
            columns={macros.map((m) => ({
              name: t(`nutrition.macro.${m.key}`),
              value: round(m.value),
              unit: unitG,
              ratio: m.target != null && m.target > 0 ? m.value / m.target : undefined,
              caption: m.target != null ? `${t('nutrition.macroTargetShort')} ${round(m.target)} ${unitG}` : undefined,
            }))}
          />
        )}
      </div>

      {/* ── ADD: the standing way in is the search line ──────────────────────────────────────── */}
      <Section title={t('nutrition.add')}>
        <SearchField
          label={t('nutrition.searchPlaceholder')}
          placeholder={t('nutrition.searchPlaceholder')}
          clearLabel={t('common.close')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPicked(null);
          }}
        />

        {q && !picked ? (
          foods.length > 0 ? (
            <RowStack>
              {foods.map((f) => (
                <ListRow
                  key={f.id}
                  title={f.name}
                  sub={
                    t('nutrition.resultMeta', { kcal: round(f.kcal_per_100g), protein: round(f.protein_g_per_100g) }) +
                    (f.brand ? ` · ${f.brand}` : '')
                  }
                  onClick={() => {
                    setPicked(f);
                    setGrams(String(f.serving_g ?? 100));
                  }}
                />
              ))}
            </RowStack>
          ) : search.isFetched ? (
            <NoticeLine tone="info" role="status">
              {t('nutrition.noResults')}
            </NoticeLine>
          ) : null
        ) : null}

        {picked ? (
          <div className="flex flex-col gap-6 pt-1">
            <div className="flex flex-col gap-4">
              <p className="line-clamp-2 text-title text-text-1">{picked.name}</p>
              <div className="flex items-end justify-between gap-4">
                <Field
                  label={t('nutrition.grams')}
                  inputMode="decimal"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                  className="w-40"
                  unit={unitG}
                  // A FORMAT check and nothing more: the number is usable, not right.
                  trailing={gramsValid ? <Check aria-hidden className="-mr-1 size-5 text-text-1" strokeWidth={2} /> : undefined}
                />
                {/* What the grams come to, recomputed as they type from the food's own per-100 g
                    figures — the same arithmetic the server does. Shown, NOT sent. Its baseline
                    is the typed value's (16 above the field's end). */}
                <Numeral
                  value={round((picked.kcal_per_100g * (gramsValid ? gramsNumber : 0)) / 100)}
                  unit={unitKcal}
                  className="mb-4"
                />
              </div>
            </div>
            <Pressable
              variant="primary"
              size="lg"
              className="w-full"
              busy={log.isPending}
              disabled={!gramsValid}
              onClick={submit}
            >
              {t('common.add')}
            </Pressable>
          </div>
        ) : null}
      </Section>

      {/* ── THE DAY ──────────────────────────────────────────────────────────────────────────── */}
      <Section title={t('nutrition.logged')}>
        {day.isLoading ? (
          <RowStack as="div" role="status">
            <span className="sr-only">{t('common.loading')}</span>
            {[0, 1, 2].map((i) => (
              <ListRowSkeleton key={i} sub index={i} />
            ))}
          </RowStack>
        ) : groups.length === 0 ? (
          // No button: the search line above is the action, and a second one would compete with it.
          <EmptyState title={t('nutrition.emptyTitle')} body={t('nutrition.emptyBody')} />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(([label, items]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <h3 className="text-micro text-text-2">{label}</h3>
                <RowStack>
                  {items.map((item) => (
                    <ListRow
                      key={item.id}
                      title={item.name}
                      sub={`${round(item.grams)} ${unitG}`}
                      // Nothing in the row is tappable but the cross, so the 44 pt target at the far
                      // edge cannot be hit by accident: delete has no confirm and no undo.
                      control={
                        <span className="flex items-center">
                          <span className="whitespace-nowrap text-data text-text-1">
                            {round(item.kcal)} <span className="text-text-2">{unitKcal}</span>
                          </span>
                          <Pressable
                            variant="link"
                            shape="icon"
                            glyph="field"
                            onClick={() => remove.mutate(item.id)}
                            aria-label={t('common.delete')}
                          >
                            <X aria-hidden />
                          </Pressable>
                        </span>
                      }
                    />
                  ))}
                </RowStack>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Screen>
  );
}

const EMPTY = { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, fiber_g: 0 };

/**
 * The browser's calendar day, formatted without a timezone round-trip.
 *
 * `toISOString()` would be UTC — at 01:00 in Budapest that is yesterday, and the user would open
 * the app to the wrong day every night. This reads the LOCAL parts, which is the whole point.
 */
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

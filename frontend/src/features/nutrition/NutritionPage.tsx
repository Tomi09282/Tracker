import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Apple, Plus, Trash2, Search } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { MacroBars } from './MacroBars';
import { useFoodSearch, useNutritionDay, useLogFood, useDeleteLogItem } from './useNutrition';
import type { FoodRow, LogItem } from './useNutrition';

/**
 * The client's food day.
 *
 * ═══ THE DATE IS THE CLIENT'S, NOT THE SERVER'S ════════════════════════════════════════════════
 *
 * `todayLocal()` reads the browser's calendar day, and the write sends the IANA zone alongside it.
 * A meal logged at 00:30 in Budapest is today's, and a server in another zone must not decide
 * otherwise. The same rule the workout log follows, for the same reason.
 *
 * ═══ WHAT IS DELIBERATELY ABSENT ═══════════════════════════════════════════════════════════════
 *
 * There is no "remaining calories" figure and no streak. Remaining invites the arithmetic that
 * turns a food log into a budget to be spent down, and a streak on eating punishes the day someone
 * did not feel like recording it. The totals, the targets and the list are the honest surface.
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

  const submit = async () => {
    const g = Number(grams.replace(',', '.'));
    if (!picked || !Number.isFinite(g) || g <= 0) return;
    // food_id and grams. NO macros — the server reads those from its own row, and sending one is
    // a 400 rather than an ignore.
    await log.mutateAsync({ food_id: picked.id, grams: g });
    setPicked(null);
    setQ('');
    setGrams('100');
  };

  return (
    <div className="col-mobile screen-x flex flex-col gap-5 py-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-title-2">{t('nutrition.title')}</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          // The floor applies to a date input as much as to a button; it is tapped one-handed.
          className="text-body-s min-h-[var(--target-min)] rounded-card border border-line bg-surface-2 px-3 text-text-1"
          aria-label={t('nutrition.date')}
        />
      </header>

      {/* TOTALS FIRST. It is the question the screen exists to answer, and putting the search box
          above it would make the primary content something you scroll to. */}
      <section className="rounded-card border border-line bg-surface-2 p-4">
        <h2 className="text-label mb-3 text-text-2">
          {day.data?.targets?.day_name ?? t('nutrition.totals')}
        </h2>
        {day.isLoading ? (
          <div className="h-24 animate-pulse rounded-card bg-surface-3" />
        ) : (
          <>
            <MacroBars totals={day.data?.totals ?? EMPTY} targets={day.data?.targets ?? null} />
            {day.data && !day.data.targets ? (
              // Said rather than left blank. A missing target is a fact about the plan's schedule,
              // and an unexplained absence reads as a bug.
              <p className="text-caption mt-3 text-text-3">{t('nutrition.noTargetToday')}</p>
            ) : null}
          </>
        )}
      </section>

      {/* ADD */}
      <section>
        <h2 className="text-label mb-2 text-text-2">{t('nutrition.add')}</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
            }}
            placeholder={t('nutrition.searchPlaceholder')}
            className="text-body min-h-[var(--target-min)] w-full rounded-card border border-line bg-surface-2 pl-9 pr-3 text-text-1"
            aria-label={t('nutrition.searchPlaceholder')}
          />
        </div>

        {q && !picked ? (
          <ul className="mt-2 flex flex-col gap-1">
            {(search.data?.foods ?? []).slice(0, 8).map((f) => (
              <li key={f.id}>
                <Pressable
                  variant="ghost"
                  className="w-full justify-between text-left"
                  onClick={() => {
                    setPicked(f);
                    setGrams(String(f.serving_g ?? 100));
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-body block truncate text-text-1">{f.name}</span>
                    <span className="text-caption text-text-3">
                      {round(f.kcal_per_100g)} kcal · {round(f.protein_g_per_100g)}g P /100g
                      {f.brand ? ` · ${f.brand}` : ''}
                    </span>
                  </span>
                  <Plus className="size-4 shrink-0 text-text-3" aria-hidden />
                </Pressable>
              </li>
            ))}
            {search.isFetched && (search.data?.foods ?? []).length === 0 ? (
              <li className="text-caption px-3 py-2 text-text-3">{t('nutrition.noResults')}</li>
            ) : null}
          </ul>
        ) : null}

        {picked ? (
          <div className="mt-2 flex items-end gap-2 rounded-card border border-line bg-surface-2 p-3">
            <span className="min-w-0 flex-1">
              <span className="text-body block truncate text-text-1">{picked.name}</span>
              {/* The consequence of the grams, recomputed as they type — from the food's own
                  per-100g figures, which is the same arithmetic the server will do. It is shown
                  so the number is not a surprise after saving, NOT sent. */}
              <span className="text-caption text-text-3">
                {round((picked.kcal_per_100g * (Number(grams.replace(',', '.')) || 0)) / 100)} kcal
              </span>
            </span>
            <label className="flex flex-col">
              <span className="text-caption text-text-3">{t('nutrition.grams')}</span>
              <input
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                className="text-body min-h-[var(--target-min)] w-20 rounded-card border border-line bg-surface-3 px-2 text-right tabular-nums text-text-1"
              />
            </label>
            <Pressable variant="primary" busy={log.isPending} onClick={submit}>
              {t('common.add')}
            </Pressable>
          </div>
        ) : null}
      </section>

      {/* THE DAY */}
      <section>
        <h2 className="text-label mb-2 text-text-2">{t('nutrition.logged')}</h2>
        {day.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-card bg-surface-2" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon={Apple} title={t('nutrition.emptyTitle')} body={t('nutrition.emptyBody')} />
        ) : (
          groups.map(([label, items]) => (
            <div key={label} className="mb-3">
              <h3 className="text-caption mb-1 uppercase text-text-3">{label}</h3>
              <ul className="flex flex-col gap-1">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-card border border-line bg-surface-2 px-3"
                  >
                    <span className="min-w-0 flex-1 py-2">
                      <span className="text-body block truncate text-text-1">{item.name}</span>
                      <span className="text-caption text-text-3 tabular-nums">
                        {round(item.grams)}g · {round(item.kcal)} kcal · {round(item.protein_g)}g P
                      </span>
                    </span>
                    <Pressable
                      variant="ghost"
                      shape="icon"
                      onClick={() => remove.mutate(item.id)}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Pressable>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

const EMPTY = { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 };

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

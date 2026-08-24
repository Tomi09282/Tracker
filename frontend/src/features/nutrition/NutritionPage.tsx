import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Apple,
  Beef,
  CalendarDays,
  Check,
  Droplet,
  Flame,
  NotebookPen,
  Plus,
  Search,
  Trash2,
  Utensils,
  Wheat,
  X,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { SummaryTile } from '../../ui/data/SummaryTile';
import { Gauge } from '../../ui/feedback/Gauge';
import { CountUp } from '../../ui/feedback/CountUp';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { useFoodSearch, useNutritionDay, useLogFood, useDeleteLogItem } from './useNutrition';
import type { FoodRow, LogItem } from './useNutrition';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

/**
 * The client's food day — [[55-Screens/nutrition]].
 *
 * ═══ ONE RING, THREE TILES — AND NO TABLE ══════════════════════════════════════════════════════
 *
 * They arrive with one question ("am I over or under") and one task ("log this thing"). The four
 * stacked label-plus-number-plus-bar rows this screen used to open with answered the question only
 * after you had read four lines in order, which is a table — the exact verdict that killed the
 * previous pass. Calories are the one COUNTABLE GOAL WITH A KNOWN DENOMINATOR here, so they get
 * the ring: the sweep of the arc *is* the quantity, read before any digit. The other three macros
 * are supporting figures and get `SummaryTile`s, told apart by an icon rather than by their
 * position in a list.
 *
 * `MacroBars` is retired ON THIS SCREEN (it still draws the Home card), but its two rules moved
 * here rather than dying with it:
 *   - the fill CLAMPS at a full sweep, the figure never does. 3200 against 2400 must not draw the
 *     same picture as exactly 2400 — the arc goes full, the number tells the truth.
 *   - overshoot is WARNING, never DANGER. Someone 14 g over on fat has had a normal Tuesday, and
 *     the tone of a colour is part of what the app says to them.
 *
 * ═══ THE DATE IS THE CLIENT'S, NOT THE SERVER'S ════════════════════════════════════════════════
 *
 * `todayLocal()` reads the browser's calendar day, and the write sends the IANA zone alongside it.
 * A meal logged at 00:30 in Budapest is today's, and a server in another zone must not decide
 * otherwise. The same rule the workout log follows, for the same reason.
 *
 * ═══ WHAT IS DELIBERATELY ABSENT ═══════════════════════════════════════════════════════════════
 *
 * No "remaining calories" figure, no streak, and no undo toast on delete. Remaining invites the
 * arithmetic that turns a food log into a budget to be spent down; a streak on eating punishes the
 * day someone did not feel like recording it; and the toast would have been the only floating layer
 * on the screen, advertising reversibility for an action that is instant everywhere else in this
 * product. The feedback for a delete is the ring shrinking.
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
  // Clamped by `Gauge` itself; the figure below it is the unclamped truth.
  const kcalFill = kcalTarget != null && kcalTarget > 0 ? totals.kcal / kcalTarget : 0;
  // A missing target is a fact about the PLAN's schedule, not a zero. Said out loud below the ring.
  const noTarget = !day.isLoading && day.data != null && targets == null;

  const macros = [
    { key: 'protein', icon: Beef, value: totals.protein_g, target: targets?.protein_g_target ?? null },
    { key: 'carb', icon: Wheat, value: totals.carb_g, target: targets?.carb_g_target ?? null },
    { key: 'fat', icon: Droplet, value: totals.fat_g, target: targets?.fat_g_target ?? null },
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

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      <header className="flex items-center justify-between gap-tight">
        <h1 className="text-title-1 text-text-1">{t('nutrition.title')}</h1>

        {/* The date control is a pill with our own glyph, not a bare native input: the native
            picker indicator is stretched invisibly across the whole control instead, so the
            entire 44px pill opens the OS picker rather than a 20px corner of it. */}
        <label className="relative flex min-h-[var(--target-min)] shrink-0 items-center gap-tight rounded-field border-[length:var(--border-width)] border-[var(--field-border)] bg-[var(--field-bg)] px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]">
          <CalendarDays className="size-icon-s shrink-0 text-accent" aria-hidden />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t('nutrition.date')}
            className="text-body-s relative bg-transparent tabular-nums text-text-1 outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
          />
        </label>
      </header>

      {/* ── THE ANCHOR ───────────────────────────────────────────────────────────────────────
          The loudest thing in the frame, and the day's own name sits INSIDE it rather than as a
          heading above it — the label attached to the thing it labels, one horizontal rule fewer. */}
      <section className="flex flex-col gap-group">
        <div className="flex justify-center">
          <Gauge
            label={t('nutrition.macro.kcal')}
            /* `segments` rather than `value` for one arc, because a single segment is the only way
               to colour the sweep: overshoot has to read amber, not accent. */
            segments={[{ value: kcalFill, color: kcalOver ? 'var(--warning)' : 'var(--accent)' }]}
            className="aspect-square w-full max-w-[220px]"
          >
            {day.isLoading ? (
              // The track still draws; only the figure is a placeholder, so nothing moves on swap.
              <div className="flex flex-col items-center gap-tight">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Flame
                  className={cn('size-icon-m', kcalOver ? 'text-[var(--warning)]' : 'text-accent')}
                  aria-hidden
                />
                <p
                  className={cn(
                    'text-display font-display tabular-nums',
                    kcalOver ? 'text-[var(--warning)]' : 'text-text-1',
                  )}
                >
                  <CountUp to={Math.round(totals.kcal)} />
                  {/* With no denominator to draw, the unit joins the figure instead. */}
                  {kcalTarget == null ? ' kcal' : null}
                </p>
                {kcalTarget != null ? (
                  <p className="text-body-s tabular-nums text-text-3">/ {round(kcalTarget)} kcal</p>
                ) : null}
                <p className="text-body-s mt-1 text-text-2">
                  {targets?.day_name ?? t('nutrition.totals')}
                </p>
              </div>
            )}
          </Gauge>
        </div>

        {noTarget ? (
          <p className="text-caption text-center text-text-3">{t('nutrition.noTargetToday')}</p>
        ) : null}

        <div className="grid grid-cols-3 gap-tight">
          {day.isLoading
            ? [0, 1, 2].map((i) => (
                // Built from the tile's own parts rather than one block of a guessed height, so
                // the footprint is the real one and the row cannot jump when the data lands.
                <Surface key={i} className="flex flex-col gap-tight">
                  <Skeleton className="size-11 rounded-chip" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="mt-1 h-1.5 w-full rounded-chip" />
                </Surface>
              ))
            : macros.map((m) => {
                const over = m.target != null && m.value > m.target;
                const label = t(`nutrition.macro.${m.key}`);
                return (
                  <SummaryTile
                    key={m.key}
                    icon={m.icon}
                    value={`${round(m.value)}g`}
                    // No target means no `· cél` clause and no bar — the same rule the ring obeys.
                    caption={m.target != null ? `${label} · ${round(m.target)}g` : label}
                    progress={
                      m.target != null && m.target > 0 ? m.value / m.target : undefined
                    }
                    /* The tinted card, the warning border, the amber number, the amber bar and the
                       alert glyph all hang off this one prop now — they used to be half here and
                       half in the component, which is how Home ended up drawing a different card
                       for the same fact. */
                    over={over}
                  />
                );
              })}
        </div>
      </section>

      {/* ── ADD ──────────────────────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-group">
        <h2 className="text-title-2 flex items-center gap-tight text-text-1">
          <span
            aria-hidden
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-chip bg-accent-subtle text-accent"
          >
            <Plus className="size-icon-m" strokeWidth={2} />
          </span>
          {t('nutrition.add')}
        </h2>

        {/* Hand-composed rather than `Field`: `Field` always renders a visible label, and a search
            box that sits directly under its own section heading would then say the same words
            twice. Every class below is `Field`'s, so the two cannot drift apart visually. */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-icon-s -translate-y-1/2 text-text-3"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
            }}
            placeholder={t('nutrition.searchPlaceholder')}
            aria-label={t('nutrition.searchPlaceholder')}
            className="text-body min-h-[var(--control-h)] w-full rounded-field border-[length:var(--border-width)] border-[var(--field-border)] bg-[var(--field-bg)] ps-[var(--target-min)] pe-12 text-text-1 outline-none placeholder:text-text-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          />
          {q ? (
            <Pressable
              variant="ghost"
              shape="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => {
                setQ('');
                setPicked(null);
              }}
              aria-label={t('common.close')}
            >
              <X className="size-icon-s" aria-hidden />
            </Pressable>
          ) : null}
        </div>

        {q && !picked ? (
          <ul className="flex flex-col">
            {(search.data?.foods ?? []).slice(0, 8).map((f) => (
              <li key={f.id}>
                <Pressable
                  variant="ghost"
                  className="w-full justify-start gap-tight px-2 text-left"
                  onClick={() => {
                    setPicked(f);
                    setGrams(String(f.serving_g ?? 100));
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-chip bg-accent-subtle text-accent"
                  >
                    <Utensils className="size-icon-s" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-body-strong block truncate text-text-1">{f.name}</span>
                    <span className="text-caption block truncate text-text-3">
                      {round(f.kcal_per_100g)} kcal · {round(f.protein_g_per_100g)}g P /100g
                      {f.brand ? ` · ${f.brand}` : ''}
                    </span>
                  </span>
                  <Plus className="size-icon-m shrink-0 text-accent" aria-hidden />
                </Pressable>
              </li>
            ))}
            {search.isFetched && (search.data?.foods ?? []).length === 0 ? (
              <li className="text-caption px-3 py-3 text-text-3">{t('nutrition.noResults')}</li>
            ) : null}
          </ul>
        ) : null}

        {picked ? (
          <Surface className="flex flex-wrap items-center gap-tight">
            <span className="min-w-0 flex-1">
              <span className="text-body-strong block truncate text-text-1">{picked.name}</span>
              {/* The consequence of the grams, recomputed as they type — from the food's own
                  per-100g figures, which is the same arithmetic the server will do. It is shown
                  so the number is not a surprise after saving, NOT sent. */}
              <span className="text-caption block tabular-nums text-text-3">
                {round((picked.kcal_per_100g * (gramsValid ? gramsNumber : 0)) / 100)} kcal
              </span>
            </span>

            <span className="flex min-h-[var(--control-h)] shrink-0 items-center gap-tight rounded-field border-[length:var(--border-width)] border-[var(--field-border)] bg-[var(--field-bg)] px-3">
              <input
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                aria-label={t('nutrition.grams')}
                className="text-body w-12 bg-transparent text-right tabular-nums text-text-1 outline-none"
              />
              <span className="text-body-s text-text-3" aria-hidden>
                g
              </span>
              {/* A FORMAT check and nothing more: it says the number is usable, not that the
                  amount is right. Hidden rather than crossed out when it is not. */}
              {gramsValid ? (
                <Check className="size-icon-s shrink-0 text-[var(--success)]" aria-hidden />
              ) : null}
            </span>

            <Pressable
              variant="primary"
              busy={log.isPending}
              disabled={!gramsValid}
              onClick={submit}
            >
              {t('common.add')}
            </Pressable>
          </Surface>
        ) : null}
      </section>

      {/* ── THE DAY ──────────────────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-group">
        <h2 className="text-title-2 flex items-center gap-tight text-text-1">
          <span
            aria-hidden
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-chip bg-accent-subtle text-accent"
          >
            <NotebookPen className="size-icon-s" strokeWidth={2} />
          </span>
          {t('nutrition.logged')}
        </h2>

        {day.isLoading ? (
          <div className="flex flex-col gap-tight">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-card" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          // No button: the search field above is the action, and a second one would compete with it.
          <EmptyState icon={Apple} title={t('nutrition.emptyTitle')} body={t('nutrition.emptyBody')} />
        ) : (
          <div className="flex flex-col gap-group">
            {groups.map(([label, items]) => (
              <div key={label} className="flex flex-col gap-tight">
                <h3 className="text-micro uppercase text-text-3">{label}</h3>
                {/* ONE card per group, hairline-divided inside — not one card per row. Six bordered
                    boxes is six times the edge for the same six meals. */}
                <Surface as="ul" pad="none" className="overflow-hidden">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      /* The hairline goes on the SIBLING rather than on every row, so the first
                         row has no rule above it and the card's own top edge is the only line. */
                      className="flex items-center gap-tight border-[var(--card-border)] px-4 [&+li]:border-t-[length:var(--border-width)]"
                    >
                      {/* Nothing here is tappable except the trash, so a 44px icon control at the
                          far edge cannot be hit by accident: delete has no confirm and no undo. */}
                      <span className="min-w-0 flex-1 py-2">
                        <span className="text-body-strong block truncate text-text-1">
                          {item.name}
                        </span>
                        <span className="text-caption block tabular-nums text-text-3">
                          {round(item.grams)}g · {round(item.kcal)} kcal
                        </span>
                      </span>
                      <Pressable
                        variant="ghost"
                        shape="icon"
                        onClick={() => remove.mutate(item.id)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="size-icon-s" aria-hidden />
                      </Pressable>
                    </li>
                  ))}
                </Surface>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
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

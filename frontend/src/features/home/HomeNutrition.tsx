import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ChevronRight, Droplet, Egg, Flame, Salad, Wheat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { SummaryTile } from '../../ui/data/SummaryTile';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useNutritionDay } from '../nutrition/useNutrition';

/**
 * Today's nutrition, on Home — [[55-Screens/01 Home]] block 6.
 *
 * ═══ TILES, NOT A TABLE ════════════════════════════════════════════════════════════════════════
 *
 * Four rows of `label / value / bar` is the purest form of "the whole UI is data fields": sixteen
 * values at one size, none of them the answer to anything. As tiles each macro is ONE object you
 * read at a glance, and the fourth (`Zsír`) wrapping below the fold is honest about the order
 * people actually check them in.
 *
 * ═══ THE SAME HOOK, THE SAME QUERY KEY, THE SAME NUMBERS ═══════════════════════════════════════
 *
 * `useNutritionDay` — not a second endpoint and not a second sum. Home and `/nutrition` cannot
 * disagree about a total unless a tile starts doing its own arithmetic, which is precisely the bug
 * `NutritionCard` was built to prevent. The rounding below mirrors `MacroBars` for the same
 * reason: `128` here and `128,4` there is the same disagreement in a smaller font.
 *
 * ═══ AND IT RENDERS NOTHING UNTIL THERE IS SOMETHING TO SAY ════════════════════════════════════
 *
 * No logged items and no target for today means no block at all, rather than four zeroed tiles.
 * Home is the screen a client opens twenty times a day; a permanent `0` on it is not a prompt.
 */
export function HomeNutrition({ date }: { date: string }) {
  const { t } = useTranslation();
  const day = useNutritionDay(date);

  if (day.isLoading) {
    return (
      <div className="flex flex-col gap-group">
        <Skeleton className="h-11 w-40 rounded-field" />
        <Skeleton className="h-36 w-full rounded-card" />
      </div>
    );
  }

  // Narrowed by the guard rather than by a non-null assertion: `data` really can be undefined when
  // the query has errored, and `!` would turn that into a crash on the busiest screen.
  const data = day.data;
  if (!data || (data.items.length === 0 && data.targets == null)) return null;

  const macros: { key: string; icon: LucideIcon; value: number; unit: string; target: number | null }[] = [
    { key: 'kcal', icon: Flame, value: round(data.totals.kcal), unit: '', target: data.targets?.kcal_target ?? null },
    { key: 'protein', icon: Egg, value: round(data.totals.protein_g), unit: 'g', target: data.targets?.protein_g_target ?? null },
    { key: 'carb', icon: Wheat, value: round(data.totals.carb_g), unit: 'g', target: data.targets?.carb_g_target ?? null },
    { key: 'fat', icon: Droplet, value: round(data.totals.fat_g), unit: 'g', target: data.targets?.fat_g_target ?? null },
  ];

  return (
    <section aria-labelledby="nutrition-heading" className="flex flex-col gap-group">
      <SectionHeader
        icon={Salad}
        title={t('nutrition.card.title')}
        titleId="nutrition-heading"
        action={
          <Link
            to="/nutrition"
            className="text-caption inline-flex min-h-[var(--target-min)] shrink-0 items-center gap-1 text-accent"
          >
            {t('nutrition.card.open')}
            <ChevronRight className="size-icon-s" aria-hidden />
          </Link>
        }
      />

      {/* Three across; the fourth wraps. Deliberate: `Kalória` is what people check, `Zsír` is what
          they check afterwards, and pretending otherwise costs a row of vertical space here. */}
      <div className="grid grid-cols-3 gap-tight">
        {macros.map((m) => (
          <SummaryTile
            key={m.key}
            className="min-w-0"
            icon={m.icon}
            // A number animates through CountUp; `128 g` carries a unit and simply renders.
            value={m.unit ? `${m.value} ${m.unit}` : m.value}
            // The TARGET, not the macro name — the glyph is what says which macro this is, so
            // the caption line is spent on the denominator the figure is missing. `round()` for
            // display only: `m.target` stays raw below so `progress` and `over` keep their
            // precision. No target means no `cél` clause, matching MacroBars on /nutrition.
            caption={
              m.target != null
                ? t('nutrition.card.targetCaption', {
                    value: m.unit ? `${round(m.target)} ${m.unit}` : round(m.target),
                  })
                : t(`nutrition.macro.${m.key}`)
            }
            progress={m.target != null && m.target > 0 ? m.value / m.target : undefined}
            // Warning, never danger, and the copy never scolds: somebody three hundred calories
            // past their target has had a normal Tuesday. `SummaryTile` owns that colour rule.
            over={m.target != null && m.value > m.target}
          />
        ))}
      </div>
    </section>
  );
}

/** The display rounding `MacroBars` uses, so the two screens never print a different figure. */
const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

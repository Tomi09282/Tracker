import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { MacroColumns, type MacroColumn } from '../../ui/data/MacroColumns';
import { Section } from '../../ui/data/SectionHeader';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { TextLink } from '../../ui/primitives/TextLink';
import { useNutritionDay } from '../nutrition/useNutrition';

/**
 * Today's nutrition, on Home — frames `home-1` / `home-2` ("Táplálkozás").
 *
 * ═══ THE COMPOSITION OF THE FRAME ══════════════════════════════════════════════════════════════
 *
 * A ruled section, quiet: strong rule -> "TÁPLÁLKOZÁS" eyebrow with "Megnyitás ›" on its baseline
 * (the chevron's tip on the right edge) -> the macro row: four columns 16 apart, each the macro's
 * name, the figure in mono with its unit, a 4 pt bar of logged / target, and "cél …" under it.
 * No tiles, no glyphs, no lime: the screen's lamp is the session's pill.
 *
 * ═══ THE SAME HOOK, THE SAME QUERY KEY, THE SAME NUMBERS ═══════════════════════════════════════
 *
 * `useNutritionDay` — not a second endpoint and not a second sum. Home and `/nutrition` cannot
 * disagree about a total unless this block starts doing its own arithmetic. The display rounding
 * below mirrors the nutrition screen's for the same reason.
 *
 * ═══ STATES ════════════════════════════════════════════════════════════════════════════════════
 *
 *   no target for the day   the name and the figure only: no bar, no "cél" line
 *   over target             `MacroColumns` turns that figure and its bar to the warning colour
 *   nothing logged, no target   the block is not rendered at all — a permanent row of zeros on the
 *                               screen opened twenty times a day is not a prompt
 *   loading                 blocks where the eyebrow and the columns' lines will be
 */
export function HomeNutrition({ date }: { date: string }) {
  const { t } = useTranslation();
  const day = useNutritionDay(date);

  if (day.isLoading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Narrowed by the guard rather than by a non-null assertion: `data` really can be undefined when
  // the query has errored, and `!` would turn that into a crash on the busiest screen.
  const data = day.data;
  if (!data || (data.items.length === 0 && data.targets == null)) return null;

  const macros: { key: string; value: number; unit: string; target: number | null }[] = [
    { key: 'kcal', value: round(data.totals.kcal), unit: '', target: data.targets?.kcal_target ?? null },
    { key: 'protein', value: round(data.totals.protein_g), unit: 'g', target: data.targets?.protein_g_target ?? null },
    { key: 'carb', value: round(data.totals.carb_g), unit: 'g', target: data.targets?.carb_g_target ?? null },
    { key: 'fat', value: round(data.totals.fat_g), unit: 'g', target: data.targets?.fat_g_target ?? null },
  ];

  const columns: MacroColumn[] = macros.map((m) => ({
    name: t(`nutrition.macro.${m.key}`),
    value: m.value,
    unit: m.unit || undefined,
    // logged / target; over 1 is the warning state. No target, no bar.
    ratio: m.target != null && m.target > 0 ? m.value / m.target : null,
    caption:
      m.target != null
        ? t('nutrition.card.targetCaption', {
            value: m.unit ? `${round(m.target)} ${m.unit}` : round(m.target),
          })
        : undefined,
  }));

  return (
    <Section
      title={t('nutrition.card.title')}
      trailing={
        <TextLink to="/nutrition" trail={<ChevronRight />}>
          {t('nutrition.card.open')}
        </TextLink>
      }
    >
      <MacroColumns columns={columns} />
    </Section>
  );
}

/** The display rounding the nutrition screen uses, so the two screens never print a different figure. */
const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

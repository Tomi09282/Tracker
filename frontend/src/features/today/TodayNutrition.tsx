import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { MacroColumns, type MacroColumn } from '../../ui/data/MacroColumns';
import { Section } from '../../ui/data/SectionHeader';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { TextLink } from '../../ui/primitives/TextLink';
import { useNutritionDay } from '../nutrition/useNutrition';

/**
 * TÁPLÁLKOZÁS on Ma — frames ma-1..ma-3 ("Macro row · compact": `macroCol` × 2, 169 wide, 16
 * apart). The Kezdőlap's block (`features/home/HomeNutrition.tsx`), moved here with the page:
 *
 *   strong rule -> "TÁPLÁLKOZÁS" + "Megnyitás ›" -> two columns: Kalória and Fehérje, each the
 *   name, the mono figure with its unit, a 4 pt bar of logged / target and "cél …" under it.
 *
 * Round B draws TWO columns where home-1 drew four: Ma is long, and the day's food is context here
 * (the four macros stay one tap away on Táplálkozás). The hook, the query key and the rounding are
 * the nutrition screen's, so Ma and /nutrition cannot print different numbers.
 *
 *   no target for the day      the name and the figure only: no bar, no "cél" line
 *   over target                `MacroColumns` turns the figure and its bar to the warning colour
 *   failed read                the names with "—" and "Újra" under them — never 0
 *   nothing logged, no target  the block is not rendered (a permanent row of zeros is not a prompt)
 *   loading                    blocks where the eyebrow and the columns' lines will be
 */
export function TodayNutrition({ date }: { date: string }) {
  const { t } = useTranslation();
  const day = useNutritionDay(date);

  if (day.isLoading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const header = (
    <TextLink to="/nutrition" trail={<ChevronRight />}>
      {t('nutrition.card.open')}
    </TextLink>
  );

  if (day.isError && !day.data) {
    const columns: MacroColumn[] = MACROS.map((key) => ({ name: t(`nutrition.macro.${key}`), value: '—' }));
    return (
      <Section title={t('nutrition.card.title')} trailing={header}>
        <div className="flex flex-col gap-4">
          <MacroColumns columns={columns} />
          <TextLink text="body" className="min-w-11 self-start" onClick={() => void day.refetch()}>
            {t('common.retry')}
          </TextLink>
        </div>
      </Section>
    );
  }

  const data = day.data;
  if (!data || (data.items.length === 0 && data.targets == null)) return null;

  const macros: { key: (typeof MACROS)[number]; value: number; unit: string; target: number | null }[] = [
    { key: 'kcal', value: round(data.totals.kcal), unit: '', target: data.targets?.kcal_target ?? null },
    { key: 'protein', value: round(data.totals.protein_g), unit: 'g', target: data.targets?.protein_g_target ?? null },
  ];

  const columns: MacroColumn[] = macros.map((m) => ({
    name: t(`nutrition.macro.${m.key}`),
    value: m.value,
    unit: m.unit || undefined,
    ratio: m.target != null && m.target > 0 ? m.value / m.target : null,
    caption:
      m.target != null
        ? t('nutrition.card.targetCaption', { value: m.unit ? `${round(m.target)} ${m.unit}` : round(m.target) })
        : undefined,
  }));

  return (
    <Section title={t('nutrition.card.title')} trailing={header}>
      <MacroColumns columns={columns} />
    </Section>
  );
}

/** The two columns round B draws, in its order. */
const MACROS = ['kcal', 'protein'] as const;

/** The display rounding the nutrition screen uses, so the two screens never print a different figure. */
const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

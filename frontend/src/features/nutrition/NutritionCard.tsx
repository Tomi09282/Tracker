import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { MacroBars } from './MacroBars';
import { useNutritionDay } from './useNutrition';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

/**
 * Today's nutrition, on Home (T4.1.7).
 *
 * ═══ IT RENDERS NOTHING UNTIL THERE IS SOMETHING TO SAY ════════════════════════════════════════
 *
 * No logged items and no target for today means the card returns `null` rather than a zero ring
 * over a zero bar. Home is the screen a client opens twenty times a day, and a permanent "0 / 0"
 * on it is not a prompt, it is a reproach — the same reason the workout hero refuses to invent a
 * session for a client with no plan.
 *
 * The route is still reachable from the empty state below the fold and from Settings, so nothing
 * is hidden; it simply does not shout at somebody who has not started using the feature.
 *
 * ═══ ONE FEWER PLACE FOR THE MACROS TO DISAGREE ════════════════════════════════════════════════
 *
 * The bars are `MacroBars`, the same component the full screen uses, reading the same endpoint
 * under the same query key. A card with its own summary arithmetic is a card that will eventually
 * show a different total from the screen it links to.
 */
export function NutritionCard({ date }: { date: string }) {
  const { t } = useTranslation();
  const day = useNutritionDay(date);

  if (day.isLoading) {
    return <Skeleton className="mt-4 h-28 rounded-card" />;
  }

  // Narrowed by the guard rather than by a non-null assertion: `data` really can be undefined
  // when the query has errored, and `!` would turn that into a crash on the busiest screen.
  const data = day.data;
  if (!data || (data.items.length === 0 && data.targets == null)) return null;

  return (
    <section className="mt-4 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4" aria-labelledby="nutrition-heading">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="nutrition-heading" className="text-title-3 text-text-1">
          {t('nutrition.card.title')}
        </h2>
        <Link
          to="/nutrition"
          className="text-caption flex min-h-[var(--target-min)] items-center gap-1 text-accent"
        >
          {t('nutrition.card.open')}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <MacroBars totals={data.totals} targets={data.targets} />
    </section>
  );
}

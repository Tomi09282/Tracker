import { useIsFetching } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

/**
 * The one place the app says "loading" out loud.
 *
 * ═══ WHY THIS IS GLOBAL AND NOT A WRAPPER AT EACH LOADING BRANCH ═══════════════════════════════
 *
 * Every `Skeleton` is `aria-hidden`, which is right — a screen reader should not be read a list of
 * grey rectangles. But `role="status"` lived only on `ScreenSkeleton`'s own wrapper, and the
 * fifty-nine inline `<Skeleton>` uses across twenty-six files sit in bare `<div>`s. Measured on the
 * marketplace routes: three skeletons on screen and `[role="status"], [aria-busy="true"]` counting
 * ZERO. So the boxes were not read out and nothing was announced in their place — silence for the
 * whole load, on every screen in the app.
 *
 * The obvious fix is a `SkeletonGroup` wrapper applied at all twenty-six sites. It was rejected,
 * and the reason is the whole point: **that is the same shape as the defect it fixes.** A
 * convention that has to be remembered at twenty-six call sites is a convention that will be
 * forgotten at the twenty-seventh — which is exactly how nine screens came to hand-roll a skeleton
 * that already existed as a component. One definition beats twenty-six correct copies.
 *
 * ═══ WHAT IT LISTENS TO ════════════════════════════════════════════════════════════════════════
 *
 * Queries with NO data yet — a first load, which is precisely when a skeleton is on screen. A
 * background refetch is deliberately excluded: there is already content on the page to read, and
 * interrupting a reader to announce a refresh they did not ask for is worse than saying nothing.
 * Returning to a cached route announces nothing either, because the content is instant and there
 * was never a wait to describe.
 *
 * This also covers screens that render no `Skeleton` at all, which a per-site wrapper could not.
 */
export function LoadingAnnouncer() {
  const { t } = useTranslation();
  const firstLoads = useIsFetching({ predicate: (q) => q.state.data === undefined });

  // The region is always mounted and its TEXT changes. A live region that mounts and unmounts is
  // unreliable — several screen readers only announce content that changes inside a region that
  // was already there when the change happened.
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {firstLoads > 0 ? t('common.loading') : ''}
    </span>
  );
}

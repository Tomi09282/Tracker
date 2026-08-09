import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

/**
 * Skeleton block — E18-A shimmer.
 *
 * Spinners are banned for content loads (Bible): a spinner says "something is happening",
 * a skeleton says "this is what is arriving and where it will sit". The shapes below must
 * match the real geometry, otherwise the swap causes exactly the layout shift the skeleton
 * was supposed to prevent.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-field bg-[var(--skeleton-base)]',
        'bg-[linear-gradient(90deg,var(--skeleton-base)_25%,var(--skeleton-sheen)_50%,var(--skeleton-base)_75%)]',
        'bg-[length:200%_100%] animate-[skeleton-sweep_var(--duration-ambient)_linear_infinite]',
        className,
      )}
    />
  );
}

/**
 * Full-screen placeholder used while the session is still unknown.
 *
 * The announcement is TRANSLATED, which it was not: a hardcoded "Loading" was the first thing a
 * Hungarian or German screen-reader user heard on entering the app. It is invisible, so no visual
 * review would ever have caught it — and `check-i18n` could not either, because it audits the
 * bundles, not the JSX. `common.loading` already existed and simply was not used.
 */
export function ScreenSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="screen-x col-mobile py-6" role="status" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-24" />
      <Skeleton className="mt-6 h-32 w-full rounded-card" />
      <Skeleton className="mt-4 h-24 w-full rounded-card" />
    </div>
  );
}

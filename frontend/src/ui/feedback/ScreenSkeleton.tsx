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
        'bg-[length:200%_100%] animate-[skeleton-sweep_1.2s_linear_infinite]',
        className,
      )}
    />
  );
}

/** Full-screen placeholder used while the session is still unknown. */
export function ScreenSkeleton() {
  return (
    <div className="screen-x col-mobile py-6" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-24" />
      <Skeleton className="mt-6 h-32 w-full rounded-card" />
      <Skeleton className="mt-4 h-24 w-full rounded-card" />
    </div>
  );
}

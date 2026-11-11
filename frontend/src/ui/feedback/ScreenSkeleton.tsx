import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { Rule } from '../data/Rule';

/**
 * A skeleton block — kit `skel(w, h = 16)`: `surface-2`, radius 2, in place of ONE text line.
 *
 *     ████████████████████            16   the line of a 16 px title (body, body-m)
 *     ██████████                      12   the line of a 13 px caption (cap)      8 apart
 *
 * Pulse System 4 ("Skeleton"): blocks stand in for each text line (16 / 12 high), a numeral is one
 * block at its cap height, and images are WITHHELD — a picture that has not arrived leaves its
 * reserved box empty, it never gets a grey square. Never a spinner: a spinner says "something is
 * happening", a skeleton says "this is what is arriving and where it will sit". The block must
 * therefore have the geometry of what replaces it, or the swap is the layout shift the skeleton
 * was supposed to prevent.
 *
 * Motion: the sheen sweeps across the block on the ambient loop (`animate-sheen`, 1.2 s). Under
 * reduced motion the loop stops and the block stays plain `surface-2` — what the board draws.
 *
 * The block has its radius (2) and its colour; a call site passes SIZE and placement only. A
 * radius at a call site (`rounded-card`, `rounded-full`) is the shape of the old tile it stood in
 * for and is counted by `check:pulse` (`shaped-skeleton`) until that screen is rebuilt.
 *
 * `data-kit="skel"`: the capture tool matches the board's `Skeleton` layers to it.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      data-kit="skel"
      className={cn(
        'rounded-1 bg-[var(--skeleton-base)]',
        'bg-[linear-gradient(90deg,var(--skeleton-base)_25%,var(--skeleton-sheen)_50%,var(--skeleton-base)_75%)]',
        'bg-[length:200%_100%] animate-sheen motion-reduce:animate-none motion-reduce:bg-none',
        className,
      )}
    />
  );
}

/**
 * Full-screen placeholder used while the session or a route chunk is still unknown.
 *
 * Drawn in the Pulse grammar it stands in for: the screen's display title (one block at the cap
 * height of a 32 px display line), then one section — the strong rule, the eyebrow at its cap
 * height, and three rows of title + caption at the row pitch, a hairline between two. It is the
 * shape most screens open with; it does not try to be any one of them.
 *
 * The announcement is TRANSLATED (`common.loading`): a hardcoded "Loading" was the first thing a
 * Hungarian or German screen-reader user heard on entering the app.
 */
const ROWS = [
  ['w-55', 'w-30'],
  ['w-45', 'w-24'],
  ['w-65', 'w-35'],
] as const;

export function ScreenSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="screen-x col-mobile py-6" role="status" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <div aria-hidden className="flex flex-col gap-section">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-col gap-group">
          <Rule strong />
          <Skeleton className="h-3 w-24" />
          <div className="flex flex-col">
            {ROWS.map(([title, sub], index) => (
              <div
                key={title}
                className={cn(
                  'flex min-h-[var(--row-h-sub)] flex-col justify-center gap-2 py-2.5',
                  index > 0 && 'border-t border-hair',
                )}
              >
                <Skeleton className={cn('h-4 max-w-full', title)} />
                <Skeleton className={cn('h-3 max-w-full', sub)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

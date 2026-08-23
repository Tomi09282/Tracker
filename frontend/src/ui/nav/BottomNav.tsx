import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useElementVariant } from '../feedback/ElementStyleProvider';
import { PILL_MAX_TABS } from '../../app/navTabs';

export interface NavTab {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
  badge?: number;
}

/**
 * The app's ONLY primary navigation (owner requirement 12, Bible LAYOUT LAW).
 *
 * TWO SHAPES, AND THE COUNT PICKS ONE.
 *
 * Up to five tabs the bar is a detached floating pill, inset from all three edges — the shape
 * `v4-vegleges/sotet/02-workout-player.png` shows for a member. At six and seven it becomes a
 * full-width slab pinned to the bottom, which is what `.../11-admin-attekintes.png` shows for an
 * admin, labels truncated and all. Both approved mockups are right; they are drawing different
 * roles. Seven pill cells do not fit a 320px phone once you subtract margins on both sides; seven
 * full-width cells do, at 44px each with 12px to spare.
 *
 * THERE IS NO CLAMP ANY MORE.
 *
 * This component used to end its tab list with `slice(0, 5)`, and the reason was real: a sixth
 * tab was once pushed by accident and the clamp swallowed it, so an admin saw five tabs and
 * `/admin` was not among them. But a clamp hides exactly the failure it was written to catch —
 * the tab vanished silently instead of the build breaking. The count now lives in
 * `app/navTabs.ts` and `check-nav.mjs` asserts it, so the failure is loud and this renders
 * whatever it is given.
 *
 * THE SAFE AREA IS EXPLICIT NOW, AND HAS TO BE.
 *
 * The old bar was `inset-x-0` with no horizontal inset and it was fine — but only by accident:
 * `max-w-md` plus `mx-auto` capped the row at 448px and centred it, so on a notched phone in
 * landscape the outer tabs never reached the cutout. Removing that cap to let seven cells span the
 * width also removes the accident. `check-safe-area` inspects `top-0` and `bottom-0` only, so it
 * would not have said a word.
 */
export function BottomNav({ tabs }: { tabs: readonly NavTab[] }) {
  const { t } = useTranslation();
  const variant = useElementVariant('E11');

  const pill = tabs.length <= PILL_MAX_TABS;

  return (
    <nav
      aria-label={t('nav.primary')}
      className={cn(
        'fixed bottom-0 z-[var(--z-nav)]',
        'bg-[var(--nav-bg)] backdrop-blur-[var(--nav-blur)]',
        // Horizontal safe area on both shapes. `max()` rather than a bare `env()` because the
        // inset is 0 on every device without a cutout, and a pill still wants its own margin
        // there — see .screen-x, which solves the same problem the same way.
        'ps-[max(0px,env(safe-area-inset-left))] pe-[max(0px,env(safe-area-inset-right))]',
        pill
          ? [
              // Detached: floats above the content with air on all three sides, on every width.
              'inset-x-[max(var(--nav-dock-offset),env(safe-area-inset-left))]',
              'bottom-[calc(var(--nav-dock-offset)+env(safe-area-inset-bottom))]',
              'rounded-chip border border-[var(--surface-border)] px-2',
              // Desktop keeps the same pill, centred and content-width rather than stretched.
              'lg:inset-x-auto lg:left-1/2 lg:w-auto lg:-translate-x-1/2',
            ]
          : [
              // Pinned: edge to edge, sitting on the bottom with the inset reserved below it.
              'inset-x-0 border-t border-[var(--surface-border)]',
              'pb-[env(safe-area-inset-bottom)]',
              // At six or seven tabs the desktop dock would have to grow unbounded, so desktop
              // keeps the slab too rather than becoming a very wide pill.
              'lg:pb-0',
            ],
      )}
    >
      <ul
        className={cn(
          'flex items-stretch justify-around',
          // `mx-auto max-w-md` on the pill only. On the slab it would re-introduce the very cap
          // that has to go: seven cells centred inside 448px are 64px each while the screen is
          // 393px wide, which overflows rather than fits.
          pill && 'mx-auto max-w-md lg:max-w-none lg:gap-1',
        )}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          // `min-w-0` because `flex-1` alone does not make a flex item shrinkable: the default
          // `min-width: auto` floors it at its content width. Measured at 360px — the five links
          // came to 79+95+89+53+65 = 381px, so "Tervek" ran 21px past the viewport, unreadable
          // and only half tappable. With the floor removed the cells are equal, and that is what
          // makes six and seven of them possible at all.
          return (
            <li key={tab.to} className={cn('min-w-0 flex-1', pill && 'lg:flex-none')}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    // The bar is 64px tall; the link fills it, so the whole cell is tappable
                    // rather than just the icon.
                    'flex h-[var(--nav-h)] min-w-[var(--target-min)] flex-col items-center',
                    // No horizontal padding on the narrowest phones: the cells are equal width and
                    // the whole cell is the tap target, so the padding bought nothing and cost 8px
                    // of label. The truncate below is the safety net — and at seven tabs it is not
                    // a safety net any more but the expected result, which the admin mockup draws.
                    'justify-center gap-1 px-0 sm:px-3',
                    pill && 'lg:flex-row lg:gap-2 lg:px-4',
                    'transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
                    isActive ? 'text-[var(--nav-fg-active)]' : 'text-[var(--nav-fg-idle)]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative inline-flex items-center justify-center">
                      {/* A — the active indicator is a background pill at 12% accent, drawn
                          behind the icon rather than around the whole cell: a full-cell
                          highlight fights the 64px bar height and reads as a button, not a tab.
                          B — a dot below the icon instead, for a lighter bar.
                          C — the icon itself thickens when active, with no separate marker. */}
                      {isActive && variant === 'A' ? (
                        <span
                          aria-hidden
                          className="absolute -inset-x-3 -inset-y-1 rounded-chip bg-accent-subtle"
                        />
                      ) : null}
                      {isActive && variant === 'B' ? (
                        <span
                          aria-hidden
                          className="absolute -bottom-1.5 size-1 rounded-chip bg-accent"
                        />
                      ) : null}
                      <Icon
                        // 24px, per the Bible. The previous build shipped 20 and it read as timid.
                        size={24}
                        strokeWidth={isActive && variant === 'C' ? 2.75 : 2}
                        aria-hidden
                        className="relative transition-[stroke-width] duration-[var(--duration-fast)]"
                      />
                      {typeof tab.badge === 'number' && tab.badge > 0 ? (
                        <span
                          className={cn(
                            'absolute -right-2 -top-1 min-w-4 rounded-chip px-1',
                            'text-micro tabular-nums bg-danger text-on-danger',
                            variant === 'D' && 'animate-[badge-pop_var(--duration-base)_var(--ease-standard)]',
                          )}
                        >
                          {tab.badge > 99 ? '99+' : tab.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-micro max-w-full truncate">{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

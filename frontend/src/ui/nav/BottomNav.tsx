import { NavLink } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useElementVariant } from '../feedback/ElementStyleProvider';

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
 * Mobile: a fixed 64 px bar plus the safe-area inset, full width.
 * Desktop (≥1024 px): a centred floating dock, 16 px above the screen bottom, backdrop-blurred.
 *
 * Five slots is the contract, so a sixth item is clamped rather than squeezed in — an overflow
 * menu is the correct answer there, and silently shrinking five tabs into six is not.
 */
export function BottomNav({ tabs }: { tabs: readonly NavTab[] }) {
  const variant = useElementVariant('E11');
  const visible = tabs.slice(0, 5);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-nav)]',
        'border-t border-[var(--surface-border)] bg-[var(--nav-bg)] backdrop-blur-xl',
        'pb-[env(safe-area-inset-bottom)]',
        // Desktop dock: detached, centred, pill-shaped, 16px off the bottom edge.
        'lg:inset-x-auto lg:bottom-[var(--nav-dock-offset)] lg:left-1/2 lg:w-auto',
        'lg:-translate-x-1/2 lg:rounded-chip lg:border lg:px-2 lg:pb-0',
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around lg:max-w-none lg:gap-1">
        {visible.map((tab) => {
          const Icon = tab.icon;
          return (
            <li key={tab.to} className="flex-1 lg:flex-none">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    // The bar is 64px tall; the link fills it, so the whole cell is tappable
                    // rather than just the icon.
                    'flex h-[var(--nav-h)] min-w-[var(--target-min)] flex-col items-center',
                    'justify-center gap-1 px-3 lg:flex-row lg:gap-2 lg:px-4',
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
                    <span className="text-micro">{tab.label}</span>
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

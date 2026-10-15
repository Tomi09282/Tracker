import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { isTabActive } from '../../app/navTabs';
import { tabIconSlot } from '../../assets/pulse';
import type { TabIconKey } from '../../assets/pulse';
import { cn } from '../../lib/cn';
import { Pic } from '../media/Pic';

export interface NavTab {
  to: string;
  /** Which raster pair to draw: `tab-<key>` and its lit twin (`assets/pulse`). */
  icon: TabIconKey;
  label: string;
  end?: boolean;
  /**
   * Not rendered. Pulse has no badges on tabs (the one count badge lives on the bell).
   * @deprecated kept so existing callers compile; removed in the closing cleanup.
   */
  badge?: number;
  /** Route prefixes this tab owns for the ACTIVE state only. See `navTabs.ts`. */
  owns?: readonly string[];
}

export interface BottomNavProps {
  tabs: readonly NavTab[];
  /**
   * Places the bar and its fade at the bottom of the nearest POSITIONED ancestor instead of the
   * viewport. For the kit specimens and the playground demo, where several bars share one page:
   * the ancestor is the "phone" (`relative`), and it may stand in for the device by setting
   * `--tabbar-offset` / `--fade-h` (the frames: 36 / 130).
   */
  inline?: boolean;
  /**
   * The pathname the bar answers for, instead of the current location. Specimens only: it is what
   * lets one page show a five, a six and a seven tab bar, each with another tab lit.
   */
  at?: string;
  /**
   * Specimens only: holds the tab whose `to` is named in a state that needs a finger (`pressed`)
   * or a keyboard (`focus`), with the same declarations as the real `:active` / `:focus-visible`.
   */
  force?: { pressed?: string; focus?: string };
  className?: string;
}

/* Icon size by tab count (kit `tabBar`): 32, and 28 once seven cells share the width — the values
   of `--tab-icon` / `--tab-icon-dense`. An `<img>` needs them as attributes, so they are numbers. */
const ICON = 32;
const ICON_DENSE = 28;

/* The bar's own side inset by tab count — 10 / 12 / 8 on the frames, so the cells come out at
   76.4 / 63 / 55.1 pt. `max()` with the device inset: in landscape the cutout is on a side edge. */
const INSET = {
  5: 'ps-[max(var(--tabbar-inset-5),env(safe-area-inset-left))] pe-[max(var(--tabbar-inset-5),env(safe-area-inset-right))]',
  6: 'ps-[max(var(--tabbar-inset-6),env(safe-area-inset-left))] pe-[max(var(--tabbar-inset-6),env(safe-area-inset-right))]',
  7: 'ps-[max(var(--tabbar-inset-7),env(safe-area-inset-left))] pe-[max(var(--tabbar-inset-7),env(safe-area-inset-right))]',
} as const;

/* A state a specimen holds still: the same declarations as the real ones on the cell. */
const FORCED_FOCUS =
  'data-[force=focus]:outline-2 data-[force=focus]:outline-[var(--focus-ring)] data-[force=focus]:-outline-offset-2';

/**
 * The app's ONLY primary navigation: the Pulse tab bar.
 *
 * ═══ WHAT IT IS (kit `tabBar` + `chrome`) ══════════════════════════════════════════════════════
 *
 * No surface, no border, no capsule: equal cells standing on the canvas, over a fade.
 *
 *   bar     56 high (`--nav-h`), `--tabbar-offset` above the screen bottom (inset + 2): y 782-838
 *           on the frames. The `<nav>` itself paints nothing.
 *   cells   equal, on the width left by the side inset (10 / 12 / 8 for 5 / 6 / 7 tabs); the WHOLE
 *           cell is the target, 56 high and never under 44 wide
 *   icon    a raster pair, 32 pt (28 at seven), 2 pt above the label, the pair centred in the cell
 *   label   `tab` (Geist Medium 11 / 14, text-2), sentence case; lit: `tab-on` (SemiBold, text-1).
 *           The one place where selection changes weight: the cells are fixed, so nothing shifts
 *   fade    a SIBLING layer behind the bar, not its background: the canvas rising from nothing to
 *           solid over the first 28 % of `--fade-h` (130 pt). It takes no taps — its upper part
 *           overlaps content the user must still be able to press
 *
 * ═══ BOTH RASTERS OF EVERY TAB ARE ALWAYS IN THE DOM ═══════════════════════════════════════════
 *
 * `<Pic lit>` stacks the idle and the lit image and switches their opacity ("ignite", `fast`,
 * nothing slides). It is also what puts all fourteen files into the service worker's cache on the
 * first online paint: a lit icon first requested while offline would be a hole in the bar.
 *
 * ═══ ONE EXPRESSION FOR THE LIT STATE AND `aria-current` ═══════════════════════════════════════
 *
 * `isTabActive` (in `navTabs.ts`, the pure module the gates import) answers "is the user inside
 * what this tab owns" — not "does the URL equal this tab's `to`", which is what `NavLink` answers
 * and why this is a plain `Link`. The raster a sighted user sees, the weight of the label and the
 * attribute a screen reader reads come from that one result. A bar that shows EDZÉS lit while
 * announcing no current page is worse than a blank bar: only one of the two audiences can see it.
 *
 * ═══ THERE IS NO CLAMP, AND THE HORIZONTAL SAFE AREA IS EXPLICIT ═══════════════════════════════
 *
 * The bar renders what it is given; the count is declared in `navTabs.ts` and asserted by
 * `check-nav.mjs`, which also holds this file to both side insets.
 *
 * ═══ DESKTOP ═══════════════════════════════════════════════════════════════════════════════════
 *
 * From `lg` the bar keeps the dock it had (R21): the same cells, content-width and centred, the
 * icon beside its label.
 */
export function BottomNav({ tabs, inline = false, at, force, className }: BottomNavProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const pathname = at ?? location.pathname;

  const count = tabs.length >= 7 ? 7 : tabs.length === 6 ? 6 : 5;
  const iconSize = count === 7 ? ICON_DENSE : ICON;

  const bar = (
    <nav
      aria-label={t('nav.primary')}
      className={cn(
        // The nav is the strip the bar stands in. It takes no taps itself: only the cells do, so
        // the side insets and (on a desktop) everything beside the dock let a tap through.
        'pointer-events-none z-[var(--z-nav)] mx-auto h-[var(--nav-h)] max-w-[var(--screen-max)]',
        inline
          ? 'absolute inset-x-0 bottom-[var(--tabbar-offset)]'
          : 'fixed inset-x-0 bottom-[var(--tabbar-offset)] lg:max-w-none',
        INSET[count],
        className,
      )}
    >
      <ul
        data-kit="tabBar"
        data-tabs={count}
        className={cn(
          'pointer-events-auto mx-auto flex h-full w-full items-stretch',
          !inline && 'lg:w-fit lg:max-w-none lg:gap-2',
        )}
      >
        {tabs.map((tab) => {
          // The ONE answer: it lights the raster, weights the label and sets `aria-current`.
          const active = isTabActive(tab, pathname);
          const forced = force?.pressed === tab.to ? 'pressed' : force?.focus === tab.to ? 'focus' : undefined;

          // `min-w-0`, because `flex-1` alone does not make a flex item shrinkable: the default
          // `min-width: auto` floors it at its content width, and seven labels do not fit 360.
          return (
            <li key={tab.to} className={cn('min-w-0 flex-1', !inline && 'lg:flex-none')}>
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                data-part="tab"
                data-force={forced}
                className={cn(
                  'group flex h-full min-w-[var(--target-min)] flex-col items-center justify-center gap-0.5',
                  !inline && 'lg:flex-row lg:gap-2 lg:px-4',
                  // The ring is drawn inside the cell: the cells touch, and an outset ring would be
                  // cut by the neighbour and by the screen edge.
                  'focus-visible:-outline-offset-2',
                  FORCED_FOCUS,
                )}
              >
                <Pic
                  slot={tabIconSlot(tab.icon)}
                  width={iconSize}
                  lit={active}
                  // Pressed: the icon dims to 60 %, in `instant`. Nothing moves.
                  className={cn(
                    'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] motion-reduce:transition-none',
                    'group-active:opacity-[var(--pressed-opacity)] group-data-[force=pressed]:opacity-[var(--pressed-opacity)]',
                  )}
                />
                {/* Sentence case, as written in the bundle: the same `nav.*` strings are the
                    accessible names of these links. `truncate` is the safety net of the seventh
                    cell on a 360 pt phone (49 pt for a 49 pt word). */}
                <span
                  className={cn('max-w-full truncate', active ? 'text-tab-on text-text-1' : 'text-tab text-text-2')}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  // The fade: the canvas rising behind the bar. Decoration — hidden from assistive technology and
  // from the pointer.
  const fade = (
    <div
      aria-hidden
      data-part="bottomFade"
      className={cn(
        'pointer-events-none z-[var(--z-nav)] h-[var(--fade-h)] bg-[image:var(--nav-fade)]',
        inline ? 'absolute inset-x-0 bottom-0' : 'fixed inset-x-0 bottom-0',
      )}
    />
  );

  return (
    <>
      {fade}
      {bar}
    </>
  );
}

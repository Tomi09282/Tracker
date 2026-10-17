import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Undo2 } from 'lucide-react';
import { isSwitch, isTabActive, NAV_TABS, type NavView } from '../../app/navTabs';
import type { NavIconKey, SwitchIconKey } from '../../assets/pulse';
import { cn } from '../../lib/cn';
import { NavIcon } from './NavIcon';

/** One cell of the bar, resolved: the label is a string, not a key. */
export type NavTab =
  | {
      kind?: 'tab';
      /** The React key, and a name a specimen's `force` may use. Unique within a bar. */
      key: string;
      to: string;
      /** Which raster draws the cell (`assets/pulse/navIcons.ts`). */
      icon: NavIconKey;
      label: string;
      end?: boolean;
      /** Route prefixes this tab owns for the ACTIVE state only. See `navTabs.ts`. */
      owns?: readonly string[];
    }
  | {
      /** A way back to another view: never lit, never `aria-current`. See `navTabs.ts`. */
      kind: 'switch';
      key: string;
      to: string;
      icon: SwitchIconKey;
      /** The visible label: the destination role ("Tag", "Edző"). */
      label: string;
      /** The accessible name: the whole phrase ("Vissza: tag nézet"). */
      name: string;
    };

/**
 * A view's tab table, resolved in the current language. The app's layout and the kit specimens
 * read the same table, so a specimen cannot drift from the bar it shows.
 */
export function useNavTabs(view: NavView): NavTab[] {
  const { t } = useTranslation();
  return useMemo(
    () =>
      NAV_TABS[view].map(
        (spec): NavTab =>
          isSwitch(spec)
            ? { kind: 'switch', key: spec.key, to: spec.to, icon: spec.icon, label: t(spec.labelKey), name: t(spec.nameKey) }
            : { key: spec.key, to: spec.to, icon: spec.icon, label: t(spec.labelKey), end: spec.end, owns: spec.owns },
      ),
    [view, t],
  );
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
   * lets one page show several bars, each with another tab lit.
   */
  at?: string;
  /**
   * Specimens only: holds the cell named (by its `key` or its `to`) in a state that needs a finger
   * (`pressed`) or a keyboard (`focus`), with the same declarations as the real `:active` /
   * `:focus-visible`.
   */
  force?: { pressed?: string; focus?: string };
  className?: string;
}

/* Icon size by tab count (kit `tabBar`): 32, and 28 once seven cells share the width — the values
   of `--tab-icon` / `--tab-icon-dense`. An `<img>` needs them as attributes, so they are numbers. */
const ICON = 32;
const ICON_DENSE = 28;

/* The bar's own side inset (frame `bars`): 10 for the member's five, 12 for six, 8 for seven —
   and 12 (`--tabbar-inset-4`) for four cells and for EVERY bar that opens with a switch column, so
   "↩ Tag" is centred on x 44 in the trainer and in the admin view, at 402 and at 360. `max()`
   with the device inset: in landscape the cutout is on a side edge. */
const INSET = {
  4: 'ps-[max(var(--tabbar-inset-4),env(safe-area-inset-left))] pe-[max(var(--tabbar-inset-4),env(safe-area-inset-right))]',
  5: 'ps-[max(var(--tabbar-inset-5),env(safe-area-inset-left))] pe-[max(var(--tabbar-inset-5),env(safe-area-inset-right))]',
  6: 'ps-[max(var(--tabbar-inset-6),env(safe-area-inset-left))] pe-[max(var(--tabbar-inset-6),env(safe-area-inset-right))]',
  7: 'ps-[max(var(--tabbar-inset-7),env(safe-area-inset-left))] pe-[max(var(--tabbar-inset-7),env(safe-area-inset-right))]',
} as const;

const insetFor = (count: number, switches: number) =>
  switches > 0 || count <= 4 ? INSET[4] : count >= 7 ? INSET[7] : count === 6 ? INSET[6] : INSET[5];

/* A state a specimen holds still: the same declarations as the real ones on the cell. */
const FORCED_FOCUS =
  'data-[force=focus]:outline-2 data-[force=focus]:outline-[var(--focus-ring)] data-[force=focus]:-outline-offset-2';

/* Pressed: the icon dims to 60 %, in `instant`. Nothing moves. */
const PRESSED = cn(
  'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] motion-reduce:transition-none',
  'group-active:opacity-[var(--pressed-opacity)] group-data-[force=pressed]:opacity-[var(--pressed-opacity)]',
);

const CELL = 'group flex h-full min-w-[var(--target-min)] flex-col items-center justify-center gap-0.5';

/**
 * The app's ONLY primary navigation: the Pulse tab bar.
 *
 * ═══ WHAT IT IS (kit `tabBar` + `chrome`, frame `bars` of design round A) ═════════════════════
 *
 * No surface, no border, no capsule: cells standing on the canvas, over a fade.
 *
 *   bar       56 high (`--nav-h`), `--tabbar-offset` above the screen bottom (inset + 2): y 782-838
 *             on the frames. The `<nav>` itself paints nothing.
 *   cells     4 to 7. A member's bar: equal cells on the width left by the side inset (10 / 12 / 8
 *             for 5 / 6 / 7). A role bar: the SWITCH column first — 64 pt per switch cell from
 *             inset 12 — then equal destination cells on what is left (trainer 104.7, admin 83.3
 *             on 402). The WHOLE cell is the target, 56 high and never under 44 wide
 *   switch    a way back to another view, not a place: the idle raster at full strength, a 12 pt
 *             return glyph in ink before the destination role ("↩ Tag"). Never lit, never
 *             `aria-current`; its accessible name is the whole phrase ("Vissza: tag nézet")
 *   divider   1 pt, white 14 % (`hair-strong`), 32 high at y 12, after the switch column
 *   icon      a raster, 32 pt (28 at seven), 2 pt above the label (`NavIcon`)
 *   label     `tab` (Geist Medium 11 / 14, text-2), sentence case; lit: `tab-on` (SemiBold,
 *             text-1). The one place where selection changes weight: the cells are fixed, so
 *             nothing shifts
 *   fade      a SIBLING layer behind the bar, not its background: the canvas rising from nothing
 *             to solid over the first 28 % of `--fade-h` (130 pt). It takes no taps
 *
 * ═══ ONE EXPRESSION FOR THE LIT STATE AND `aria-current` ═══════════════════════════════════════
 *
 * `isTabActive` (in `navTabs.ts`, the pure module the gates import) answers "is the user inside
 * what this tab owns" — and answers false for a switch, always. The raster a sighted user sees,
 * the weight of the label and the attribute a screen reader reads come from that one result.
 *
 * ═══ THERE IS NO CLAMP, AND THE HORIZONTAL SAFE AREA IS EXPLICIT ═══════════════════════════════
 *
 * The bar renders what it is given; the counts are declared in `navTabs.ts` and asserted by
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

  const switches = tabs.filter(isSwitch).length;
  const count = tabs.length;
  const iconSize = count >= 7 ? ICON_DENSE : ICON;
  const forcedFor = (tab: NavTab) => {
    const names = [tab.key, tab.to];
    if (force?.pressed !== undefined && names.includes(force.pressed)) return 'pressed';
    if (force?.focus !== undefined && names.includes(force.focus)) return 'focus';
    return undefined;
  };

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
        insetFor(count, switches),
        className,
      )}
    >
      <ul
        data-kit="tabBar"
        data-tabs={count}
        data-switches={switches || undefined}
        className={cn(
          'pointer-events-auto mx-auto flex h-full w-full items-stretch',
          !inline && 'lg:w-fit lg:max-w-none lg:gap-2',
        )}
      >
        {tabs.map((tab, index) => {
          const forced = forcedFor(tab);

          if (isSwitch(tab)) {
            return (
              <li key={tab.key} className={cn('w-16 flex-none', !inline && 'lg:w-auto')}>
                <Link
                  to={tab.to}
                  aria-label={tab.name}
                  data-part="switch"
                  data-force={forced}
                  className={cn(CELL, !inline && 'lg:flex-row lg:gap-2 lg:px-4', 'focus-visible:-outline-offset-2', FORCED_FOCUS)}
                >
                  <NavIcon icon={tab.icon} size={iconSize} lit={false} className={PRESSED} />
                  <span className="flex max-w-full items-center gap-0.5">
                    {/* Lucide `undo-2`, 12 pt, stroke 2.5, in ink: the glyph is what says "back". */}
                    <Undo2 aria-hidden className="size-3 shrink-0 text-text-1" strokeWidth={2.5} />
                    <span className="truncate text-tab text-text-2">{tab.label}</span>
                  </span>
                </Link>
              </li>
            );
          }

          // The ONE answer: it lights the raster, weights the label and sets `aria-current`.
          const active = isTabActive(tab, pathname);
          // The hairline stands on the left edge of the first destination after the switches.
          const divider = switches > 0 && index === switches;

          // `min-w-0`, because `flex-1` alone does not make a flex item shrinkable: the default
          // `min-width: auto` floors it at its content width, and seven labels do not fit 360.
          return (
            <li key={tab.key} className={cn('relative min-w-0 flex-1', !inline && 'lg:flex-none')}>
              {divider ? (
                <span aria-hidden data-part="switchDivider" className="absolute top-3 left-0 h-8 w-px bg-hair-strong" />
              ) : null}
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                data-part="tab"
                data-force={forced}
                className={cn(
                  CELL,
                  !inline && 'lg:flex-row lg:gap-2 lg:px-4',
                  // The ring is drawn inside the cell: the cells touch, and an outset ring would be
                  // cut by the neighbour and by the screen edge.
                  'focus-visible:-outline-offset-2',
                  FORCED_FOCUS,
                )}
              >
                <NavIcon icon={tab.icon} size={iconSize} lit={active} className={PRESSED} />
                {/* Sentence case, as written in the bundle: the same `nav.*` strings are the
                    accessible names of these links. `truncate` is the safety net of the seventh
                    cell on a 360 pt phone. */}
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

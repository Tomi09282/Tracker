import { createContext, useContext } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/* ── what the layout tells the screen ───────────────────────────────────────────────────────── */

/** The chrome the current layout draws around its screens. */
export interface ShellInfo {
  /** True inside `AppLayout` (a tab bar stands at the bottom), false inside `PublicLayout`. */
  tabs: boolean;
}

const ShellContext = createContext<ShellInfo>({ tabs: false });

/**
 * Mounted ONCE by each layout route (`AppLayout`: `tabs`, `PublicLayout`: no tabs).
 *
 * A screen never says whether it has a tab bar: that is a fact about the layout it renders in, and
 * a prop a page has to remember is a prop a page gets wrong. `Screen` and `Dock` read it from here
 * and pick their bottom distances — the page air above the bar, or above the home indicator.
 */
export function ShellProvider({ tabs, children }: { tabs: boolean; children: ReactNode }) {
  return <ShellContext.Provider value={{ tabs }}>{children}</ShellContext.Provider>;
}

/** The layout's chrome, for the shell kit and for a screen with a layout of its own. */
export function useShell(): ShellInfo {
  return useContext(ShellContext);
}

/* ── the status-bar mask ────────────────────────────────────────────────────────────────────── */

/**
 * A strip of canvas exactly as tall as the top inset, pinned over the page.
 *
 * Pulse has no app bar: a header is ordinary content at inset + 10. So a scrolled list would run
 * up under the clock and the island. This strip is what stops it. Where the device reports no
 * inset its height is 0 and it does not exist.
 *
 * It is part of the SCAFFOLD, not of the layouts: `Screen` mounts it. A screen that has not moved
 * onto the scaffold yet does not pad its own top by the inset either, and a mask over it would
 * hide its first line instead of covering a scrolled one. So the mask arrives screen by screen,
 * exactly with the top inset it protects.
 *
 * `--status-bar-h` is the bare inset on purpose (no floor): the floor of `--safe-t` is breathing
 * room for a header, not an area anything has to be hidden under.
 */
export function StatusBarMask() {
  return (
    <div
      aria-hidden
      data-kit="statusBarMask"
      className="pointer-events-none fixed inset-x-0 top-0 z-[var(--z-sticky)] h-[var(--status-bar-h)] bg-surface-0"
    />
  );
}

/* ── the scaffold ───────────────────────────────────────────────────────────────────────────── */

type ScreenElement = 'div' | 'main' | 'section' | 'form';

export interface ScreenProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /**
   * Where the first thing on the screen starts, measured from the top inset.
   *
   *   `root`  inset + 10 (y 72 on the frames): a tab root, under `ScreenHeader kind="greet" | "root"`
   *   `push`  inset + 2  (y 64): under `ScreenHeader kind="push" | "section"`
   *   `none`  the inset alone: a screen that draws its own top
   */
  top?: 'root' | 'push' | 'none';
  /** The rhythm between the blocks of the screen: 32 (`block`, the Pulse default), 24 or none. */
  gap?: 'block' | 'tight' | 'none';
  /**
   * `mobile` (default): one centred column, 430 at most. `wide`: the 1120 desktop column — only
   * for the screens that have a desktop layout today.
   */
  width?: 'mobile' | 'wide';
  /**
   * At least one viewport tall, as a flex column, so a block can take the free height (`flex-1`):
   * sign-in, the conversation, the player. The screen may still grow past it and scroll.
   */
  fill?: boolean;
  /** The element to render. `main` on a public screen, whose layout draws no landmark. */
  as?: ScreenElement;
  children?: ReactNode;
}

const TOP: Record<NonNullable<ScreenProps['top']>, string> = {
  root: 'pt-[var(--head-top-root)]',
  push: 'pt-[var(--head-top-push)]',
  none: 'pt-[var(--safe-t)]',
};

const GAP: Record<NonNullable<ScreenProps['gap']>, string> = {
  block: 'gap-8',
  tight: 'gap-6',
  none: 'gap-0',
};

/**
 * The page scaffold: every Pulse screen is one of these, directly under its layout.
 *
 * ═══ WHAT IT OWNS, SO NO PAGE HAS TO ═══════════════════════════════════════════════════════════
 *
 *   top      the top inset plus the header offset, from a TOKEN (`--head-top-root` / `-push`).
 *            The token is where the zero-inset floor lives: a desktop browser reports no inset and
 *            the header would sit on the window edge. `check:safe-area` holds this file to it.
 *   sides    `.screen-x`: the 24 pt gutter (16 below 376 pt), each side `max()`-ed with its inset.
 *   bottom   the air that lets the last block scroll clear of the fade: the layout already
 *            reserves the bar (`--content-pad-b`), this adds the rest up to `--page-pad-b` — and
 *            whatever a mounted `Dock` asks for (`--dock-reserve`). Without tabs it is
 *            `--page-pad-b-bare`.
 *   clip     `overflow-x: clip`. A hero or a chip row may run past the right gutter and is cut by
 *            the screen edge (`<Pic bleed>`); the page never scrolls sideways. `clip`, not
 *            `hidden`: it creates no scroll container, so `position: sticky` inside still works.
 *   rhythm   a flex column with 32 between its children — the distance between two blocks.
 *   mask     the status-bar mask (`StatusBarMask`), so content scrolled up never runs under the
 *            clock — rendered beside the scaffold, pinned to the viewport.
 *
 * It paints nothing. The canvas is `body`; a fill here would be the first card.
 */
export function Screen({
  top = 'root',
  gap = 'block',
  width = 'mobile',
  fill = false,
  as = 'div',
  className,
  children,
  ...rest
}: ScreenProps) {
  const { tabs } = useShell();
  // One polymorphic slot: the four elements take the same global attributes.
  const Element = as as 'div';
  return (
    <>
      <StatusBarMask />
      <Element
        data-kit="scaffold"
        className={cn(
          'screen-x mx-auto flex w-full flex-col overflow-x-clip',
          width === 'wide' ? 'max-w-[var(--col-wide)]' : 'max-w-[var(--screen-max)]',
          TOP[top],
          GAP[gap],
          tabs
            ? 'pb-[calc(var(--page-pad-b)_-_var(--content-pad-b)_+_var(--dock-reserve))]'
            : 'pb-[calc(var(--page-pad-b-bare)_+_var(--dock-reserve))]',
          fill && (tabs ? 'min-h-[calc(var(--viewport-h)_-_var(--content-pad-b))]' : 'min-h-[var(--viewport-h)]'),
          className,
        )}
        {...rest}
      >
        {children}
      </Element>
    </>
  );
}

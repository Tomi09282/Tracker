import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useShell } from './Screen';

/** The air between the last block of the page and the top of the fade, with and without tabs. */
const RESERVE_GAP_TABS = 12;
const RESERVE_GAP_BARE = 32;

export interface DockProps {
  /** What is docked: the screen's one pill, a composer, a footer with a status line above it. */
  children: ReactNode;
  /**
   * Overrides what the layout says. Leave it alone on a screen; it exists for the kit specimens,
   * which show both forms on one page.
   */
  tabs?: boolean;
  /**
   * Places the dock at the bottom of the nearest POSITIONED ancestor instead of the viewport, and
   * publishes no reserve. Kit specimens only: the ancestor is the "phone", and it may stand in for
   * the device by setting `--dock-b` / `--dock-b-bare` (the frames: 104 / 50).
   */
  inline?: boolean;
  /** `footer` when it closes a form or a flow; `div` (default) otherwise. */
  as?: 'div' | 'footer';
  /** Placement of the CONTENT box only (a gap between its rows). The dock has no surface to style. */
  className?: string;
}

/**
 * The docked action: one node pinned above the tab bar — or, on a screen without tabs, above the
 * home indicator — with the canvas rising under it.
 *
 * ═══ THE NUMBERS (kit `dockAction`) ════════════════════════════════════════════════════════════
 *
 *   bottom   `--dock-b` with tabs (the action ends 12 above the bar: 104 from the screen bottom on
 *            the frames), `--dock-b-bare` without (inset + 16: 50).
 *   width    the content column: on the gutter, 354 on the frames.
 *   fade     its OWN, `--dock-fade`: starts 48 above the action, solid from half way down, and ends
 *            16 under the action — where the tab bar's fade is already solid.
 *
 * ═══ WHY IT IS A SHELL PIECE AND NOT A SCREEN'S `fixed` ELEMENT ════════════════════════════════
 *
 * "Above the nav" was computed by hand in five places with three expressions and two gaps. And a
 * docked node hides the end of the page under itself unless the page pads by its height, which
 * each screen would have to measure. So the dock measures itself and publishes
 * `--dock-reserve` (its height plus the air above it) on the root element; `Screen` adds it to its
 * bottom padding. Unmounted, the reserve is 0 and the page is as long as it was.
 *
 * It sits one step ABOVE the tab bar's layer: the bar's fade is translucent where the action
 * stands (the frames paint the dock after the chrome). Only the docked node takes taps; the fade
 * lets every tap through to the page and to the bar.
 */
export function Dock({ children, tabs: tabsProp, inline = false, as: Element = 'div', className }: DockProps) {
  const shell = useShell();
  const tabs = tabsProp ?? shell.tabs;
  const box = useRef<HTMLDivElement>(null);

  // Before paint, so the page never shows one frame with its last field under the dock.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node || inline) return undefined;
    const root = document.documentElement;
    const publish = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      root.style.setProperty('--dock-reserve', `${height + (tabs ? RESERVE_GAP_TABS : RESERVE_GAP_BARE)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--dock-reserve');
    };
  }, [tabs, inline]);

  return (
    <Element
      data-kit="dockAction"
      data-tabs={tabs ? 'true' : 'false'}
      className={cn(
        'pointer-events-none bg-[image:var(--dock-fade)] pb-4 pt-12',
        // Pinned: the bottom edge of the layer is 16 under the action — the end of the fade.
        inline ? 'absolute inset-x-0' : 'fixed inset-x-0',
        'z-[var(--z-dock)]',
        tabs ? 'bottom-[calc(var(--dock-b)_-_16px)]' : 'bottom-[calc(var(--dock-b-bare)_-_16px)]',
      )}
    >
      <div
        ref={box}
        className={cn('screen-x pointer-events-auto mx-auto flex w-full max-w-[var(--screen-max)] flex-col', className)}
      >
        {children}
      </div>
    </Element>
  );
}

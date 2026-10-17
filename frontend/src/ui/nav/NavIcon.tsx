import type { CSSProperties } from 'react';
import { NAV_ICON_SOURCE, PULSE_SLOTS, pulseSrcSet } from '../../assets/pulse';
import type { NavIconKey, PulseLitSlot, SwitchIconKey } from '../../assets/pulse';
import { cn } from '../../lib/cn';
import { Pic } from '../media/Pic';

export interface NavIconProps {
  icon: NavIconKey | SwitchIconKey;
  /** The square the icon fills: `--tab-icon` (32) or `--tab-icon-dense` (28). */
  size: number;
  /** Lit. A switch key ignores it: a switch never lights. */
  lit: boolean;
  /** Placement and the pressed dimming only. */
  className?: string;
}

const IGNITE = 'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none';

/**
 * One tab-bar icon, drawn the way `assets/pulse/navIcons.ts` says its key is drawn.
 *
 *   raster  the idle / lit pair of a `tab-*` slot (`<Pic lit>`): the ignite cross-fade.
 *   none    a switch cell: the idle raster at full strength, nothing else (frame `bars`).
 *   tint    a placeholder still with no lit twin. The frame lays the accent over it in MULTIPLY;
 *           here the accent is drawn THROUGH a luminance mask of the same raster, and the idle
 *           raster fades out under it. On the black canvas both give accent × the still's light,
 *           and no blend mode enters `src` (check:assets 6: a blend shows the still's rectangle
 *           under any ancestor that forms a stacking context).
 *
 * A photo placeholder (`crop: 'cover'`) is cropped to the square, as the frame's FILL crops it;
 * every other raster is fitted. The box is always `size` x `size`, so a real master that replaces
 * a placeholder later changes nothing around it.
 */
export function NavIcon({ icon, size, lit, className }: NavIconProps) {
  const source = NAV_ICON_SOURCE[icon];

  if (source.lit === 'raster') {
    // check:assets 4 holds every `raster` source to a slot with a lit twin on disk.
    return <Pic slot={source.slot as PulseLitSlot} width={size} lit={lit} className={className} />;
  }

  const meta = PULSE_SLOTS[source.slot];
  // Cover: the shorter side meets the square, the longer one is cut by the box.
  const width = source.crop === 'cover' && meta.width > meta.height ? Math.ceil((size * meta.width) / meta.height) : size;
  const tinted = source.lit === 'tint' && lit;

  const mask: CSSProperties | undefined =
    source.lit === 'tint'
      ? {
          maskImage: `url("${pulseSrcSet(source.slot).src}")`,
          WebkitMaskImage: `url("${pulseSrcSet(source.slot).src}")`,
        }
      : undefined;

  return (
    <span
      data-kit="navIcon"
      data-slot={source.slot}
      data-placeholder={source.placeholder ? 'true' : undefined}
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden', className)}
      style={{ width: size, height: size }}
    >
      <Pic
        slot={source.slot}
        width={width}
        loading="eager"
        lightsOn={false}
        bleed={width > size}
        className={cn(IGNITE, tinted && 'opacity-0')}
      />
      {source.lit === 'tint' ? (
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 bg-accent [mask-mode:luminance] [mask-position:center] [mask-repeat:no-repeat]',
            source.crop === 'cover' ? '[mask-size:cover]' : '[mask-size:contain]',
            IGNITE,
            !tinted && 'opacity-0',
          )}
          style={mask}
        />
      ) : null}
    </span>
  );
}

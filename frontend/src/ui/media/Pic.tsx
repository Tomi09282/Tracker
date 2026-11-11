import { useEffect, useRef, useState } from 'react';
import { pulseHeight, pulseSrcSet } from '../../assets/pulse';
import type { PulseLitSlot, PulseSlot } from '../../assets/pulse';
import { cn } from '../../lib/cn';

interface PicBaseProps {
  /**
   * Rendered width in CSS px — the number the frame gives (`pic('hero-grip', 216, 180)` → 216).
   *
   * There is no `height` prop on purpose. The height comes from the manifest, so the box is
   * reserved before a byte arrives and no caller can forget it (DESIGN.md rule 30: 20 unreserved
   * images on one list was a shipped defect).
   */
  width: number;
  /** Decorative by default. Give a text only when the image says something nothing beside it says. */
  alt?: string;
  /** The screen's ONE hero: fetched eagerly and first. At most one per screen. */
  priority?: boolean;
  /** Default `lazy`; a lit pair defaults to `eager`, so both states are cached on the first paint. */
  loading?: 'eager' | 'lazy';
  /**
   * Let the image run past its container (a hero that bleeds off the screen edge).
   *
   * Without it the global `img { max-width: 100% }` quietly shrinks the hero to fit. The screen
   * scaffold clips the overflow (`overflow-x: clip`), so the page does not scroll sideways.
   */
  bleed?: boolean;
  /** "Lights-on": fade up from black once decoded. Default on; never applies to a lit pair. */
  lightsOn?: boolean;
  className?: string;
}

export type PicProps = PicBaseProps &
  (
    | { slot: PulseSlot; lit?: undefined }
    | {
        /** Only a slot that HAS a lit raster may be lit — the compiler refuses `lit` on the coin. */
        slot: PulseLitSlot;
        /** Renders both rasters, stacked, and shows this one. Switching it is the "ignite". */
        lit: boolean;
      }
  );

const LIGHTS_ON = 'transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-standard)] motion-reduce:transition-none';
const IGNITE = 'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none';

/**
 * The one component that draws a bundled Pulse raster.
 *
 * ═══ WHY THERE IS NO BLEND MODE, MASK, WRAPPER OR BACKGROUND ═══════════════════════════════════
 *
 * In the design file every still is a true-black rectangle set to "lighten", so only its light
 * shows. Done the same way in CSS, the black rectangle comes back under any ancestor that forms a
 * stacking context — a transform, an opacity, `position: sticky`, a `z-index` — which is 7 of 12
 * ordinary parents, among them Pulse's own route transition. Silently, and only on some screens.
 *
 * So the blend is in the FILE: every still carries the alpha that reproduces the lighten picture
 * on the canvas (`scripts/build-pulse-assets.mjs`), and this component is a plain `<img>`. It
 * cannot show a box, whatever it is put inside. `check:assets` keeps blend modes out of `src`.
 *
 * ═══ WHAT IT DOES ══════════════════════════════════════════════════════════════════════════════
 *
 *   box        `width` + the manifest's aspect ratio → `width` / `height` attributes. With the
 *              global `height: auto` that pair IS the reserved box.
 *   density    `srcSet` with width descriptors and `sizes` = the rendered width, because one slot
 *              is drawn at several sizes (the coin at 22 and at 188).
 *   lights-on  opacity 0 → 1 over `--duration-slow` once the image has decoded. Until then the box
 *              is empty: Pulse draws no skeleton for an image. Reduced motion: it appears, no fade.
 *   lit pair   `lit` given → both rasters are in the DOM, stacked in one box, and the opacity of
 *              each follows `lit` in `--duration-fast`. Both being in the DOM is also what puts the
 *              lit icon of every tab into the service worker's cache on the first online paint.
 *
 * Text never sits on an image, and an image never gets a frame, a radius, a border or a caption
 * box (Pulse System §5) — which is why this takes a `className` for PLACEMENT only.
 */
export function Pic(props: PicProps) {
  const { slot, width, alt = '', priority = false, bleed = false, lightsOn = true, className } = props;
  const height = pulseHeight(slot, width);
  const sizes = `${width}px`;
  const pair = props.lit !== undefined;
  const loading = priority ? 'eager' : (props.loading ?? (pair ? 'eager' : 'lazy'));

  const ref = useRef<HTMLImageElement>(null);
  const [decoded, setDecoded] = useState(false);
  // An image that is already in the cache has finished before React attaches `onLoad`.
  useEffect(() => {
    if (ref.current?.complete) setDecoded(true);
  }, []);

  if (props.lit !== undefined) {
    const idle = pulseSrcSet(slot);
    const lit = pulseSrcSet(slot, { lit: true });
    return (
      <span
        data-kit="pic"
        data-slot={slot}
        data-lit={props.lit ? 'true' : 'false'}
        className={cn('relative inline-block shrink-0 align-top', className)}
      >
        <img
          src={idle.src}
          srcSet={idle.srcSet}
          sizes={idle.srcSet ? sizes : undefined}
          width={width}
          height={height}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          className={cn(IGNITE, bleed && 'max-w-none', props.lit && 'opacity-0')}
        />
        <img
          src={lit.src}
          srcSet={lit.srcSet}
          sizes={lit.srcSet ? sizes : undefined}
          width={width}
          height={height}
          alt=""
          aria-hidden
          loading={loading}
          decoding="async"
          draggable={false}
          className={cn('absolute inset-0', IGNITE, bleed && 'max-w-none', !props.lit && 'opacity-0')}
        />
      </span>
    );
  }

  const source = pulseSrcSet(slot);
  return (
    <img
      ref={ref}
      data-kit="pic"
      data-slot={slot}
      src={source.src}
      srcSet={source.srcSet}
      sizes={source.srcSet ? sizes : undefined}
      width={width}
      height={height}
      alt={alt}
      loading={loading}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      draggable={false}
      onLoad={() => setDecoded(true)}
      // A failed image must not stay invisible for ever: with an `alt`, the text is the fallback.
      onError={() => setDecoded(true)}
      className={cn(bleed && 'max-w-none', lightsOn && LIGHTS_ON, lightsOn && !decoded && 'opacity-0', className)}
    />
  );
}

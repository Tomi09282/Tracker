import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';

export interface UserPhotoProps {
  /** A same-origin media URL from the API (`/api/v1/media/…`, `/api/v1/public/media/…`). */
  src: string;
  /**
   * Required, unlike `Pic`: a user's photo is content, not decoration. Pass `''` only where the
   * text right beside it already says what the picture is.
   */
  alt: string;
  /**
   * Width ÷ height of the box, e.g. `16 / 9`, `5 / 2`, `1`. Required — it is the only thing that
   * reserves the box, because the API does not always know an upload's pixel size.
   */
  ratio: number;
  /** Lists and feeds show photos without colour (Pulse System §5). Static — never animated. */
  desaturate?: boolean;
  /** `cover` crops to the box (the default); `contain` shows the whole upload inside it. */
  fit?: 'cover' | 'contain';
  /** The lead image of a screen: fetched eagerly and first. */
  priority?: boolean;
  /** Default `lazy`. */
  loading?: 'eager' | 'lazy';
  /** PLACEMENT and width only (`w-20`, `col-span-2`). The box, the radius and the fit are not negotiable here. */
  className?: string;
  /**
   * The edges fade into the canvas (kit gap G-data 11): a static mask, no blend mode, no scrim —
   * the cover of a post (post-detail-1/2) and the lead cover of the feed (marketplace-1/2), whose
   * frame art is drawn feathered on black. A feathered photo has no corners, so no radius.
   */
  feather?: boolean;
  /**
   * The photo is wider than the column: it runs to both screen edges, over the 24 pt gutters
   * (post-detail-1: the cover under the top bar). Use with `feather`.
   */
  bleed?: boolean;
}

/** Each edge fades over 16 % of its side; the two gradients are intersected. A mask reads only alpha, so the opaque `currentColor` is the "keep" colour. */
const FEATHER: CSSProperties = {
  maskImage:
    'linear-gradient(to right, transparent, currentColor 16%, currentColor 84%, transparent), linear-gradient(to bottom, transparent, currentColor 16%, currentColor 84%, transparent)',
  WebkitMaskImage:
    'linear-gradient(to right, transparent, currentColor 16%, currentColor 84%, transparent), linear-gradient(to bottom, transparent, currentColor 16%, currentColor 84%, transparent)',
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
};

/**
 * The one component that draws user media: a progress photo, a marketplace cover, an exercise still.
 *
 * ═══ WHY IT IS NOT `Pic` ═══════════════════════════════════════════════════════════════════════
 *
 * `Pic` draws the product's own images — graded to the canvas, alpha baked in, a known size in the
 * manifest. A user's upload is none of those: an arbitrary colour photograph of unknown shape. So
 * it gets the opposite treatment, and the only one Pulse allows for it: a plain rectangle, radius
 * 2, no border, no frame, no scrim, no caption box, nothing drawn over it.
 *
 * ═══ THE BOX ═══════════════════════════════════════════════════════════════════════════════════
 *
 * `ratio` becomes the element's own `aspect-ratio`, so the height exists before the file does and
 * the upload is cropped to it (`object-fit`). One element: there is no wrapper to give a
 * background, which is how an image ends up sitting in a grey tile.
 *
 * It fills the width it is given — size it with a width class or a grid cell from the call site.
 */
export function UserPhoto({ src, alt, ratio, desaturate = false, fit = 'cover', priority = false, loading, className, feather = false, bleed = false }: UserPhotoProps) {
  return (
    <img
      data-kit="userPhoto"
      src={src}
      alt={alt}
      loading={priority ? 'eager' : (loading ?? 'lazy')}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      draggable={false}
      data-feather={feather || undefined}
      style={feather ? { aspectRatio: ratio, ...FEATHER } : { aspectRatio: ratio }}
      className={cn(
        // `--radius-1` is the scale's 2 px step: "user photos 2" is the one radius an image may have.
        'w-full',
        feather ? 'rounded-none' : 'rounded-[var(--radius-1)]',
        bleed && '-mx-6 w-[calc(100%+3rem)] max-w-none',
        fit === 'cover' ? 'object-cover' : 'object-contain',
        desaturate && 'grayscale',
        className,
      )}
    />
  );
}

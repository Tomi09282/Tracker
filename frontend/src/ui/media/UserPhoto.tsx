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
}

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
export function UserPhoto({ src, alt, ratio, desaturate = false, fit = 'cover', priority = false, loading, className }: UserPhotoProps) {
  return (
    <img
      data-kit="userPhoto"
      src={src}
      alt={alt}
      loading={priority ? 'eager' : (loading ?? 'lazy')}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      draggable={false}
      style={{ aspectRatio: ratio }}
      className={cn(
        // `--radius-1` is the scale's 2 px step: "user photos 2" is the one radius an image may have.
        'w-full rounded-[var(--radius-1)]',
        fit === 'cover' ? 'object-cover' : 'object-contain',
        desaturate && 'grayscale',
        className,
      )}
    />
  );
}

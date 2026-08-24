import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ArrowLeft, MapPin, Calendar, Users, ChevronRight, FileQuestion } from 'lucide-react';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Surface } from '../../ui/primitives/Surface';
import { DocRenderer } from './DocRenderer';
import { usePost, usePriceFormatter } from './usePublic';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { AuroraBackdrop } from '../../ui/shell/AuroraBackdrop';
import { PublicTopBar, InitialsAvatar, VerifiedBadge } from './PublicChrome';

/**
 * One post, addressed by its opaque public id.
 *
 * This is the screen in the whole product a cold visitor is most likely to land on first. They
 * arrive with three questions — what is this, who is behind it, what does it cost — and the layout
 * answers them in that order before the body starts.
 *
 * ═══ THE ANCHOR IS THE POST'S OWN COVER ════════════════════════════════════════════════════════
 *
 * Not a ring and not a chart: a programme or an event is judged on what the room looks like and
 * who is in it. The cover is also content rather than decoration — whoever published it chose it.
 * With no cover the hero is absent entirely and the h1 becomes the anchor; a grey placeholder
 * rectangle is worse than no image at all.
 *
 * NO PLAY OVERLAY. The mockup centres one on the cover and the product has no video player, so it
 * would be a promise broken on the first tap.
 *
 * ═══ THE PRICE IS DISPLAY ONLY, AND THE SCREEN SAYS SO ═════════════════════════════════════════
 *
 * There is no buy button, because there is no purchase path — this phase ships the marketplace as
 * a noticeboard and the coach takes it from there. The mockup's `Jelentkezem` button is therefore
 * not drawn, and the price caption keeps its FULL string: the mockup's shortened version drops
 * "a fizetés még nem az appon keresztül megy", which is exactly the clause that stops a price
 * beside a button from reading as a checkout.
 *
 * ═══ AND THE PAGE OWNS ITS h1 ══════════════════════════════════════════════════════════════════
 *
 * The title is the h1; the body's headings are level 2 and 3 and the parser refuses level 1. A
 * body that could mint an h1 breaks the document outline a screen reader navigates by, on the one
 * screen in the product a stranger is most likely to arrive at cold.
 */
export function PostPage() {
  const { t, i18n } = useTranslation();
  const { publicId } = useParams();
  const { data, isLoading, isError } = usePost(publicId);
  // Above the early returns: the price is read further down, past two of them, and a hook called
  // after a conditional return is called on some renders and not others.
  const formatPrice = usePriceFormatter();

  if (isLoading) return <PostSkeleton />;

  if (isError || !data?.post) {
    // A draft, a removed post and one that never existed are ONE answer here as well as on the
    // server. A "this was removed" message would be an oracle for the existence of removed content.
    return (
      <div className="col-mobile screen-x flex flex-col gap-section py-4">
        <AuroraBackdrop />
        <PublicTopBar backTo="/m" />
        <EmptyState
          icon={FileQuestion}
          title={t('marketplace.postGoneTitle')}
          body={t('marketplace.postGoneBody')}
          heading="h1"
          action={
            <Link
              to="/m"
              className="text-body-s flex min-h-[var(--target-min)] items-center gap-tight text-accent"
            >
              <ArrowLeft className="size-icon-s" aria-hidden />
              {t('marketplace.backToFeed')}
            </Link>
          }
        />
      </div>
    );
  }

  const { post, media } = data;
  const price = formatPrice(post.priceMinor, post.priceCurrency);
  const cover = media.find((m) => m.role === 'cover') ?? media[0];

  return (
    <article className="col-mobile screen-x flex flex-col gap-section py-4">
      <AuroraBackdrop />
      <PublicTopBar backTo="/m" />

      <header className="flex flex-col gap-group">
        {cover ? (
          <img
            // The gated serve, never a static path — and the stored bytes are a re-encoded WebP,
            // so what arrives is what the pipeline made rather than what somebody uploaded.
            src={`/api/v1/public/media/${cover.storageKey}`}
            alt={cover.alt ?? ''}
            width={cover.width}
            height={cover.height}
            loading="lazy"
            className="aspect-video w-full rounded-card object-cover"
          />
        ) : null}

        <div className="flex flex-col gap-tight">
          {/* The time of day is gone from here: a wrapping grey caption row ranking the start
              minute equal with the city is how the reader's real questions got buried. */}
          <span className="text-caption flex flex-wrap items-center gap-tight text-text-3">
            <span className="rounded-chip bg-surface-2 px-2 py-1">
              {t(`marketplace.kind.${post.kind}`, { defaultValue: post.kind })}
            </span>
            {post.city ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-icon-s" aria-hidden />
                {post.city}
              </span>
            ) : null}
            {post.eventAt ? (
              <span className="flex items-center gap-1">
                <Calendar className="size-icon-s" aria-hidden />
                {new Date(post.eventAt * 1000).toLocaleDateString(i18n.language)}
              </span>
            ) : null}
            {post.capacity ? (
              <span className="flex items-center gap-1">
                <Users className="size-icon-s" aria-hidden />
                {t('marketplace.capacity', { count: post.capacity })}
              </span>
            ) : null}
          </span>

          <h1 className="text-display text-text-1">{post.title}</h1>
        </div>

        {/* WHO IS BEHIND IT, as a row you can tap rather than a bare text link. The verified chip
            under the name is the same admin-granted fact the tick carries, said in words for
            anyone who does not know what the glyph means. */}
        <Surface
          as={Link}
          to={`/m/c/${post.coachHandle}`}
          interactive
          className="flex items-center gap-group"
        >
          <InitialsAvatar
            name={post.coachName}
            className="size-14"
            textClassName="text-title-3"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-tight">
            <span className="text-body-strong flex min-w-0 items-center gap-tight text-text-1">
              <span className="truncate">{post.coachName}</span>
              {post.coachVerified === 1 ? <VerifiedBadge /> : null}
            </span>
            {post.coachVerified === 1 ? (
              <span className="text-caption self-start rounded-chip bg-surface-2 px-2 py-1 text-text-3">
                {t('marketplace.verified')}
              </span>
            ) : null}
          </span>
          <ChevronRight className="size-icon-m shrink-0 text-text-3" aria-hidden />
        </Surface>
      </header>

      {/* THE BODY. A closed node tree walked into React elements — no HTML string exists at any
          point between the coach's keyboard and this line. Its list items render as icon-led rows
          rather than bullets, and they do it INSIDE `DocRenderer`: a hand-built markup path in
          this page would be a second sanitiser, and one of two sanitisers is always the weaker. */}
      <DocRenderer doc={post.doc} />

      {price ? (
        <Surface as="section" className="flex flex-col gap-tight text-center">
          <p className="text-title-1 tabular-nums text-text-1">{price}</p>
          {/* SAID PLAINLY, AND IN FULL. There is no purchase path in this phase, and a price
              beside a button that does nothing is worse than a price beside a sentence that tells
              the truth. */}
          <p className="text-caption text-text-3">{t('marketplace.priceNote')}</p>
        </Surface>
      ) : null}

      {media.length > 1 ? (
        <ul className="grid grid-cols-3 gap-tight">
          {media.slice(1).map((m) => (
            <li key={m.storageKey}>
              <img
                src={`/api/v1/public/media/${m.thumbKey}`}
                alt={m.alt ?? ''}
                loading="lazy"
                className="aspect-square w-full rounded-card object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * The loading state, in the NEW geometry: cover, meta, title, coach row, body.
 *
 * The previous skeleton was a title bar and one block, which is not the shape of this screen —
 * and a skeleton that does not match causes exactly the layout shift it exists to prevent.
 */
function PostSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      className="col-mobile screen-x flex flex-col gap-section py-4"
      role="status"
      aria-busy="true"
    >
      <AuroraBackdrop />
      <span className="sr-only">{t('common.loading')}</span>
      <PublicTopBar backTo="/m" />

      <div className="flex flex-col gap-group">
        <Skeleton className="aspect-video w-full rounded-card" />
        <div className="flex flex-col gap-tight">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
        <Skeleton className="h-22 rounded-card" />
      </div>

      <div className="flex flex-col gap-tight">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    </div>
  );
}

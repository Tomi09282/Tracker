import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ArrowLeft, MapPin, Calendar, Users, BadgeCheck, FileQuestion } from 'lucide-react';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { DocRenderer } from './DocRenderer';
import { usePost, usePriceFormatter } from './usePublic';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

/**
 * One post, addressed by its opaque public id.
 *
 * ═══ THE PRICE IS DISPLAY ONLY, AND THE SCREEN SAYS SO ═════════════════════════════════════════
 *
 * There is no buy button, because there is no purchase path — Phase 6 ships the marketplace as a
 * noticeboard and the coach takes it from there. A price with a button that does nothing would be
 * worse than a price with a sentence explaining what happens next, so the sentence is there.
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

  if (isLoading) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-4">
        <Skeleton className="h-8 w-2/3 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }

  if (isError || !data?.post) {
    // A draft, a removed post and one that never existed are ONE answer here as well as on the
    // server. A "this was removed" message would be an oracle for the existence of removed content.
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-4">
        <EmptyState
          icon={FileQuestion}
          title={t('marketplace.postGoneTitle')}
          body={t('marketplace.postGoneBody')}
          heading="h1"
        />
        <Link to="/m" className="text-body-s flex min-h-[var(--target-min)] items-center gap-1 text-accent">
          <ArrowLeft className="size-4" aria-hidden />
          {t('marketplace.backToFeed')}
        </Link>
      </div>
    );
  }

  const { post, media } = data;
  const price = formatPrice(post.priceMinor, post.priceCurrency);
  const cover = media.find((m) => m.role === 'cover') ?? media[0];

  return (
    <article className="col-mobile screen-x flex flex-col gap-4 py-4">
      <Link to="/m" className="text-body-s flex min-h-[var(--target-min)] items-center gap-1 text-accent">
        <ArrowLeft className="size-4" aria-hidden />
        {t('marketplace.backToFeed')}
      </Link>

      {cover ? (
        <img
          // The gated serve, never a static path — and the stored bytes are a re-encoded WebP, so
          // what arrives is what the pipeline made rather than what somebody uploaded.
          src={`/api/v1/public/media/${cover.storageKey}`}
          alt={cover.alt ?? ''}
          width={cover.width}
          height={cover.height}
          loading="lazy"
          className="w-full rounded-card object-cover"
        />
      ) : null}

      <header className="flex flex-col gap-2">
        <span className="text-caption flex flex-wrap items-center gap-2 text-text-3">
          <span className="rounded-chip bg-surface-2 px-1.5">
            {t(`marketplace.kind.${post.kind}`, { defaultValue: post.kind })}
          </span>
          {post.city ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {post.city}
            </span>
          ) : null}
          {post.eventAt ? (
            <span className="flex items-center gap-1">
              <Calendar className="size-3" aria-hidden />
              {new Date(post.eventAt * 1000).toLocaleString(i18n.language)}
            </span>
          ) : null}
          {post.capacity ? (
            <span className="flex items-center gap-1">
              <Users className="size-3" aria-hidden />
              {t('marketplace.capacity', { count: post.capacity })}
            </span>
          ) : null}
        </span>

        <h1 className="text-title-1">{post.title}</h1>

        <Link
          to={`/m/c/${post.coachHandle}`}
          className="text-body-s flex min-h-[var(--target-min)] items-center gap-1.5 text-text-2"
        >
          <span>{post.coachName}</span>
          {post.coachVerified === 1 ? (
            <BadgeCheck className="size-4 text-accent" aria-label={t('marketplace.verified')} />
          ) : null}
        </Link>
      </header>

      {/* THE BODY. A closed node tree walked into React elements — no HTML string exists at any
          point between the coach's keyboard and this line. */}
      <DocRenderer doc={post.doc} />

      {price ? (
        <section className="rounded-card border border-[var(--surface-border)] bg-surface-2 p-4">
          <p className="text-title-3 tabular-nums text-text-1">{price}</p>
          {/* SAID PLAINLY. There is no purchase path in this phase, and a price beside a button
              that does nothing is worse than a price beside a sentence that tells the truth. */}
          <p className="text-caption mt-1 text-text-3">{t('marketplace.priceNote')}</p>
        </section>
      ) : null}

      {media.length > 1 ? (
        <ul className="grid grid-cols-3 gap-2">
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

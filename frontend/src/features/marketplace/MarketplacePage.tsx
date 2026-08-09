import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Search, MapPin, Calendar, BadgeCheck, Compass } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { useFeed, useSearch, useTaxonomy, usePriceFormatter } from './usePublic';
import type { PublicPost } from './usePublic';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

/**
 * The public marketplace: a feed, filters, and a search.
 *
 * ═══ IT WORKS SIGNED OUT, AND THAT IS THE POINT ════════════════════════════════════════════════
 *
 * Every query here goes through `publicGet`, which sends no credentials at all. A shared link
 * opens for somebody who has never heard of the product, and looks the same to them as to a
 * signed-in coach — asserted server-side as byte-identical responses.
 *
 * ═══ WHAT IS NOT HERE ══════════════════════════════════════════════════════════════════════════
 *
 * No like button, no comment count, no follower number, no "trending". Reactions and comments were
 * cut by the adversarial review — all four fatal defects lived there — and the follower count was
 * cut with them because `ORDER BY follower_count DESC` is a ranking anybody can buy at one free
 * registration per follower.
 *
 * What is left ranks on verified-then-recency, which cannot be purchased, and shows a coach's work
 * rather than their popularity. For "here is my 8-week programme, here is when, here is where",
 * nothing is missing.
 */
export function MarketplacePage() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [city, setCity] = useState<string | undefined>(undefined);
  const [kind, setKind] = useState<string | undefined>(undefined);

  const taxonomy = useTaxonomy();
  const feed = useFeed({ kind, city, sort: kind === 'event' ? 'soonest' : 'recent' });
  const search = useSearch(q, city);

  const searching = q.trim().length >= 2;
  const posts = searching ? (search.data?.posts ?? []) : (feed.data?.posts ?? []);
  const loading = searching ? search.isLoading : feed.isLoading;

  return (
    <div className="col-mobile screen-x flex flex-col gap-4 py-4">
      <h1 className="text-title-2">{t('marketplace.title')}</h1>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3"
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('marketplace.searchPlaceholder')}
          aria-label={t('marketplace.searchPlaceholder')}
          className="text-body min-h-[var(--target-min)] w-full rounded-card border border-line bg-surface-2 pl-9 pr-3 text-text-1"
        />
      </div>

      {/* FILTERS ARE CHIPS, NOT A SELECT. Two or three options each, and a chip shows what is
          active without being opened — on the screen most likely to be someone's first. */}
      <div className="flex flex-wrap gap-1">
        <Pressable
          variant={kind === undefined ? 'secondary' : 'ghost'}
          density="compact"
          onClick={() => setKind(undefined)}
        >
          {t('marketplace.allKinds')}
        </Pressable>
        {(taxonomy.data?.kinds ?? []).map((k) => (
          <Pressable
            key={k.key}
            variant={kind === k.key ? 'secondary' : 'ghost'}
            density="compact"
            onClick={() => setKind(kind === k.key ? undefined : k.key)}
          >
            {t(`marketplace.kind.${k.key}`, { defaultValue: k.key })}
          </Pressable>
        ))}
      </div>

      {(taxonomy.data?.cities ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1">
          <Pressable
            variant={city === undefined ? 'secondary' : 'ghost'}
            density="compact"
            onClick={() => setCity(undefined)}
          >
            {t('marketplace.everywhere')}
          </Pressable>
          {(taxonomy.data?.cities ?? []).slice(0, 8).map((c) => (
            <Pressable
              key={c.key}
              variant={city === c.key ? 'secondary' : 'ghost'}
              density="compact"
              onClick={() => setCity(city === c.key ? undefined : c.key)}
            >
              {c.name}
            </Pressable>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={searching ? t('marketplace.noResultsTitle') : t('marketplace.emptyTitle')}
          body={searching ? t('marketplace.noResultsBody') : t('marketplace.emptyBody')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} locale={i18n.language} />
            </li>
          ))}
        </ul>
      )}

      {searching ? (
        // SAID, NOT HIDDEN. Search returns one page and no more, deliberately — a paginated public
        // text search is a scraping API with a nice interface. A reader who hits the cap deserves
        // to know why there is no "more" button rather than assuming there is nothing else.
        <p className="text-caption text-text-3">{t('marketplace.searchCapped')}</p>
      ) : null}
    </div>
  );
}

function PostCard({ post, locale }: { post: PublicPost; locale: string }) {
  const { t } = useTranslation();
  const formatPrice = usePriceFormatter();
  const price = formatPrice(post.priceMinor, post.priceCurrency);

  return (
    <Link
      to={`/m/p/${post.id}`}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-4"
    >
      <span className="text-caption flex items-center gap-2 text-text-3">
        <span className="rounded-chip bg-surface-3 px-1.5">
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
            {new Date(post.eventAt * 1000).toLocaleDateString(locale)}
          </span>
        ) : null}
      </span>

      <span className="text-body font-medium text-text-1">{post.title}</span>
      {/* THE EXCERPT, WHICH THE SERVER DERIVED FROM THE DOCUMENT — so it carries the words a
          reader will see rather than the markdown punctuation an author typed. */}
      <span className="text-body-s line-clamp-2 text-text-2">{post.excerpt}</span>

      <span className="text-caption flex items-center justify-between gap-2 text-text-3">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">{post.coachName}</span>
          {post.coachVerified === 1 ? (
            <BadgeCheck className="size-3.5 shrink-0 text-accent" aria-label={t('marketplace.verified')} />
          ) : null}
        </span>
        {price ? <span className="shrink-0 tabular-nums text-text-2">{price}</span> : null}
      </span>
    </Link>
  );
}

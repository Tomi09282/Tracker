import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { PressableLink } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { UserPhoto } from '../../ui/media/UserPhoto';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useFeed, useSearch, useTaxonomy, usePost, usePriceFormatter } from './usePublic';
import type { PublicPost } from './usePublic';
import { VerifiedBadge, metaLine, postDate } from './PublicChrome';

/**
 * The public marketplace (`/m`, frames marketplace-1 / marketplace-2): the lead post's cover, a
 * search line, the kind filter as words, and the posts as open entries on hairlines.
 *
 * ═══ IT WORKS SIGNED OUT, AND THAT IS THE POINT ════════════════════════════════════════════════
 *
 * Every query here goes through `publicGet`, which sends no credentials at all. A shared link
 * opens for somebody who has never heard of the product, and looks the same to them as to a
 * signed-in coach — asserted server-side as byte-identical responses. So the header never reads
 * the session: `Belépés` is always there and always a plain link to `/login`.
 *
 * ═══ THE LEAD IS ITS COVER ═════════════════════════════════════════════════════════════════════
 *
 * The feed's first post is shown as its cover photograph alone, feathered into the canvas, and the
 * whole picture is one link to the post (its name is the post's title). The frames set the lead's
 * kicker, title, coach and price under the picture; the live screen shows the cover only, and the
 * owner's Q4 answer keeps the live behaviour (PLAN 4.3) — so the caption is not drawn here.
 *
 * The lead is the FEED's lead, never a search hit, and it is sliced out of the list. A lead with no
 * cover has nothing to show at hero size (Pulse draws no placeholder for a missing image), so it
 * joins the list as its first row instead — the post stays one tap away.
 *
 * ═══ WHAT IS NOT HERE ══════════════════════════════════════════════════════════════════════════
 *
 * No like button, no comment count, no follower number, no "trending", no featured pill, no count
 * on a chip (no data backs them), no play disc (there is no video in the product), no clear control
 * on the search line (the screen note's do-not-invent list), and no city row: the API accepts a
 * city, but the screen has no control for it and none is invented here.
 */
export function MarketplacePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string | undefined>(undefined);

  const taxonomy = useTaxonomy();
  const feed = useFeed({ kind, sort: kind === 'event' ? 'soonest' : 'recent' });
  const search = useSearch(q);
  const formatPrice = usePriceFormatter();

  const searching = q.trim().length >= 2;
  const feedPosts = feed.data?.posts ?? [];
  const posts = searching ? (search.data?.posts ?? []) : feedPosts;
  // The hero is always the FEED's lead, never a search hit: it is the marketplace's own shop
  // window, not a result. Below two characters the list is the feed minus that one post.
  const lead = feedPosts[0] ?? null;
  const rest = searching ? posts : feedPosts.slice(1);

  const loading = searching ? search.isLoading : feed.isLoading;
  const errored = searching ? search.isError : feed.isError;

  // The cover lives on the DETAIL response, not on the feed row, so the lead asks for it. One
  // extra public GET on the front door, and it doubles as a prefetch of the likeliest next tap —
  // the query key is the same one `PostPage` reads.
  const leadDetail = usePost(lead?.id);
  const leadCover =
    leadDetail.data?.media.find((m) => m.role === 'cover') ?? leadDetail.data?.media[0];

  // The city is stored as its KEY (`budapest`, `pecs`); the taxonomy holds its native name. While
  // the taxonomy is pending or failed the key is printed, as on the coach profile.
  const cityName = (key: string | null) =>
    key ? (taxonomy.data?.cities.find((c) => c.key === key)?.name ?? key) : null;

  const leadLoading = feed.isLoading || leadDetail.isLoading;
  // A lead without a cover is not drawn at hero size; it heads the list instead (feed only).
  const leadAsRow = !searching && lead !== null && !leadLoading && !leadCover;
  const rows = leadAsRow && lead ? [lead, ...rest] : rest;

  const postRow = (post: PublicPost) => {
    const price = formatPrice(post.priceMinor, post.priceCurrency);
    return (
      <ListRow
        key={post.id}
        to={`/m/p/${post.id}`}
        pad="loose"
        lines={2}
        kickerLead={t(`marketplace.kind.${post.kind}`, { defaultValue: post.kind })}
        kicker={metaLine([cityName(post.city), postDate(post, i18n.language)]) || undefined}
        title={post.title}
        sub={
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{post.coachName}</span>
            {/* marketplace-1: the 14 pt tick in ink, 5 after the name — the name stays the accessible word. */}
            {post.coachVerified === 1 ? <VerifiedBadge className="size-3.5 stroke-[2.5] text-text-1" /> : null}
          </span>
        }
        value={price ?? undefined}
        valueOn="sub"
      />
    );
  };

  return (
    <Screen as="main" top="push">
      <ScreenHeader
        kind="push"
        // History back: a stranger who arrived on `/m` from a shared link has no marketplace to go
        // "up" to, so there is no parent route — the chevron alone, as drawn.
        back={{ onClick: () => navigate(-1), label: t('common.back'), bare: true }}
        title={t('marketplace.title')}
        trailing={
          // A PLAIN LINK, NEVER A SESSION PROBE — and the screen's one lime pill.
          <PressableLink to="/login" variant="primary" size="sm">
            {t('auth.switchToLogin')}
          </PressableLink>
        }
      />

      {leadLoading ? (
        // The cover window's own height (192), so the search line does not move when it lands.
        <Skeleton className="h-48 w-full" />
      ) : lead && leadCover ? (
        <Link
          to={`/m/p/${lead.id}`}
          aria-label={lead.title}
          className="block transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:opacity-[var(--pressed-opacity)]"
        >
          <UserPhoto
            // The gated serve, never a static path — the stored bytes are a re-encoded WebP.
            src={`/api/v1/public/media/${leadCover.storageKey}`}
            alt=""
            ratio={402 / 192}
            priority
            desaturate
            feather
            bleed
          />
        </Link>
      ) : null}

      <div className="flex flex-col">
        <div className="flex flex-col gap-2">
          <Field
            kit="searchField"
            label={t('marketplace.searchPlaceholder')}
            labelHidden
            // A plain text input, not `type="search"`: WebKit would grow its own clear cross, and
            // the screen draws none.
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            leading={<Search />}
            placeholder={t('marketplace.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* Single choice; tapping the chosen kind returns to "Minden". `aria-pressed` is the state. */}
          <ChipRow label={t('compose.kind')} scroll="bleed">
            <Chip selected={kind === undefined} onClick={() => setKind(undefined)}>
              {t('marketplace.allKinds')}
            </Chip>
            {(taxonomy.data?.kinds ?? []).map((k) => (
              <Chip key={k.key} selected={kind === k.key} onClick={() => setKind(kind === k.key ? undefined : k.key)}>
                {t(`marketplace.kind.${k.key}`, { defaultValue: k.key })}
              </Chip>
            ))}
          </ChipRow>
        </div>

        {loading ? (
          <div role="status">
            <span className="sr-only">{t('common.loading')}</span>
            <RowStack as="div">
              {[0, 1, 2].map((i) => (
                <ListRowSkeleton key={i} kicker sub index={i} />
              ))}
            </RowStack>
          </div>
        ) : errored ? (
          // Its own branch, not the empty state: a failed request is not an empty marketplace, and
          // it does not claim an outage either (the offline strip in `Providers` says that).
          <EmptyState
            className="pt-8"
            title={t('marketplace.errorTitle')}
            body={t('marketplace.errorBody')}
            action={
              <TextLink text="body" className="min-w-11" onClick={() => void (searching ? search.refetch() : feed.refetch())}>
                {t('common.retry')}
              </TextLink>
            }
          />
        ) : posts.length === 0 ? (
          <EmptyState
            className="pt-8"
            title={searching ? t('marketplace.noResultsTitle') : t('marketplace.emptyTitle')}
            body={searching ? t('marketplace.noResultsBody') : t('marketplace.emptyBody')}
          />
        ) : rows.length > 0 ? (
          <RowStack close>{rows.map(postRow)}</RowStack>
        ) : null}

        {searching && !loading && !errored ? (
          // SAID, NOT HIDDEN. Search returns one page and no more, deliberately — a paginated
          // public text search is a scraping API with a nice interface.
          <p className="pt-4 text-cap text-text-3">{t('marketplace.searchCapped')}</p>
        ) : null}
      </div>
    </Screen>
  );
}

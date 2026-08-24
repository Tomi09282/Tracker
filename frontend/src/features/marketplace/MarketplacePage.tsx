import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Search, Check, Compass, WifiOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { useFeed, useSearch, useTaxonomy, usePost, usePriceFormatter } from './usePublic';
import type { PublicPost } from './usePublic';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { AuroraBackdrop } from '../../ui/shell/AuroraBackdrop';
import { PublicTopBar, KindTile, VerifiedBadge, kindIcon, metaLine, postDate } from './PublicChrome';

/**
 * The public marketplace: a lead tile, a search, one row of kind chips, and a feed.
 *
 * ═══ IT WORKS SIGNED OUT, AND THAT IS THE POINT ════════════════════════════════════════════════
 *
 * Every query here goes through `publicGet`, which sends no credentials at all. A shared link
 * opens for somebody who has never heard of the product, and looks the same to them as to a
 * signed-in coach — asserted server-side as byte-identical responses.
 *
 * ═══ THE ANCHOR IS INVENTORY SHOWN AS A THING ══════════════════════════════════════════════════
 *
 * An anonymous visitor has no data of their own: there is nothing countable to ring and no trend
 * to plot, so the top third cannot hold a gauge or a chart. What it can hold is the marketplace's
 * own lead item at hero size, with its cover photograph — the one element on this screen that is
 * not a line of text, and the thing that stops the page reading as a search-results list.
 *
 * NO `Kiemelt` PILL AND NO `42` COUNT BADGE. Both are in the mockup and neither has data behind
 * it: `PublicPost` carries no featured flag and `GET /public/taxonomy` returns no per-kind counts.
 * Synthesising the count from the loaded page would put a badge reading "42" over three visible
 * rows — a number the screen cannot back up. So the hero is the feed's first post, said plainly,
 * and it is sliced out of the list below so nothing is drawn twice.
 *
 * NO PLAY BUTTON EITHER. The mockup centres one on the cover, and the product has no video
 * player: a play button that navigates to text is a promise broken on the first tap.
 *
 * ═══ WHAT IS NOT HERE ══════════════════════════════════════════════════════════════════════════
 *
 * No like button, no comment count, no follower number, no "trending". Reactions and comments were
 * cut by the adversarial review — all four fatal defects lived there — and the follower count was
 * cut with them because `ORDER BY follower_count DESC` is a ranking anybody can buy at one free
 * registration per follower.
 *
 * And no city chip row. Two scrolling chip rows pushed the results below the fold on the one
 * screen whose whole job is showing results, and the second row was what made the header read as
 * a filter form. Cutting it bought the hero. The cost is real and is recorded in the screen note:
 * city filtering now has no control at all, and must come back as a secondary filter — never as a
 * second permanent row.
 */
/**
 * The chosen kind chip. EVERY chip keeps its ring — the unselected ones were `ghost`, which has
 * neither fill nor border, so three of the four read as loose words rather than as a control.
 *
 * `bg-accent-subtle` is DESIGN.md §5.6's selected state; `primary` is not available here because
 * `Belépés` is this screen's one filled accent control (and `primary` drags Neon's glow with it).
 * The two `hover:` repeats are load-bearing: `secondary` ships `hover:bg-surface-2`, and `cn` is
 * `twMerge`, which drops the base `bg-*` it has a conflict for but keeps a `hover:` it does not —
 * so without them the selected chip turns neutral grey under the pointer.
 *
 * NO INK CLASS, deliberately. `--on-accent-subtle` IS `--text-1` (tokens.css) — the colour these
 * chips already inherit from `body` — and writing `text-on-accent-subtle` here would collapse the
 * chip's own `text-body-s` under twMerge's single text-* group, rendering the selected chip a size
 * larger than its neighbours. Never `text-accent` on this wash either: DESIGN.md rule 63.
 */
const SELECTED_CHIP = [
  'border-[var(--accent-border)] bg-accent-subtle',
  'hover:border-[var(--accent-border)] hover:bg-accent-subtle',
].join(' ');

export function MarketplacePage() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string | undefined>(undefined);

  const taxonomy = useTaxonomy();
  const feed = useFeed({ kind, sort: kind === 'event' ? 'soonest' : 'recent' });
  const search = useSearch(q);

  const searching = q.trim().length >= 2;
  const feedPosts = feed.data?.posts ?? [];
  const posts = searching ? (search.data?.posts ?? []) : feedPosts;
  // The hero is always the FEED's lead, never a search hit: it is the marketplace's own shop
  // window, not a result. Below two characters the list is the feed minus that one card.
  const lead = feedPosts[0] ?? null;
  const rest = searching ? posts : feedPosts.slice(1);

  const loading = searching ? search.isLoading : feed.isLoading;
  const errored = searching ? search.isError : feed.isError;

  // The cover lives on the DETAIL response, not on the feed row, so the hero asks for it. One
  // extra public GET on the front door, and it doubles as a prefetch of the likeliest next tap —
  // the query key is the same one `PostPage` reads.
  const leadDetail = usePost(lead?.id);
  const leadCover =
    leadDetail.data?.media.find((m) => m.role === 'cover') ?? leadDetail.data?.media[0];

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-4">
      <AuroraBackdrop />
      <PublicTopBar />

      <header className="flex flex-col gap-group">
        <h1 className="text-display text-text-1">{t('marketplace.title')}</h1>

        {feed.isLoading ? (
          // The skeleton carries the hero's OWN band proportion. It used to be `aspect-video` over
          // a tile that also had a caption under it, so the search field and the whole list moved
          // down when the feed landed — the shift a skeleton exists to prevent.
          <Skeleton className="aspect-[5/2] w-full rounded-card" />
        ) : lead ? (
          <FeedHero post={lead} coverKey={leadCover?.storageKey} />
        ) : null}
      </header>

      <div className="flex flex-col gap-group">
        <div className="relative">
          {/* NOT `Field`: `Field` always renders a visible label, and this control has none by
              design — the placeholder names it and the glyph says what it wants. The label is
              carried by `aria-label`, so the field is named for a screen reader without a line of
              chrome above the one control on the screen that must not look like a form. The
              44px inset matches `Field`'s own, so the caret never lands against the magnifier. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 flex w-[var(--target-min)] items-center justify-center text-text-3"
          >
            <Search className="size-icon-m" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('marketplace.searchPlaceholder')}
            aria-label={t('marketplace.searchPlaceholder')}
            className={[
              'text-body min-h-[var(--control-h)] w-full rounded-chip',
              'ps-[var(--target-min)] pe-4',
              'bg-[var(--field-bg)] text-text-1 placeholder:text-text-3',
              'border-[length:var(--border-width)] border-[var(--field-border)]',
              'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
              'outline-none focus-visible:border-accent focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
            ].join(' ')}
          />
        </div>

        {/* ONE SCROLLING ROW, NOT A WRAPPING WALL, and now not two rows either. A chip row
            overflows sideways inside its own container — the page body never scrolls
            horizontally — and the right-edge mask is what says there is more, now that the
            scrollbar is hidden. `[scrollbar-width:none]` with nothing in its place is a row that
            looks finished at whatever the viewport happened to cut it off at.

            `aria-pressed` is the state itself. The check glyph and the fill carry it for anyone
            who can see them; without the attribute a screen-reader user hears the same button
            before and after the tap, which is the filter reading as broken in the other
            modality. */}
        <div className="flex gap-tight overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_calc(100%_-_24px),transparent)] [scrollbar-width:none]">
          <Pressable
            variant="secondary"
            shape="chip"
            density="compact"
            aria-pressed={kind === undefined}
            className={cn('shrink-0', kind === undefined && SELECTED_CHIP)}
            icon={kind === undefined ? <Check className="size-icon-s" aria-hidden /> : undefined}
            onClick={() => setKind(undefined)}
          >
            {t('marketplace.allKinds')}
          </Pressable>
          {(taxonomy.data?.kinds ?? []).map((k) => (
            <Pressable
              key={k.key}
              variant="secondary"
              shape="chip"
              density="compact"
              aria-pressed={kind === k.key}
              className={cn('shrink-0', kind === k.key && SELECTED_CHIP)}
              icon={kind === k.key ? <Check className="size-icon-s" aria-hidden /> : undefined}
              onClick={() => setKind(kind === k.key ? undefined : k.key)}
            >
              {t(`marketplace.kind.${k.key}`, { defaultValue: k.key })}
            </Pressable>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-group">
        {loading ? (
          // ONE BLOCK AT THE CARD'S HEIGHT, not a drawing of its insides. `h-26` is what a card
          // measures — 16px of padding, a caption, a title line and a footer — so the swap moves
          // nothing, which is the only job a skeleton has. (It does NOT sketch the icon tile and
          // the three text rows: a skeleton that mimes the content is a second copy of the card's
          // geometry to keep in step, and it flickers as its own little layout.)
          <>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-26 rounded-card" />
            ))}
          </>
        ) : errored ? (
          // ITS OWN BRANCH, NOT THE EMPTY STATE. A failed fetch used to fall through to "Még nincs
          // itt semmi", which tells a first-time visitor the marketplace is empty when in fact the
          // request failed — the worst possible first impression, and a lie.
          <EmptyState
            icon={WifiOff}
            title={t('offline.title')}
            action={
              <Pressable
                variant="secondary"
                onClick={() => {
                  void (searching ? search.refetch() : feed.refetch());
                }}
              >
                {t('common.retry')}
              </Pressable>
            }
          />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={Compass}
            title={searching ? t('marketplace.noResultsTitle') : t('marketplace.emptyTitle')}
            body={searching ? t('marketplace.noResultsBody') : t('marketplace.emptyBody')}
          />
        ) : rest.length > 0 ? (
          <ul className="flex flex-col gap-group">
            {rest.map((p) => (
              <PostCard key={p.id} post={p} locale={i18n.language} />
            ))}
          </ul>
        ) : null}

        {searching && !loading && !errored ? (
          // SAID, NOT HIDDEN. Search returns one page and no more, deliberately — a paginated
          // public text search is a scraping API with a nice interface. A reader who hits the cap
          // deserves to know why there is no "more" button rather than assuming there is nothing
          // else.
          <p className="text-caption text-text-3">{t('marketplace.searchCapped')}</p>
        ) : null}
      </section>
    </div>
  );
}

/**
 * The lead post at hero size: THE COVER, AND NOTHING ELSE.
 *
 * It carried a caption band — meta line, two-line title, coach and price — and that band was about
 * 140px of the fold spent restating the card the reader is one tap from. The mockup and the
 * Anchor section both make this tile the one element in the top third that is NOT a row of text;
 * a photograph with three text rows bolted under it is a card, not an anchor. The post's identity
 * lives on the list below and on the detail screen the tile links to, so nothing is lost, and the
 * link keeps its name through `aria-label` now that no text sits inside it.
 *
 * A SHORT CINEMATIC BAND (5:2), not a 16:9 block, for the same reason: the tile has to state the
 * marketplace holds real things without eating the search field and the first result.
 *
 * With no cover the tile is the brand gradient carrying the kind glyph. Not a grey placeholder
 * rectangle: an empty box in the top third is worse than no image at all, and the gradient is
 * the one surface per screen the Bible allows.
 *
 * The play disc and the `Kiemelt` pill stay cut, per the screen note's warning: there is no video
 * player behind a play affordance and no featured flag in `PublicPost`.
 */
function FeedHero({ post, coverKey }: { post: PublicPost; coverKey?: string }) {
  const Icon = kindIcon(post.kind);

  return (
    <Surface
      as={Link}
      to={`/m/p/${post.id}`}
      interactive
      pad="none"
      aria-label={post.title}
      className="block overflow-hidden"
    >
      {coverKey ? (
        <img
          // The gated serve, never a static path — and the stored bytes are a re-encoded WebP, so
          // what arrives is what the pipeline made rather than what somebody uploaded.
          src={`/api/v1/public/media/${coverKey}`}
          alt=""
          loading="lazy"
          className="aspect-[5/2] w-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex aspect-[5/2] w-full items-center justify-center"
          style={{ background: 'var(--gradient-brand)' }}
        >
          <Icon className="size-16 text-accent-fg" strokeWidth={1.5} />
        </span>
      )}
    </Surface>
  );
}

/**
 * Three lines and a glyph. WHAT KIND, WHERE, WHEN, WHO, HOW MUCH — readable in one glance.
 *
 * The server-derived excerpt is gone from here. The old card was meta + title + two clamped lines
 * + footer, six of them stacked into a wall of grey, and it is the single biggest reason the
 * previous design read as data fields. The excerpt still exists and still belongs on the detail
 * screen, where a reader has already chosen to read.
 */
function PostCard({ post, locale }: { post: PublicPost; locale: string }) {
  const { t } = useTranslation();
  const formatPrice = usePriceFormatter();
  const price = formatPrice(post.priceMinor, post.priceCurrency);

  return (
    <li>
      <Surface
        as={Link}
        to={`/m/p/${post.id}`}
        interactive
        className="flex items-center gap-group"
      >
        <KindTile kind={post.kind} />

        <span className="flex min-w-0 flex-1 flex-col gap-tight">
          <span className="text-caption text-text-3">
            {metaLine([
              t(`marketplace.kind.${post.kind}`, { defaultValue: post.kind }),
              post.city,
              postDate(post, locale),
            ])}
          </span>

          <span className="text-body-strong line-clamp-2 text-text-1">{post.title}</span>

          {/* ONE SIZE AND ONE INK STEP ABOVE THE META LINE. Who and how much are the card's second
              question, not its last: with the footer at the meta line's `text-caption text-text-3`
              the card read dim / bright / dim, and the price tied for least important with the
              date. The meta line above keeps the dimmest step, which is what this rests on. */}
          <span className="text-body-s flex items-center justify-between gap-tight text-text-2">
            <span className="flex min-w-0 items-center gap-tight">
              <span className="truncate">{post.coachName}</span>
              {post.coachVerified === 1 ? <VerifiedBadge /> : null}
            </span>
            {/* Announcements carry no price, so this footer holds only the coach's name. */}
            {price ? (
              <span className="shrink-0 font-medium tabular-nums text-text-1">{price}</span>
            ) : null}
          </span>
        </span>
      </Surface>
    </li>
  );
}

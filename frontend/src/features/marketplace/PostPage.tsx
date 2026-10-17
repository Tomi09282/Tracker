import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Screen } from '../../ui/shell/Screen';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { Numeral } from '../../ui/data/Numeral';
import { Monogram } from '../../ui/data/Monogram';
import { UserPhoto } from '../../ui/media/UserPhoto';
import { TextLink } from '../../ui/primitives/TextLink';
import { initialsOf } from '../../lib/person';
import { DocRenderer } from './DocRenderer';
import { usePost, usePriceFormatter, useTaxonomy } from './usePublic';
import { PublicTopBar, VerifiedBadge, metaRow } from './PublicChrome';

/**
 * One post, addressed by its opaque public id (post-detail-1 / -2; post-detail-3 is the body's
 * type specimen, drawn by `DocRenderer`).
 *
 * This is the screen in the whole product a cold visitor is most likely to land on first. They
 * arrive with three questions — what is this, who is behind it, what does it cost — and the page
 * answers them in that order: the cover, the kind and the title, the coach row, the body, the
 * price that closes the page.
 *
 * ═══ THE ANCHOR IS THE POST'S OWN COVER ════════════════════════════════════════════════════════
 *
 * A programme or an event is judged on what the room looks like. The cover is content rather than
 * decoration — whoever published it chose it — so it is a `UserPhoto`, 4:3, wider than the column
 * and feathered into the black (the frames' 480 x 360 picture over a 276 pt slot, its top under
 * the top bar). With no cover the slot is absent and the kind line starts 32 under the top bar; a
 * grey placeholder rectangle is worse than no image at all.
 *
 * NO PLAY OVERLAY, AND THAT IS A DECISION RATHER THAN AN OMISSION: the product has no video player,
 * so a disc would open this same page of prose.
 *
 * ═══ THE PRICE IS DISPLAY ONLY, AND THE SCREEN SAYS SO ═════════════════════════════════════════
 *
 * There is no buy button, because there is no purchase path — the marketplace is a noticeboard and
 * the coach takes it from there. The price closes the page as its one big figure (`Numeral num` +
 * the currency on its baseline) and its caption keeps its FULL string: "a fizetés még nem az
 * appon keresztül megy" is exactly the clause that stops a price from reading as a checkout.
 *
 * ═══ AND THE PAGE OWNS ITS h1 ══════════════════════════════════════════════════════════════════
 *
 * The title is the h1; the body's headings are level 2 and 3 and the parser refuses level 1. A
 * body that could mint an h1 breaks the document outline a screen reader navigates by.
 *
 * ═══ PUBLIC: NO SESSION ════════════════════════════════════════════════════════════════════════
 *
 * Nothing here reads the session. `Belépés` is a plain link for everybody (`PublicTopBar`).
 */
export function PostPage() {
  const { t, i18n } = useTranslation();
  const { publicId } = useParams();
  const { data, isLoading, isError } = usePost(publicId);
  // Above the early returns: the price is read further down, past two of them, and a hook called
  // after a conditional return is called on some renders and not others.
  const formatPrice = usePriceFormatter();
  // The same cached query `usePriceFormatter` reads: the city's native name and the currency's
  // minor units. The post's `city` is the KEY (`budapest`, `pecs`), and printing it straight
  // through showed the slug without its accents; the key stays the fallback while the table loads.
  const taxonomy = useTaxonomy();

  if (isLoading) return <PostSkeleton />;

  if (isError || !data?.post) {
    // A draft, a removed post and one that never existed are ONE answer here as well as on the
    // server. A "this was removed" message would be an oracle for the existence of removed content.
    return (
      <Screen top="push" as="main">
        <PublicTopBar backTo="/m" cta="secondary" />
        <EmptyState
          title={t('marketplace.postGoneTitle')}
          body={t('marketplace.postGoneBody')}
          heading="h1"
          action={
            <TextLink to="/m" text="body" lead={<ArrowLeft />}>
              {t('marketplace.backToFeed')}
            </TextLink>
          }
        />
      </Screen>
    );
  }

  const { post, media } = data;
  const price = formatPrice(post.priceMinor, post.priceCurrency);
  const cover = media.find((m) => m.role === 'cover') ?? media[0];
  const verified = post.coachVerified === 1;
  const kind = t(`marketplace.kind.${post.kind}`, { defaultValue: post.kind });
  const cityName = post.city
    ? (taxonomy.data?.cities.find((c) => c.key === post.city)?.name ?? post.city)
    : null;
  const date = post.eventAt ? new Date(post.eventAt * 1000).toLocaleDateString(i18n.language) : null;
  const capacity = post.capacity ? t('marketplace.capacity', { count: post.capacity }) : null;
  // The frames' rule for the facts: any fact with figures (a date, a capacity) is mono meta pinned
  // right, the city included (post-detail-1); a city alone joins the kind as ONE eyebrow line,
  // "PROGRAM · ONLINE" (post-detail-2); nothing — the tag alone (every post of today's editor).
  const figures = Boolean(date || capacity);
  // The numeral and its unit are drawn apart, so the formatted string is split where the currency
  // stands. The same formatter as `formatPrice` (the stored minor units, the reader's locale); the
  // whole string stays what a screen reader hears.
  const priceParts = price ? splitPrice(post.priceMinor, post.priceCurrency, i18n.language, taxonomy.data?.currencies) : null;

  return (
    <Screen top="push" as="main">
      <PublicTopBar backTo="/m" cta="secondary" />

      {cover ? (
        // The 276 pt slot the frames reserve (24,140 354 x 276); the picture is 480 x 360, centred
        // on the screen, its top 44 above the slot — under the top bar — and feathered on every
        // edge, so the column never shows a hard rectangle. The screen clips what passes its edges.
        <div className="relative h-69">
          <UserPhoto
            // The gated serve, never a static path — and the stored bytes are a re-encoded WebP,
            // so what arrives is what the pipeline made rather than what somebody uploaded.
            src={`/api/v1/public/media/${cover.storageKey}`}
            alt={cover.alt ?? ''}
            ratio={4 / 3}
            feather
            desaturate
            priority
            className="absolute -top-11 left-1/2 w-120 max-w-none -translate-x-1/2"
          />
        </div>
      ) : null}

      <header className="flex flex-col gap-4">
        {/* NOT a `SectionHeader`: that renders an h2, and this tag stands BEFORE the page's h1. */}
        {figures ? (
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-eyebrow shrink-0 text-text-2">{kind}</span>
            <span className="text-data flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 text-right text-text-2">
              {metaRow([
                cityName ? <span key="city">{cityName}</span> : null,
                date ? (
                  <span key="date" className="text-text-1">
                    {date}
                  </span>
                ) : null,
                capacity ? <span key="capacity">{capacity}</span> : null,
              ])}
            </span>
          </div>
        ) : (
          <span className="text-eyebrow text-text-2">{cityName ? `${kind} · ${cityName}` : kind}</span>
        )}

        <h1 className="text-display-xl text-pretty text-text-1">{displayTitle(post.title)}</h1>
      </header>

      {/* WHO IS BEHIND IT: one ruled row to the coach's profile. The monogram is decoration (the
          name is printed beside it) and the tick is hidden too — "Ellenőrzött edző" says the same
          fact in words — so the row is read as "Kovács Péter, Ellenőrzött edző". `coachHeadline`
          arrives with the post and is not drawn here: the profile is one tap away. */}
      <RowStack open close>
        <ListRow
          to={`/m/c/${post.coachHandle}`}
          leadSlot
          lead={<Monogram initials={initialsOf(post.coachName)} />}
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{post.coachName}</span>
              {verified ? (
                <span aria-hidden className="flex shrink-0">
                  <VerifiedBadge />
                </span>
              ) : null}
            </span>
          }
          sub={verified ? t('marketplace.verified') : undefined}
          chevron
        />
      </RowStack>

      {/* THE BODY. A closed node tree walked into React elements — no HTML string exists at any
          point between the coach's keyboard and this line. Absent when the post has none, so an
          empty document costs no gap. */}
      {post.doc?.length ? <DocRenderer doc={post.doc} /> : null}

      {price && priceParts ? (
        <section className="flex flex-col gap-4">
          <Rule strong />
          <div className="flex flex-col gap-3">
            <Numeral value={priceParts.value} unit={priceParts.unit} srText={price} className="self-start" />
            {/* SAID PLAINLY, AND IN FULL — see the docblock. */}
            <p className="text-cap text-text-2">{t('marketplace.priceNote')}</p>
          </div>
        </section>
      ) : null}

      {/* The images after the cover. No composer path makes them today, but the API can return
          them, and a reader must not lose what the coach published (behaviour wins, Q4). */}
      {media.length > 1 ? (
        <ul className="grid grid-cols-3 gap-2">
          {media.slice(1).map((m) => (
            <li key={m.storageKey}>
              <UserPhoto src={`/api/v1/public/media/${m.thumbKey}`} alt={m.alt ?? ''} ratio={1} desaturate />
            </li>
          ))}
        </ul>
      ) : null}
    </Screen>
  );
}

/**
 * The title as the frames set it (post-detail-1: "GUGGOLÁS-TECHNIKA / MŰHELY – / OKTÓBER 30.").
 * Two typesetting rules the browser does not apply on its own:
 *   - a dash stays at the END of a line, never at the start of the next (Hungarian and German
 *     typesetting): the space before " – " is made unbreakable, as `ListRow` does for its titles;
 *   - a hyphenated compound is not split at its hyphen ("GUGGOLÁS-" alone on a line): a compound
 *     short enough to fit the column is kept whole. A longer one may still break, so nothing overflows.
 * `text-wrap: pretty` then keeps the last line from being a lone word.
 */
function displayTitle(title: string) {
  return title
    .replace(/ ([–—])/g, '\u00a0$1')
    .split(/(\s+)/)
    .map((word, i) =>
      word.includes('-') && word.length <= 18 ? (
        <span key={i} className="whitespace-nowrap">
          {word}
        </span>
      ) : (
        word
      ),
    );
}

/**
 * The formatted price, split into the figure and the currency (`12 000` + `Ft`, `€` + `12.50`
 * drawn as `12.50` + `€`). The same `Intl` call as `formatPrice` — never a second formatting rule.
 */
function splitPrice(
  minor: number | null,
  currency: string | null,
  locale: string,
  currencies: { code: string; minorUnits: number }[] | undefined,
): { value: string; unit: string } | null {
  const minorUnits = currencies?.find((c) => c.code === currency)?.minorUnits;
  if (minor == null || !currency || minorUnits === undefined) return null;
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(minor / 10 ** minorUnits);
    const unit = parts.filter((p) => p.type === 'currency').map((p) => p.value).join('');
    const value = parts
      .filter((p) => p.type !== 'currency')
      .map((p) => p.value)
      .join('')
      .trim();
    return { value, unit };
  } catch {
    return { value: String(minor / 10 ** minorUnits), unit: currency };
  }
}

/**
 * The loading state, in the page's own geometry: the real top bar, a block for the kind line and
 * for each title line, the coach row between its strong rules, three body lines. No cover block:
 * an image is withheld until it exists, never drawn as a grey square.
 */
function PostSkeleton() {
  const { t } = useTranslation();

  return (
    <Screen top="push" role="status" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <PublicTopBar backTo="/m" cta="secondary" />

      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </div>

      <RowStack open close as="div">
        <ListRowSkeleton sub leadSlot />
      </RowStack>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </Screen>
  );
}

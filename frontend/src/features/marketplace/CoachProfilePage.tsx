import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Screen } from '../../ui/shell/Screen';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { Monogram, MonogramSkeleton } from '../../ui/data/Monogram';
import { TextLink } from '../../ui/primitives/TextLink';
import { initialsOf } from '../../lib/person';
import { DocRenderer, type BlockNode } from './DocRenderer';
import { useCoach, useTaxonomy } from './usePublic';
import type { PublicCoach, PublicPost } from './usePublic';
import { PublicTopBar, VerifiedBadge, postDate } from './PublicChrome';

/**
 * A public coach profile, addressed by HANDLE (coach-profile-1 / -2).
 *
 * ═══ THE ANCHOR IS THE PERSON, DRAWN AS TYPE ═══════════════════════════════════════════════════
 *
 * A stranger arrives here asking one thing — who is this and should I trust them with my training
 * — so the top of the page holds the coach, not a number. A coach has no photo field, so there is
 * no portrait: the textured 176 pt monogram "KP." is the image, with the name locked under it in
 * the display face, its K stem on the gutter under the monogram's K.
 *
 * ═══ NO FOLLOWER COUNT, AND ITS ABSENCE IS A DECISION ══════════════════════════════════════════
 *
 * There is no follower number, no "trending" badge and no rank. `ORDER BY follower_count DESC` is
 * a ranking anybody can buy at one free registration per follower, and a number that can be bought
 * is a number that will be.
 *
 * ═══ AND THE TICK IS ADMIN-GRANTED, WHICH THE SCHEMA ENFORCES ══════════════════════════════════
 *
 * `trg_profile_verified_by_admin_*` refuses a badge granted by a non-admin, and
 * `trg_profile_verified_pair_*` refuses one with no granter recorded at all. So the lime tick of
 * the credential line is not a UI flag somebody could set — it is a database fact.
 *
 * ═══ WHAT THE MOCKUP ONCE ASKED FOR AND THE SCHEMA CANNOT ANSWER ═══════════════════════════════
 *
 * No summary tiles (`12 Év tapasztalat`, `48 Kliens`, `6 Program`) and no `Kapcsolatfelvétel`:
 * `PublicCoach` carries handle, display name, headline, doc, city, verified and published-at, and
 * nothing else, and a self-entered client count beneath an admin-granted tick would borrow its
 * credibility. The Pulse frames draw neither.
 *
 * ═══ PUBLIC: NO SESSION ════════════════════════════════════════════════════════════════════════
 *
 * Nothing here reads the session. `Belépés` is a plain link for everybody (`PublicTopBar`).
 */
export function CoachProfilePage() {
  const { t } = useTranslation();
  const { handle } = useParams();
  const { data, isLoading, isError } = useCoach(handle);

  if (isLoading) return <CoachProfileSkeleton />;

  if (isError || !data?.coach) {
    // An unpublished profile, a removed one and a handle nobody ever took are ONE answer — the
    // same rule the server follows, so the page cannot become an oracle the API refused to be.
    return (
      <Screen top="push" as="main">
        <PublicTopBar backTo="/m" cta="secondary" />
        <EmptyState
          title={t('marketplace.coachGoneTitle')}
          body={t('marketplace.coachGoneBody')}
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

  return (
    <CoachProfileView coach={data.coach} specialties={data.specialties} posts={data.posts} />
  );
}

function CoachProfileView({
  coach,
  specialties,
  posts,
}: {
  coach: PublicCoach;
  specialties: { key: string; i18nKey: string }[];
  posts: PublicPost[];
}) {
  const { t, i18n } = useTranslation();
  const taxonomy = useTaxonomy();

  // `coach.city` is the city KEY — `public_cities.key`, CHECK-constrained to lowercase ASCII — so
  // printing it straight through rendered `budapest`, and `pecs` / `gyor` / `nyiregyhaza` with
  // the Hungarian accents stripped. The taxonomy serves `name_native` beside the key and the query
  // has a one-hour staleTime, so this costs at most one request per session. The key stays as the
  // fallback while that request is in flight: a row that renders empty for a beat is worse than one
  // that renders a slug for a beat. Same lookup `ProfileEditorPage`'s city picker already does.
  const cityName =
    taxonomy.data?.cities.find((c) => c.key === coach.city)?.name ?? coach.city;
  const verified = coach.verified === 1;
  const hasBio = Array.isArray(coach.doc) && coach.doc.length > 0;

  return (
    <Screen top="push" as="main">
      {/* IDENTITY: the top bar and the hero monogram 12 apart (coach-profile-1 "Hero"), then the
          name, the headline and the credential line 24 under the monogram. */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <PublicTopBar backTo="/m" cta="secondary" />
          <Monogram initials={initialsOf(coach.displayName)} size={176} dot className="self-start" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            {/* Placed by INK: the face's side bearing (about 0.047 em at 32) pulled back so the K
                stem stands on the gutter, under the monogram's K. The name still wraps at the
                column (a 120-character name takes several lines). */}
            <h1 className="text-display -ml-0.5 text-text-1">{coach.displayName}</h1>
            {coach.headline ? (
              // The frames wrap the headline in a 300 pt box (a plain greedy wrap: balance would start line 2 with the dot).
              <p className="text-body max-w-75 text-text-2">{coach.headline}</p>
            ) : null}
          </div>

          {/* The credential: the lime tick is the ONE lit mark of the line (the same mark as on
              the post's coach row), its ink on the gutter; the city follows after a dot.
              Unverified: the city alone. Neither: no line. `@handle` is not drawn — it is an
              address, not a credential, and it lives in the URL. */}
          {verified || coach.city ? (
            <p className="text-cap-m flex items-center gap-2">
              {verified ? (
                <span aria-hidden className="-ml-0.5 flex shrink-0">
                  <VerifiedBadge />
                </span>
              ) : null}
              <span>
                {verified ? <span className="text-text-1">{t('marketplace.verified')}</span> : null}
                {coach.city ? (
                  <span className="text-text-2">
                    {verified ? ' · ' : ''}
                    {cityName}
                  </span>
                ) : null}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {/* BODY: the ruled introduction and the posts, 20 apart (not the page's 32). */}
      <div className="flex flex-col gap-5">
        {specialties.length > 0 || hasBio ? (
          <div className="flex flex-col gap-4">
            <Rule strong />
            {specialties.length > 0 ? (
              // Plain labels — they filter nothing — so ONE line of running text: the words in
              // ink, quiet dots between, wrapping like a sentence. Not a list of chips, nothing
              // focusable: a label a screen reader announces as a button that does nothing is
              // worse than a label.
              <p className="text-eyebrow text-text-1">
                {specialties.map((s, i) => (
                  <Fragment key={s.key}>
                    {i > 0 ? (
                      <span aria-hidden className="text-text-3">
                        {' · '}
                      </span>
                    ) : null}
                    {t(s.i18nKey, { defaultValue: s.key })}
                  </Fragment>
                ))}
              </p>
            ) : null}
            {hasBio ? <Bio doc={coach.doc as BlockNode[]} /> : null}
          </div>
        ) : null}

        {/* Head -> content is 16 (the Section), and the first row carries its own 10 pt padding: the
            list is pulled up by that padding, so the kicker stands 16 under the eyebrow as drawn. */}
        <Section title={t('marketplace.theirPosts')}>
          {posts.length === 0 ? (
            <p className="text-cap text-text-2">{t('marketplace.noPostsYet')}</p>
          ) : (
            <RowStack close className="-mt-2.5">
              {posts.map((p) => (
                // The feed's kicker (mono caps, the kind in ink, the date quiet) over the title in
                // up to two lines. No kind glyph, no city, no price, no excerpt: enough to choose
                // from; the excerpt belongs where the post is read.
                <ListRow
                  key={p.id}
                  to={`/m/p/${p.id}`}
                  kickerLead={t(`marketplace.kind.${p.kind}`, { defaultValue: p.kind })}
                  kicker={postDate(p, i18n.language)}
                  title={p.title}
                  lines={2}
                  chevron
                />
              ))}
            </RowStack>
          )}
        </Section>
      </div>
    </Screen>
  );
}

/**
 * The bio, collapsed to the first two lines of its running text, with an expander.
 *
 * COLLAPSED = the first PARAGRAPH, clamped to two lines (coach-profile-1): headings are skipped,
 * not flattened into the clamp. OPEN = the whole document in the bio look (coach-profile-2), with
 * "Kevesebb" 4 under it.
 *
 * A CLAMP, NOT A TRUNCATION. A coach with a long bio keeps every word of it, one tap away.
 *
 * The expander only appears when there is something behind it: the document holds more than that
 * paragraph, or the paragraph itself runs past two lines (measured while collapsed). A `Több`
 * button over a one-line bio is a control that does nothing. A bio with no paragraph at all
 * (headings and lists only) has nothing to clamp, so it shows whole, with no expander.
 */
function Bio({ doc }: { doc: BlockNode[] }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const first = doc.find((b) => b.k === 'p');

  useLayoutEffect(() => {
    const p = ref.current?.querySelector('p');
    if (!p) return;
    // Measured while collapsed, and never re-measured on expand: once it is known to overflow,
    // collapsing it again must offer the same control.
    setOverflows(p.scrollHeight > p.clientHeight + 1);
  }, [doc]);

  if (!first) return <DocRenderer variant="bio" doc={doc} />;

  const more = doc.length > 1 || overflows;

  if (expanded) {
    return (
      <div className="flex flex-col gap-1">
        <DocRenderer variant="bio" doc={doc} />
        <TextLink className="self-start" trail={<ChevronUp />} aria-expanded onClick={() => setExpanded(false)}>
          {t('common.less')}
        </TextLink>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex flex-col">
      <DocRenderer variant="bio" doc={[first]} clamp={2} />
      {more ? (
        <TextLink className="self-start" trail={<ChevronDown />} aria-expanded={false} onClick={() => setExpanded(true)}>
          {t('common.more')}
        </TextLink>
      ) : null}
    </div>
  );
}

/**
 * The loading state, in the page's own geometry: the real top bar, the monogram's ink block, the
 * name and headline lines, the ruled introduction, then the posts head and three kicker rows.
 * Blocks where the text will be; nothing round, nothing spinning.
 */
function CoachProfileSkeleton() {
  const { t } = useTranslation();

  return (
    <Screen top="push" role="status" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <PublicTopBar backTo="/m" cta="secondary" />
          <MonogramSkeleton size={176} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-3 w-44" />
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <Rule strong />
          <Skeleton className="h-4 w-72" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Rule strong />
          <Skeleton className="h-4 w-28" />
          <RowStack as="div">
            {[0, 1, 2].map((i) => (
              <ListRowSkeleton key={i} kicker index={i} />
            ))}
          </RowStack>
        </div>
      </div>
    </Screen>
  );
}

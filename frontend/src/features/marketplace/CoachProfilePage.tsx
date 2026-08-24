import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Bookmark, MapPin, BadgeCheck, UserX } from 'lucide-react';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { DocRenderer } from './DocRenderer';
import { useCoach } from './usePublic';
import type { PublicCoach, PublicPost } from './usePublic';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { AuroraBackdrop } from '../../ui/shell/AuroraBackdrop';
import { PublicTopBar, KindTile, InitialsAvatar, metaLine, postDate } from './PublicChrome';

/**
 * A public coach profile, addressed by HANDLE.
 *
 * ═══ THE ANCHOR IS A FACE, BECAUSE THE QUESTION IS ABOUT A PERSON ══════════════════════════════
 *
 * A stranger arrives here asking one thing — who is this and should I trust them with my training
 * — so the top third holds the coach, not a number. There is nothing countable to ring and no
 * trend to plot on a page about a human.
 *
 * THE RING CARRIES NO VALUE. Everywhere else in this product a ring around something means
 * progress (E16, the daily rings on home and nutrition). Here it is a complete, decorative frame
 * whose only job is to give the verified badge something to sit on — a coach drawn with a
 * three-quarters-full ring reads as a coach who is three-quarters of something, and it must never
 * be wired to a percentage.
 *
 * ═══ NO FOLLOWER COUNT, AND ITS ABSENCE IS A DECISION ══════════════════════════════════════════
 *
 * There is no follower number, no "trending" badge and no rank. `ORDER BY follower_count DESC` is
 * a ranking anybody can buy at one free registration per follower, and a number that can be bought
 * is a number that will be. Following exists — privately, as a saved list on the follower's own
 * screen — and influences nothing anybody sees here.
 *
 * ═══ AND THE BADGE IS ADMIN-GRANTED, WHICH THE SCHEMA ENFORCES ═════════════════════════════════
 *
 * `trg_profile_verified_by_admin_*` refuses a badge granted by a non-admin, and
 * `trg_profile_verified_pair_*` refuses one with no granter recorded at all. So the tick here is
 * not a UI flag somebody could set — it is a database fact with a name attached to it.
 *
 * ═══ WHAT THE MOCKUP ASKS FOR AND THE SCHEMA CANNOT ANSWER ═════════════════════════════════════
 *
 * The three summary tiles (`12 Év tapasztalat`, `48 Kliens`, `6 Program`) are NOT drawn.
 * `PublicCoach` carries handle, display name, headline, doc, city, verified and published-at, and
 * nothing else — all three numbers are new fields, and two of them are claims a coach makes about
 * themselves. A self-entered "48 Kliens" sitting directly beneath an admin-granted verified badge
 * borrows that badge's credibility, and the badge is the one thing on this page the schema
 * actually enforces. Same for `Kapcsolatfelvétel`: the screen has no message path by decision, and
 * a filled primary button with no destination is a dead control on a public route.
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
      <div className="col-mobile screen-x flex flex-col gap-section py-4">
        <AuroraBackdrop />
        <PublicTopBar backTo="/m" />
        <EmptyState
          icon={UserX}
          title={t('marketplace.coachGoneTitle')}
          body={t('marketplace.coachGoneBody')}
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

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-4">
      <AuroraBackdrop />
      <PublicTopBar backTo="/m" />

      <header className="flex flex-col items-center gap-group text-center">
        {/* THE ANCHOR. A decorative frame, never a meter — see the docblock. */}
        <div className="relative">
          <div className="size-36 rounded-chip border-4 border-accent p-1">
            <InitialsAvatar
              name={coach.displayName}
              className="size-full"
              textClassName="text-display"
            />
          </div>
          {coach.verified === 1 ? (
            // On the ring's lower right, sitting in a punched-out hole so it reads as riding on
            // the frame rather than floating over it. It no longer sits inline beside the name:
            // that line is the one a visitor actually reads, and a glyph in it is a speed bump.
            <span className="absolute bottom-0 right-0 grid size-9 place-items-center rounded-chip bg-surface-0">
              <BadgeCheck
                className="size-icon-l fill-accent text-accent-fg"
                aria-label={t('marketplace.verified')}
              />
            </span>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-tight">
          <h1 className="text-display text-text-1">{coach.displayName}</h1>
          {coach.headline ? <p className="text-body text-text-2">{coach.headline}</p> : null}

          {/* `@handle` gave up this slot. A handle is an address, not a credential, and it was
              occupying the one line under the name a visitor reads. It still lives in the URL,
              which is where it is useful. */}
          {coach.verified === 1 || coach.city ? (
            <p className="text-caption flex items-center gap-tight text-text-3">
              {coach.verified === 1 ? <span>{t('marketplace.verified')}</span> : null}
              {coach.verified === 1 && coach.city ? <span aria-hidden>·</span> : null}
              {coach.city ? (
                <span className="flex items-center gap-1">
                  <MapPin className="size-icon-s" aria-hidden />
                  {coach.city}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      {specialties.length > 0 ? (
        // They LOOK like filters and are not — nothing happens on tap, so they are list items
        // rather than controls, and nothing here is focusable. A chip a screen reader announces
        // as a button that does nothing is worse than a label.
        <ul className="flex flex-wrap gap-tight">
          {specialties.map((s) => (
            <li
              key={s.key}
              className="text-body-s rounded-chip border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-2 px-3 py-2 text-text-2"
            >
              {t(s.i18nKey, { defaultValue: s.key })}
            </li>
          ))}
        </ul>
      ) : null}

      <Bio coach={coach} />

      <section className="flex flex-col gap-group">
        <div className="flex items-center gap-tight">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-card bg-[var(--tile-tint)] text-[var(--tile-tint-fg)]"
          >
            <Bookmark className="size-icon-m" strokeWidth={2} />
          </span>
          <h2 className="text-title-1 text-text-1">{t('marketplace.theirPosts')}</h2>
        </div>

        {posts.length === 0 ? (
          <p className="text-caption text-text-3">{t('marketplace.noPostsYet')}</p>
        ) : (
          <ul className="flex flex-col gap-tight">
            {posts.map((p) => (
              <li key={p.id}>
                {/* Kind, date, title. The two-line excerpt is gone for the same reason it is gone
                    from the feed card: it is enough to choose from, and the excerpt belongs where
                    the post is read. */}
                <Surface
                  as={Link}
                  to={`/m/p/${p.id}`}
                  interactive
                  className="flex items-center gap-tight"
                >
                  <KindTile kind={p.kind} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-caption text-text-3">
                      {metaLine([
                        t(`marketplace.kind.${p.kind}`, { defaultValue: p.kind }),
                        postDate(p, i18n.language),
                      ])}
                    </span>
                    <span className="text-body-strong truncate text-text-1">{p.title}</span>
                  </span>
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The bio, clamped to two lines with an expander.
 *
 * It used to run through `DocRenderer` in full — two paragraphs, a subheading, a bullet list, a
 * block quotation and an inline link — and that was the single largest contributor to the "the
 * whole UI is data fields" reading: an introduction rendered as a document. The full renderer
 * still runs on the post detail, where a reader has committed to reading.
 *
 * A CLAMP, NOT A TRUNCATION. A coach with a long bio keeps every word of it, one tap away;
 * silently dropping the rest would be the same defect in a quieter form. `max-h-11` is exactly two
 * lines of `--text-body`'s 22px leading, so the collapsed height is a type decision rather than a
 * guessed pixel.
 *
 * The expander only appears when there is something behind it — measured, not assumed. A `Több`
 * button over a one-line bio is a control that does nothing, which is the affordance defect this
 * design system spends most of its rules on.
 */
function Bio({ coach }: { coach: PublicCoach }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured while collapsed, and never re-measured on expand: once it is known to overflow,
    // collapsing it again must offer the same control.
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [coach.doc]);

  if (!Array.isArray(coach.doc) || coach.doc.length === 0) return null;

  return (
    <div className="flex flex-col gap-tight">
      <div ref={ref} className={expanded ? undefined : 'max-h-11 overflow-hidden'}>
        {/* The same renderer as a post body — one component, so a coach cannot discover that one
            field renders links and the other does not. */}
        <DocRenderer doc={coach.doc} />
      </div>

      {overflows ? (
        <Pressable
          variant="ghost"
          density="compact"
          className="self-start"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t('common.less') : t('common.more')}
        </Pressable>
      ) : null}
    </div>
  );
}

/**
 * The loading state, in the NEW geometry.
 *
 * The previous skeleton was a half-width bar and one block, which is not the shape of this screen
 * at all — and a skeleton that does not match causes exactly the layout shift it exists to
 * prevent. Circle, name, headline, caption, chip row, two bio lines, section heading, three rows.
 */
function CoachProfileSkeleton() {
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

      <div className="flex flex-col items-center gap-group">
        <Skeleton className="size-36 rounded-chip" />
        <div className="flex w-full flex-col items-center gap-tight">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      <div className="flex gap-tight">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-chip" />
        ))}
      </div>

      <div className="flex flex-col gap-tight">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>

      <div className="flex flex-col gap-group">
        <div className="flex items-center gap-tight">
          <Skeleton className="size-11 rounded-card" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="flex flex-col gap-tight">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}

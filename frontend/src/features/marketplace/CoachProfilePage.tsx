import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ArrowLeft, MapPin, BadgeCheck, UserX } from 'lucide-react';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { DocRenderer } from './DocRenderer';
import { useCoach } from './usePublic';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

/**
 * A public coach profile, addressed by HANDLE.
 *
 * ═══ NO FOLLOWER COUNT, AND ITS ABSENCE IS A DECISION ══════════════════════════════════════════
 *
 * There is no follower number, no "trending" badge and no rank. `ORDER BY follower_count DESC` is
 * a ranking anybody can buy at one free registration per follower, and a number that can be bought
 * is a number that will be. Following exists — privately, as a saved list on the follower's own
 * screen — and influences nothing anybody sees here.
 *
 * What is left is the coach's work and whether the product has verified them. Both are things a
 * reader can act on; a follower count is a thing a reader can be misled by.
 *
 * ═══ AND THE BADGE IS ADMIN-GRANTED, WHICH THE SCHEMA ENFORCES ═════════════════════════════════
 *
 * `trg_profile_verified_by_admin_*` refuses a badge granted by a non-admin, and
 * `trg_profile_verified_pair_*` refuses one with no granter recorded at all. So the tick here is
 * not a UI flag somebody could set — it is a database fact with a name attached to it.
 */
export function CoachProfilePage() {
  const { t, i18n } = useTranslation();
  const { handle } = useParams();
  const { data, isLoading, isError } = useCoach(handle);

  if (isLoading) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-4">
        <Skeleton className="h-8 w-1/2 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
    );
  }

  if (isError || !data?.coach) {
    // An unpublished profile, a removed one and a handle nobody ever took are ONE answer — the
    // same rule the server follows, so the page cannot become an oracle the API refused to be.
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-4">
        <EmptyState
          icon={UserX}
          title={t('marketplace.coachGoneTitle')}
          body={t('marketplace.coachGoneBody')}
          heading="h1"
        />
        <Link to="/m" className="text-body-s flex min-h-[var(--target-min)] items-center gap-1 text-accent">
          <ArrowLeft className="size-4" aria-hidden />
          {t('marketplace.backToFeed')}
        </Link>
      </div>
    );
  }

  const { coach, specialties, posts } = data;

  return (
    <div className="col-mobile screen-x flex flex-col gap-4 py-4">
      <Link to="/m" className="text-body-s flex min-h-[var(--target-min)] items-center gap-1 text-accent">
        <ArrowLeft className="size-4" aria-hidden />
        {t('marketplace.backToFeed')}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 flex items-center gap-2">
          {coach.displayName}
          {coach.verified === 1 ? (
            <BadgeCheck className="size-5 shrink-0 text-accent" aria-label={t('marketplace.verified')} />
          ) : null}
        </h1>
        {coach.headline ? <p className="text-body text-text-2">{coach.headline}</p> : null}
        <span className="text-caption flex items-center gap-2 text-text-3">
          <span>@{coach.handle}</span>
          {coach.city ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {coach.city}
            </span>
          ) : null}
        </span>
      </header>

      {specialties.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {specialties.map((s) => (
            <li key={s.key} className="text-caption rounded-chip bg-surface-2 px-2 py-1 text-text-2">
              {t(s.i18nKey, { defaultValue: s.key })}
            </li>
          ))}
        </ul>
      ) : null}

      {/* The bio, through the same renderer as a post body — one component, so a coach cannot
          discover that one field renders links and the other does not. */}
      <DocRenderer doc={coach.doc} />

      <section className="flex flex-col gap-2">
        <h2 className="text-label text-text-2">{t('marketplace.theirPosts')}</h2>
        {posts.length === 0 ? (
          <p className="text-caption text-text-3">{t('marketplace.noPostsYet')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {posts.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/m/p/${p.id}`}
                  className="flex flex-col gap-1 rounded-card border border-line bg-surface-2 p-3"
                >
                  <span className="text-caption text-text-3">
                    {t(`marketplace.kind.${p.kind}`, { defaultValue: p.kind })}
                    {p.eventAt
                      ? ` · ${new Date(p.eventAt * 1000).toLocaleDateString(i18n.language)}`
                      : ''}
                  </span>
                  <span className="text-body truncate text-text-1">{p.title}</span>
                  <span className="text-body-s line-clamp-2 text-text-2">{p.excerpt}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

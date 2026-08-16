import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FileText, Plus, Globe, EyeOff, ShieldCheck, Clock, UserPlus } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import {
  useComposeContext,
  useComposePosts,
  useAcceptGuidelines,
  useSetProfilePublished,
  conflictOf,
  type PostState,
} from './useCompose';

/**
 * The coach's marketplace desk.
 *
 * ═══ THE LADDER IS THE SERVER'S, NOT THIS SCREEN'S ═════════════════════════════════════════════
 *
 * Publishing has four preconditions — a live account with the coach role, an accepted current
 * guidelines version, an account old enough, and a published profile — and every one of them is
 * enforced by a database trigger. This screen does NOT re-implement that logic; it reads the flags
 * the context endpoint already computed in one statement and renders the first unmet step.
 *
 * Re-deriving them here would be the second copy of a rule, and the copy would be the one that is
 * wrong: a coach staring at an enabled Publish button that the server refuses.
 */
export function ComposePage() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<PostState>('all');
  const ctx = useComposeContext();
  const posts = useComposePosts(state);
  const accept = useAcceptGuidelines();
  const setLive = useSetProfilePublished();

  if (ctx.isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-6">
        <Skeleton className="h-8 w-1/2 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }

  if (ctx.isError || !ctx.data) {
    return (
      <div className="col-mobile screen-x py-6">
        <EmptyState icon={FileText} title={t('compose.unavailableTitle')} body={t('compose.unavailableBody')} heading="h1" />
      </div>
    );
  }

  const { profile, profileRemoved, standing, quotas, limits } = ctx.data;
  const slotsLeft = Math.max(0, quotas.postPublishDailyMax - quotas.publishedToday);

  /** The FIRST unmet precondition, in the order the server checks them. */
  const blocker = (() => {
    if (!standing.roleOk || !standing.enabled) return 'account' as const;
    if (standing.guidelinesAcceptedAt === null) return 'guidelines' as const;
    if (!standing.oldEnough) return 'age' as const;
    if (!profile) return 'profile' as const;
    if (profile.publishedAt === null) return 'publish' as const;
    return null;
  })();

  return (
    <div className="col-mobile screen-x flex flex-col gap-8 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-1">{t('compose.title')}</h1>
        <p className="text-body-s text-text-2">{t('compose.subtitle')}</p>
      </header>

      {/* ── the ladder ──────────────────────────────────────────────────────────────────────── */}
      {profileRemoved ? (
        // A moderator's removal is NOT the same as having no profile, and inviting the coach to
        // "create one" after a takedown would send them at a handle they can no longer claim.
        <section className="rounded-card border border-danger-border bg-danger-subtle p-4">
          <h2 className="text-title-3 text-text-1">{t('compose.removedTitle')}</h2>
          <p className="text-body-s mt-1 text-text-2">{t('compose.removedBody')}</p>
        </section>
      ) : blocker === 'guidelines' ? (
        <section className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
          <h2 className="text-title-3 flex items-center gap-2 text-text-1">
            <ShieldCheck className="size-icon-s shrink-0 text-accent" aria-hidden />
            {t('compose.guidelinesTitle')}
          </h2>
          <p className="text-body-s mt-1 text-text-2">
            {t(standing.activeGuidelinesI18nKey, { defaultValue: t('compose.guidelinesBody') })}
          </p>
          <Pressable
            variant="primary"
            className="mt-3"
            busy={accept.isPending}
            onClick={() => accept.mutate(standing.activeGuidelinesVersion)}
          >
            {t('compose.guidelinesAccept', { version: standing.activeGuidelinesVersion })}
          </Pressable>
        </section>
      ) : blocker === 'age' ? (
        <section className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
          <h2 className="text-title-3 flex items-center gap-2 text-text-1">
            <Clock className="size-icon-s shrink-0 text-text-3" aria-hidden />
            {t('compose.tooNewTitle')}
          </h2>
          {/* WHEN, not "later". A limit a person can plan around is a limit; one they cannot is a wall. */}
          <p className="text-body-s mt-1 text-text-2">
            {t('compose.tooNewBody', {
              when: new Date(standing.eligibleAt * 1000).toLocaleString(i18n.language),
            })}
          </p>
        </section>
      ) : blocker === 'profile' ? (
        <section className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
          <h2 className="text-title-3 flex items-center gap-2 text-text-1">
            <UserPlus className="size-icon-s shrink-0 text-accent" aria-hidden />
            {t('compose.noProfileTitle')}
          </h2>
          <p className="text-body-s mt-1 text-text-2">{t('compose.noProfileBody')}</p>
          <Link
            to="/compose/profile"
            className="text-body-s mt-4 inline-flex min-h-[var(--target-min)] items-center gap-2 rounded-button bg-accent px-4 text-accent-fg transition-[transform,background-color,border-color,color] duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:scale-[0.97] hover:bg-accent-hover active:bg-accent-pressed"
          >
            {t('compose.createProfile')}
          </Link>
        </section>
      ) : null}

      {/* ── the profile card ────────────────────────────────────────────────────────────────── */}
      {profile ? (
        <section className="flex flex-col gap-4 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-body truncate text-text-1">{profile.displayName}</h2>
              <p className="text-caption truncate text-text-3">@{profile.handle}</p>
            </div>
            <span
              className={`text-caption flex shrink-0 items-center gap-1 rounded-chip px-2 py-1 ${
                profile.publishedAt !== null ? 'bg-success-subtle text-success' : 'bg-surface-2 text-text-2'
              }`}
            >
              {profile.publishedAt !== null ? (
                <Globe className="size-icon-s" aria-hidden />
              ) : (
                <EyeOff className="size-icon-s" aria-hidden />
              )}
              {profile.publishedAt !== null ? t('compose.live') : t('compose.hidden')}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/compose/profile"
              className="text-body-s inline-flex min-h-[var(--target-min)] items-center rounded-button border border-[var(--surface-border)] bg-surface-1 px-4 text-text-1 transition-[transform,background-color,border-color,color] duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:scale-[0.97] hover:bg-surface-2"
            >
              {t('compose.editProfile')}
            </Link>
            <Pressable
              variant="secondary"
              busy={setLive.isPending}
              onClick={() => setLive.mutate(profile.publishedAt === null)}
            >
              {profile.publishedAt === null ? t('compose.publishProfile') : t('compose.unpublishProfile')}
            </Pressable>
          </div>

          {/* Unpublishing takes the whole back catalogue dark, because a public post needs a live
              profile. The server counts them; this says so rather than letting it be a surprise. */}
          {setLive.data && typeof setLive.data.postsWentDark === 'number' && setLive.data.postsWentDark > 0 ? (
            <p className="text-caption text-text-2" role="status">
              {t('compose.wentDark', { count: setLive.data.postsWentDark })}
            </p>
          ) : null}

          {conflictOf(setLive.error) ? (
            <p className="text-caption text-danger" role="alert">
              {t(`compose.reason.${conflictOf(setLive.error)?.reason}`, {
                defaultValue: t('compose.reason.generic'),
              })}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── posts ──────────────────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-title-3">{t('compose.posts')}</h2>
          <Link
            to="/compose/posts/new"
            className="text-body-s inline-flex min-h-[var(--target-min)] items-center gap-2 rounded-button bg-accent px-4 text-accent-fg transition-[transform,background-color,border-color,color] duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:scale-[0.97] hover:bg-accent-hover active:bg-accent-pressed"
          >
            <Plus className="size-icon-s" aria-hidden />
            {t('compose.newPost')}
          </Link>
        </div>

        <p className="text-caption text-text-3">
          {t('compose.slots', { left: slotsLeft, max: quotas.postPublishDailyMax })}
        </p>

        <ul className="flex flex-wrap gap-2">
          {(['all', 'draft', 'live', 'withdrawn', 'removed'] as const).map((s) => (
            <li key={s}>
              <Pressable
                variant={state === s ? 'primary' : 'secondary'}
                density="compact"
                aria-pressed={state === s}
                onClick={() => setState(s)}
              >
                {t(`compose.state.${s}`)}
              </Pressable>
            </li>
          ))}
        </ul>

        {posts.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 rounded-card" />
            ))}
          </div>
        ) : posts.data && posts.data.posts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {posts.data.posts.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/compose/posts/${p.id}`}
                  className="flex flex-col gap-1 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-2"
                >
                  <span className="text-caption flex items-center gap-2 text-text-3">
                    <span>{t(`marketplace.kind.${p.kind}`, { defaultValue: p.kind })}</span>
                    <span>·</span>
                    <span>
                      {p.removedAt !== null
                        ? t('compose.state.removed')
                        : p.deletedAt !== null
                          ? t('compose.state.withdrawn')
                          : p.publishedAt !== null
                            ? t('compose.state.live')
                            : t('compose.state.draft')}
                    </span>
                  </span>
                  <span className="text-body truncate text-text-1">{p.title}</span>
                  <span className="text-body-s line-clamp-2 text-text-2">{p.excerpt}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title={t('compose.noPostsTitle')}
            body={t('compose.noPostsBody')}
          />
        )}
      </section>

      {/* The character bounds the editor enforces come from the server, so this line cannot claim
          a limit the validator does not hold. */}
      <p className="text-micro text-text-3">
        {t('compose.limitsNote', { title: limits.titleMax, body: limits.bodyMax })}
      </p>
    </div>
  );
}

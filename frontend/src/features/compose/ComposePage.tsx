import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  FileText,
  Plus,
  Globe,
  EyeOff,
  ShieldCheck,
  Clock,
  UserPlus,
  Check,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Surface } from '../../ui/primitives/Surface';
import { Pressable } from '../../ui/primitives/Pressable';
import { control } from '../../ui/primitives/control';
import { Gauge } from '../../ui/feedback/Gauge';
import { CountUp } from '../../ui/feedback/CountUp';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { kindIcon } from './kindIcons';
import { initialsOf } from '../../lib/person';
import {
  useComposeContext,
  useComposePosts,
  useAcceptGuidelines,
  useSetProfilePublished,
  conflictOf,
  type ComposePost,
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
 *
 * ═══ AND THE ANCHOR IS AN INVENTORY, NOT A TREND ═══════════════════════════════════════════════
 *
 * The thing this screen is about is a countable set whose whole meaning is the split between its
 * parts, so the top third is a four-arc donut with the total in the middle. A line would be wrong
 * (nobody's publishing history is a trend) and a progress ring would be wrong (there is no goal to
 * fill). `Gauge` already draws both shapes, so this is `segments`, not a new SVG.
 */

/** The four states, in the order the legend and the donut both read them. */
const STATES = ['live', 'draft', 'withdrawn', 'removed'] as const;
type PostStateKey = (typeof STATES)[number];

/**
 * One arc colour per state, and the legend reads the same map.
 *
 * ═══ ALL FOUR ARE NAMED ════════════════════════════════════════════════════════════════════════
 *
 * The mockup draws four arcs and labels three. An unlabelled arc is a chart refusing to explain
 * itself: whatever is inside the total has to be in the legend, so `Eltávolított` is here even
 * though it is usually zero.
 *
 * ═══ AND A POST STATE IS AN INVENTORY BUCKET, NOT AN ALARM ═════════════════════════════════════
 *
 * Only `live` spends the accent; the rest step DOWN in ink instead of reaching for a hue. A coach
 * who took their own post down has not done anything wrong, and `--danger` is destructive and
 * irreversible only, `--warning` is "look at this" (DESIGN.md §1.4) — an amber-and-red donut told
 * a coach their own shelf was on fire. `draft` starts at `--text-2` (0.70) rather than `--text-3`
 * so the three greys stay separable all the way down to `--surface-border-strong` (0.22). Same
 * reasoning as `CoachDashboard`'s TEAM_COLORS and `PlanListPage`'s SEGMENT_FILL.
 */
const ARC_COLOR: Record<PostStateKey, string> = {
  live: 'var(--accent)',
  draft: 'var(--text-2)',
  withdrawn: 'var(--text-3)',
  removed: 'var(--surface-border-strong)',
};

/**
 * Five filter chips became three.
 *
 * `Levett` and `Eltávolított` sit behind the overflow because the donut legend already carries
 * every count — a badge on a chip would be the same number a second time, and a five-chip row is
 * the whole width of a phone spent on a control most coaches press twice.
 */
const PRIMARY_FILTERS: readonly PostState[] = ['all', 'draft', 'live'];
const ALL_FILTERS: readonly PostState[] = ['all', 'draft', 'live', 'withdrawn', 'removed'];

/**
 * The chosen filter chip. It used to be `variant="primary"`, which put a second filled accent
 * control 8px under `+ Új bejegyzés` — and the mockup spends the screen's one accent fill on that
 * button alone. `bg-accent-subtle` is DESIGN.md §5.6's selected state, so the row now reads in
 * three tiers: chosen wash > outlined chip > the `Több` ghost.
 *
 * The two `hover:` repeats are load-bearing — `secondary` ships `hover:bg-surface-2` and `cn` is
 * `twMerge`, which keeps a `hover:` it has no conflict for, so without them the chosen chip turns
 * grey under the pointer. No ink class on purpose: `--on-accent-subtle` IS `--text-1`, the colour
 * the chip already inherits, and any `text-*` written here would collapse the chip's own
 * `text-body-s` — twMerge holds size and colour in one group. Never `text-accent` on this wash
 * (DESIGN.md rule 63).
 */
const SELECTED_CHIP = [
  'border-[var(--accent-border)] bg-accent-subtle',
  'hover:border-[var(--accent-border)] hover:bg-accent-subtle',
].join(' ');

/** The same derivation the row caption uses, so the donut and the list can never disagree. */
function stateOf(p: ComposePost): PostStateKey {
  if (p.removedAt !== null) return 'removed';
  if (p.deletedAt !== null) return 'withdrawn';
  if (p.publishedAt !== null) return 'live';
  return 'draft';
}

export function ComposePage() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<PostState>('all');
  const [moreFilters, setMoreFilters] = useState(false);
  const [profileSheet, setProfileSheet] = useState(false);
  const ctx = useComposeContext();
  const posts = useComposePosts(state);
  // The donut always describes the WHOLE desk, not the filtered view — a chart that changed shape
  // when a chip was pressed would be answering a different question from the one it is asked.
  // When the filter is already `all` this is the same cached query, not a second request.
  const inventory = useComposePosts('all');
  const accept = useAcceptGuidelines();
  const setLive = useSetProfilePublished();

  const counts = useMemo(() => {
    const rows = inventory.data?.posts ?? [];
    const tally: Record<PostStateKey, number> = { live: 0, draft: 0, withdrawn: 0, removed: 0 };
    for (const p of rows) tally[stateOf(p)] += 1;
    return { tally, total: rows.length };
  }, [inventory.data]);

  if (ctx.isPending) {
    // Three shapes at the NEW geometry: identity row, portfolio card, list. A skeleton that does
    // not match what arrives is the layout shift it was supposed to prevent.
    return (
      <div className="col-mobile screen-x flex flex-col gap-section py-6">
        {/* The same header GROUP the loaded screen draws — identity, title and card a group-gap
            apart, one section-gap from the list. The skeleton's gaps are half its job: at
            `gap-section` throughout it was 64px shorter than what arrived. */}
        <div className="flex flex-col gap-group">
          <div className="flex items-center gap-tight">
            <Skeleton className="size-11 rounded-chip" />
            <Skeleton className="h-8 flex-1 rounded-card" />
          </div>
          <Skeleton className="h-8 w-2/3 rounded-card" />
          {/* The portfolio card's real height, recomputed from the stack it stands in: 16 card pad
              + 160 gauge + 16 + 48 legend (four entries wrap to two lines) + 16 + 32 quota caption
              and bar + 16 card pad. A skeleton taller than what arrives is the same layout shift as
              one that is shorter. */}
          <Skeleton className="h-[304px] rounded-card" />
        </div>
        <div className="flex flex-col gap-tight">
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
        </div>
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

  const { profile, profileRemoved, standing, quotas } = ctx.data;
  const slotsLeft = Math.max(0, quotas.postPublishDailyMax - quotas.publishedToday);
  const quotaFill =
    quotas.postPublishDailyMax > 0
      ? Math.min(1, quotas.publishedToday / quotas.postPublishDailyMax)
      : 0;
  const isLive = profile !== null && profile.publishedAt !== null;

  /** The FIRST unmet precondition, in the order the server checks them. */
  const blocker = (() => {
    if (!standing.roleOk || !standing.enabled) return 'account' as const;
    if (standing.guidelinesAcceptedAt === null) return 'guidelines' as const;
    if (!standing.oldEnough) return 'age' as const;
    if (!profile) return 'profile' as const;
    if (profile.publishedAt === null) return 'publish' as const;
    return null;
  })();

  const setLiveConflict = conflictOf(setLive.error);

  /**
   * A ladder card on screen means the coach has ONE thing to do next, and it is not writing.
   *
   * `publish` is excluded on purpose: at that rung the ladder draws no card and no CTA, so nothing
   * is competing and `+ Új bejegyzés` keeps the fill. At every other rung the gate's own button is
   * the accent, and drafting stays reachable as a secondary — DESIGN.md §5.1, two primaries on a
   * screen means neither is. The demotion goes on THIS button rather than on the gate CTA: a gate
   * card whose only action is outlined stops reading as the thing to resolve.
   */
  const blocked = blocker !== null && blocker !== 'publish';

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      {/* ── the header group ─────────────────────────────────────────────────────────────────
          Identity, title and the portfolio card are ONE group a group-gap apart, not four blocks a
          section-gap apart. At `gap-section` throughout, the first post row started ~600px down and
          the second was already clipped on an 852px viewport — on a screen whose scroll affordance
          is supposed to BE the half-visible third row. The ~48px this returns is what the mandated
          fourth legend entry took when the legend wrapped to two lines; it is not bought back by
          shrinking the gauge again or by dropping that entry. */}
      <div className="flex flex-col gap-group">
        {/* ── identity row ─────────────────────────────────────────────────────────────────────
            The profile card, collapsed to one line. Two full-width buttons for operations performed
            a handful of times a year were the loudest thing on a screen whose subject is posts — so
            they moved behind the pill, and the pill is a REAL control, not a badge. */}
        {profile ? (
          <div className="flex items-center gap-tight">
            <span
              aria-hidden
              className="text-body-s inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-accent-subtle font-display text-accent"
            >
              {initialsOf(profile.displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body truncate text-text-1">{profile.displayName}</p>
              <p className="text-caption truncate text-text-3">@{profile.handle}</p>
            </div>
            <Pressable
              shape="chip"
              density="compact"
              aria-haspopup="dialog"
              onClick={() => setProfileSheet(true)}
              // The hover half is load-bearing, exactly as it is on SELECTED_CHIP above: `secondary`
              // ships `hover:border-*` and `hover:bg-surface-2`, and `cn` is twMerge, which drops a
              // base class it has a conflict for but KEEPS a `hover:` it does not — so without the
              // repeats the live pill lost its tint under the pointer and read as "you are about to
              // turn this off" on a control that merely opens a sheet.
              className={cn(
                'shrink-0',
                isLive &&
                  'border-[var(--success-border)] bg-success-subtle text-success hover:border-[var(--success-border)] hover:bg-success-subtle',
              )}
              icon={
                isLive ? (
                  <Globe className="size-icon-s" aria-hidden />
                ) : (
                  <EyeOff className="size-icon-s" aria-hidden />
                )
              }
            >
              {isLive ? t('compose.live') : t('compose.hidden')}
            </Pressable>
          </div>
        ) : null}

        <h1 className="text-title-1">{t('compose.title')}</h1>

        {/* ── the ladder — at most one card, and only when something is unmet ───────────────────── */}
        {profileRemoved ? (
          // A moderator's removal is NOT the same as having no profile, and inviting the coach to
          // "create one" after a takedown would send them at a handle they can no longer claim.
          <Surface as="section" className="border-[var(--danger-border)] bg-danger-subtle">
            <h2 className="text-title-3 text-text-1">{t('compose.removedTitle')}</h2>
            <p className="text-body-s mt-1 text-text-2">{t('compose.removedBody')}</p>
          </Surface>
        ) : blocker === 'guidelines' ? (
          <Surface as="section" className="flex flex-col gap-tight">
            <h2 className="text-title-3 flex items-center gap-tight text-text-1">
              <ShieldCheck className="size-icon-m shrink-0 text-accent" aria-hidden />
              {t('compose.guidelinesTitle')}
            </h2>
            <p className="text-body-s text-text-2">
              {t(standing.activeGuidelinesI18nKey, { defaultValue: t('compose.guidelinesBody') })}
            </p>
            <Pressable
              variant="primary"
              className="mt-2 self-start"
              busy={accept.isPending}
              onClick={() => accept.mutate(standing.activeGuidelinesVersion)}
            >
              {t('compose.guidelinesAccept', { version: standing.activeGuidelinesVersion })}
            </Pressable>
          </Surface>
        ) : blocker === 'age' ? (
          <Surface as="section" className="flex flex-col gap-tight">
            <h2 className="text-title-3 flex items-center gap-tight text-text-1">
              <Clock className="size-icon-m shrink-0 text-text-3" aria-hidden />
              {t('compose.tooNewTitle')}
            </h2>
            {/* WHEN, not "later". A limit a person can plan around is a limit; one they cannot is a wall. */}
            <p className="text-body-s text-text-2">
              {t('compose.tooNewBody', {
                when: new Date(standing.eligibleAt * 1000).toLocaleString(i18n.language),
              })}
            </p>
          </Surface>
        ) : blocker === 'profile' ? (
          <Surface as="section" className="flex flex-col gap-tight">
            <h2 className="text-title-3 flex items-center gap-tight text-text-1">
              <UserPlus className="size-icon-m shrink-0 text-accent" aria-hidden />
              {t('compose.noProfileTitle')}
            </h2>
            <p className="text-body-s text-text-2">{t('compose.noProfileBody')}</p>
            <Link to="/compose/profile" className={cn(control({ variant: 'primary' }), 'mt-2 self-start')}>
              {t('compose.createProfile')}
            </Link>
          </Surface>
        ) : null}

        {/* ── the anchor: inventory and quota in ONE card ───────────────────────────────────────
            They answer the same question — what can still go out today — so splitting them into two
            cards would make the coach read two places for one answer. */}
        <Surface as="section" className="flex flex-col items-center gap-group">
          {/* 160px, not 224. The donut is the anchor, not the screen: at `size-56` the card ran to
              ~370px and pushed the first post row below the fold, on a screen whose stated premise
              is that both of the coach's questions — what is out there, what can still go out today
              — are answered above it. `thickness` 0.25 puts the band at ~13% of the diameter, which
              is the "thick-ringed donut" the note asks for; 0.18 measured 9% and read as a hoop. */}
          <Gauge
            className="size-40"
            label={t('compose.posts')}
            thickness={0.25}
            segments={
              counts.total > 0
                ? STATES.map((key) => ({
                    value: counts.tally[key] / counts.total,
                    color: ARC_COLOR[key],
                    label: t(`compose.state.${key}`),
                  }))
                : []
            }
          >
            <span className="flex flex-col items-center">
              <span className="text-display font-display tabular-nums text-text-1">
                <CountUp to={counts.total} />
              </span>
              {/* THE UNIT, not the section heading. `Bejegyzések` here read "18 / Bejegyzések" in
                  the anchor and then repeated itself as the h2 forty pixels below — and a Hungarian
                  count takes the singular, so the plural was also wrong grammar. The h2 and the
                  Gauge's accessible name keep `compose.posts`, where the plural is right. */}
              <span className="text-body-s text-text-2">{t('compose.postsUnit')}</span>
            </span>
          </Gauge>

          <ul className="flex flex-wrap items-center justify-center gap-group">
            {STATES.map((key) => (
              <li key={key} className="text-caption flex items-center gap-tight text-text-2">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-chip"
                  style={{ backgroundColor: ARC_COLOR[key] }}
                />
                {t(`compose.state.${key}`)}
                <span className="tabular-nums text-text-1">{counts.tally[key]}</span>
              </li>
            ))}
          </ul>

          <div className="flex w-full flex-col gap-tight">
            <p className="text-body-s text-text-2">
              {t('compose.slots', { left: slotsLeft, max: quotas.postPublishDailyMax })}
            </p>
            {/* A BAR, not a second ring: the quota is a secondary fact and must not compete with
                the donut it sits under. */}
            <div className="h-1.5 w-full overflow-hidden rounded-chip bg-surface-2">
              <div
                className={cn(
                  'h-full rounded-chip transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-standard)]',
                  slotsLeft === 0 ? 'bg-warning' : 'bg-accent',
                )}
                style={{ width: `${quotaFill * 100}%` }}
              />
            </div>
          </div>
        </Surface>
      </div>

      {/* ── posts ────────────────────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-group">
        <div className="flex items-center gap-tight">
          {/* A rounded SQUARE, not a circle: `--radius-chip` is `--radius-full` in four of five
              packs, so this rendered as a 44px disc. The one circle on this screen is the `KP`
              monogram in the identity row, and that is what makes it read as a person rather than
              as another kind tile. `rounded-card` and not `rounded-field` — Neon declares
              `--radius-field: full`, which would put the disc straight back in one pack. */}
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-card bg-accent-subtle text-accent"
          >
            <FileText className="size-icon-m" strokeWidth={2} />
          </span>
          <h2 className="text-title-3 flex-1">{t('compose.posts')}</h2>
          <Link
            to="/compose/posts/new"
            className={cn(
              control({ variant: blocked ? 'secondary' : 'primary', density: 'compact' }),
              'shrink-0',
            )}
          >
            <Plus className="size-icon-s" aria-hidden />
            {t('compose.newPost')}
          </Link>
        </div>

        {/* Three chips, not five, and no count badges — the donut legend already carries every
            count, so a badge here would be the same number printed twice. The two rare states sit
            behind the overflow. */}
        <ul className="flex flex-wrap gap-tight">
          {(moreFilters ? ALL_FILTERS : PRIMARY_FILTERS).map((s) => (
            <li key={s}>
              <Pressable
                shape="chip"
                density="compact"
                variant="secondary"
                className={state === s ? SELECTED_CHIP : undefined}
                aria-pressed={state === s}
                onClick={() => setState(s)}
              >
                {/* THE CHECK TRAILS THE LABEL. `Pressable`'s `icon` slot renders ahead of the
                    children, which read "✓ Mind" — an icon button with a word after it. The mockup
                    draws "Mind ✓": a label that has been ticked. `control`'s base is
                    `inline-flex … gap-2`, so the spacing is identical either way. */}
                {t(`compose.state.${s}`)}
                {state === s ? <Check className="size-icon-s" aria-hidden /> : null}
              </Pressable>
            </li>
          ))}
          {moreFilters ? null : (
            <li>
              <Pressable shape="chip" density="compact" variant="ghost" onClick={() => setMoreFilters(true)}>
                {t('common.more')}
              </Pressable>
            </li>
          )}
        </ul>

        {posts.isPending ? (
          <ul className="flex flex-col gap-tight">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-20 rounded-card" />
              </li>
            ))}
          </ul>
        ) : posts.data && posts.data.posts.length > 0 ? (
          <ul className="flex flex-col gap-tight">
            {posts.data.posts.map((p) => {
              const rowState = stateOf(p);
              const Icon = kindIcon(p.kind);
              const live = rowState === 'live';
              return (
                <li key={p.id}>
                  <Link
                    to={`/compose/posts/${p.id}`}
                    // A live row carries the success tint and a check badge on its tile, so `Élő`
                    // is legible before the caption is read. Two lines, not three: an excerpt of
                    // your own draft tells you nothing the title did not.
                    className={cn(
                      'flex items-center gap-group rounded-card border-[length:var(--border-width)] p-4',
                      'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                      'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                      live
                        ? 'border-[var(--success-border)] bg-success-subtle hover:border-[var(--success)]'
                        : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[var(--surface-border-strong)] hover:bg-surface-2',
                    )}
                  >
                    <span aria-hidden className="relative shrink-0">
                      {/* Same rounded square as the section tile above — the row's one circle is
                          the live badge riding on its corner. */}
                      <span
                        className={cn(
                          'inline-flex size-11 items-center justify-center rounded-card',
                          live ? 'bg-success-subtle text-success' : 'bg-accent-subtle text-accent',
                        )}
                      >
                        <Icon className="size-icon-m" strokeWidth={2} />
                      </span>
                      {live ? (
                        <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-chip bg-success text-on-success">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-body block truncate text-text-1">{p.title}</span>
                      <span className="text-caption block truncate text-text-3">
                        {t(`marketplace.kind.${p.kind}`, { defaultValue: p.kind })}
                        {' · '}
                        {t(`compose.state.${rowState}`)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : state !== 'all' ? (
          // A FILTER THAT MATCHES NOTHING IS NOT AN EMPTY DESK. Select `Élő` with no live posts and
          // the old copy said the coach has none while the donut directly above read 18 — a screen
          // contradicting its own anchor in one view. The way out is the filter itself, so the
          // action resets the chip rather than sending them to the editor.
          <EmptyState
            icon={FileText}
            title={t('compose.noPostsInFilterTitle')}
            body={t('compose.noPostsInFilterBody')}
            action={
              <Pressable variant="secondary" onClick={() => setState('all')}>
                {t('compose.showAllPosts')}
              </Pressable>
            }
          />
        ) : (
          <EmptyState icon={FileText} title={t('compose.noPostsTitle')} body={t('compose.noPostsBody')} />
        )}
      </section>

      {/* ── the two operations the pill now owns ──────────────────────────────────────────────
          Collapsing the button row removed the only path to `Profil szerkesztése` and the only
          publish/unpublish control. This sheet is where they went; without it the screen would
          silently lose both. */}
      <Sheet
        open={profileSheet}
        onClose={() => setProfileSheet(false)}
        title={t('nav.profile')}
      >
        <div className="flex flex-col gap-tight">
          <Link
            to="/compose/profile"
            className={cn(control({ variant: 'secondary' }), 'w-full')}
            onClick={() => setProfileSheet(false)}
          >
            {t('compose.editProfile')}
          </Link>
          <Pressable
            variant="primary"
            className="w-full"
            busy={setLive.isPending}
            onClick={() => profile && setLive.mutate(profile.publishedAt === null)}
          >
            {isLive ? t('compose.unpublishProfile') : t('compose.publishProfile')}
          </Pressable>

          {/* Unpublishing takes the whole back catalogue dark, because a public post needs a live
              profile. The server counts them; this says so rather than letting it be a surprise. */}
          {setLive.data && typeof setLive.data.postsWentDark === 'number' && setLive.data.postsWentDark > 0 ? (
            <p className="text-caption text-text-2" role="status">
              {t('compose.wentDark', { count: setLive.data.postsWentDark })}
            </p>
          ) : null}

          {/* A refusal renders where it was raised, not on the screen behind the sheet. */}
          {setLiveConflict ? (
            <p className="text-caption text-danger" role="alert">
              {t(`compose.reason.${setLiveConflict.reason}`, {
                defaultValue: t('compose.reason.generic'),
              })}
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

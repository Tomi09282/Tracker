import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus } from 'lucide-react';
import { PressableLink, Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { ChipRow } from '../../ui/primitives/ChipRow';
import { Segment } from '../../ui/feedback/variants/E6Segmented';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Numeral } from '../../ui/data/Numeral';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { Monogram, MonogramSkeleton } from '../../ui/data/Monogram';
import { Rule } from '../../ui/data/Rule';
import { Dot, type DotTone } from '../../ui/data/Dot';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Sheet } from '../../ui/feedback/variants/E14E20';
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
 * The coach's marketplace desk — [[58-Pulse/Screens/compose-hub]], frames compose-hub-1 (the desk)
 * and compose-hub-2 (the profile sheet). Reachable by URL only on a phone (owner answer Q5).
 *
 * ═══ THE LADDER IS THE SERVER'S, NOT THIS SCREEN'S ═════════════════════════════════════════════
 *
 * Publishing has four preconditions — a live account with the coach role, an accepted current
 * guidelines version, an account old enough, and a published profile — and every one of them is
 * enforced by a database trigger. This screen does NOT re-implement that logic; it reads the flags
 * the context endpoint already computed in one statement and renders the first unmet step.
 *
 * ═══ THE ANCHOR IS AN INVENTORY, READ OFF ONE BASELINE ═════════════════════════════════════════
 *
 * Open Field: nothing is enclosed. Who the desk belongs to and its status control share one row,
 * the display title under it; then the one hero — the giant total with its unit and the four-state
 * split beside it, whose last line stands on the numeral's baseline — the quota meter and its
 * sentence, and the screen's ONE lime pill. Under a strong rule the posts: the eyebrow, a filter of
 * words with an INK mark (it changes the view, not the subject) and ruled two-line rows.
 *
 * "Élő" has one treatment everywhere — the status control, the split and every post caption: a
 * 6 pt lime dot and the word in the main ink.
 */

/** The four states, in the order the split reads them. */
const STATES = ['live', 'draft', 'withdrawn', 'removed'] as const;
type PostStateKey = (typeof STATES)[number];

/**
 * The light level of a state (compose-hub-1 `Level/on | half | off`): only `live` spends the lamp;
 * a draft is half ink; a post taken down — by its coach or by a moderator — is off. A post state is
 * an inventory bucket, not an alarm, so no state reaches for a hue.
 */
const LEVEL: Record<PostStateKey, DotTone> = { live: 'live', draft: 'half', withdrawn: 'off', removed: 'off' };

/**
 * Five filter words became three.
 *
 * `Levett` and `Eltávolított` sit behind the overflow because the split already carries every
 * count, and a five-word row is the whole width of a phone spent on a control most coaches press
 * twice.
 */
const PRIMARY_FILTERS: readonly PostState[] = ['all', 'draft', 'live'];
const ALL_FILTERS: readonly PostState[] = ['all', 'draft', 'live', 'withdrawn', 'removed'];

/** The same derivation the row caption uses, so the split and the list can never disagree. */
function stateOf(p: ComposePost): PostStateKey {
  if (p.removedAt !== null) return 'removed';
  if (p.deletedAt !== null) return 'withdrawn';
  if (p.publishedAt !== null) return 'live';
  return 'draft';
}

/**
 * Marks where the quota sentence's count goes, so the count alone can take the main ink without a
 * change to the copy (`compose.slots` stays one string in three languages).
 */
const COUNT_MARK = '';

/**
 * The four-state split beside the giant (compose-hub-1 "Total + split"): the right half of the
 * hero, four rows at a pitch of 29 with a row hairline between two, and its last baseline on the
 * numeral's. A row is the label's line (dot 6 · 8 · `cap`) and the count (`data-l`, mono), bottom
 * to bottom: both line boxes end 4 under their baseline, so `items-end` IS the shared baseline.
 * A zero is drawn in the quiet ink; every state is named, zeros included — whatever is inside the
 * total is in the split.
 */
function StateSplit({ rows }: { rows: { key: PostStateKey; label: string; count: number }[] }) {
  return (
    <ul className="absolute -top-1 right-0 flex w-1/2 flex-col">
      {rows.map((row, i) => (
        <li key={row.key} className="flex flex-col">
          {i > 0 ? <Rule className="mb-0.75 mt-1.25" /> : null}
          <span className="flex h-5 items-end justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <Dot tone={LEVEL[row.key]} />
              <span className={row.key === 'live' ? 'text-cap truncate text-text-1' : 'text-cap truncate text-text-2'}>
                {row.label}
              </span>
            </span>
            <span className={row.count === 0 ? 'text-data-l text-text-3' : 'text-data-l text-text-1'}>{row.count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ComposePage() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<PostState>('all');
  const [moreFilters, setMoreFilters] = useState(false);
  const [profileSheet, setProfileSheet] = useState(false);
  const ctx = useComposeContext();
  const posts = useComposePosts(state);
  // The split always describes the WHOLE desk, not the filtered view — a hero that changed when a
  // filter was pressed would be answering a different question from the one it is asked. When the
  // filter is already `all` this is the same cached query, not a second request.
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
    // Blocks at the final geometry, where the text will be: the identity line and the display
    // title, the giant at its cap height with the four split lines beside it, the meter and its
    // caption, the pill's height, then the posts section. No radius, no spinner.
    return (
      <Screen top="push">
        <div role="status" aria-busy="true" className="flex flex-col gap-8">
          <span className="sr-only">{t('common.loading')}</span>
          <div className="flex flex-col gap-1">
            <div className="flex h-11 items-center gap-3">
              <MonogramSkeleton size={28} />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-[34px] w-2/3" />
          </div>
          <div className="flex flex-col gap-5">
            <div className="relative h-[100px]">
              <Skeleton className="h-[100px] w-[55px]" />
              <div className="absolute right-0 top-0 flex w-1/2 flex-col gap-4 pt-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-1 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-14 w-full" />
          </div>
          <div className="flex flex-col gap-4">
            <Rule strong />
            <Skeleton className="h-4 w-28" />
            <RowStack as="div">
              {[0, 1].map((i) => (
                <ListRowSkeleton key={i} sub index={i} />
              ))}
            </RowStack>
          </div>
        </div>
      </Screen>
    );
  }

  if (ctx.isError || !ctx.data) {
    // Also what a member sees (403). The message IS the page: its title is the h1, and there is
    // no retry and no way back, as the screen note says.
    return (
      <Screen top="push">
        <EmptyState heading="h1" title={t('compose.unavailableTitle')} body={t('compose.unavailableBody')} />
      </Screen>
    );
  }

  const { profile, profileRemoved, standing, quotas } = ctx.data;
  const slotsLeft = Math.max(0, quotas.postPublishDailyMax - quotas.publishedToday);
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
   * A gate on screen means the coach has ONE thing to do next, and it is not writing.
   *
   * `publish` is excluded on purpose: at that rung the ladder draws no gate and no action, so
   * nothing is competing and `Új bejegyzés` keeps the pill. At every other rung the gate's own
   * action takes the screen's one lime pill and drafting stays reachable as the posts section's
   * text link — two pills on a screen means neither is.
   */
  const blocked = blocker !== null && blocker !== 'publish';

  // ── the gate: one notice line, and the gate's own pill where it has one ──────────────────────
  // A moderator's removal is NOT the same as having no profile, and inviting the coach to "create
  // one" after a takedown would send them at a handle they can no longer claim.
  const gate: ReactNode = profileRemoved ? (
    <NoticeLine tone="danger" detail={t('compose.removedBody')}>
      {t('compose.removedTitle')}
    </NoticeLine>
  ) : blocker === 'guidelines' ? (
    <div className="flex flex-col gap-5">
      <NoticeLine detail={t(standing.activeGuidelinesI18nKey, { defaultValue: t('compose.guidelinesBody') })}>
        {t('compose.guidelinesTitle')}
      </NoticeLine>
      <Pressable
        variant="primary"
        size="lg"
        className="w-full"
        busy={accept.isPending}
        onClick={() => accept.mutate(standing.activeGuidelinesVersion)}
      >
        {t('compose.guidelinesAccept', { version: standing.activeGuidelinesVersion })}
      </Pressable>
    </div>
  ) : blocker === 'age' ? (
    // WHEN, not "later". A limit a person can plan around is a limit; one they cannot is a wall.
    <NoticeLine
      detail={t('compose.tooNewBody', { when: new Date(standing.eligibleAt * 1000).toLocaleString(i18n.language) })}
    >
      {t('compose.tooNewTitle')}
    </NoticeLine>
  ) : blocker === 'profile' ? (
    <div className="flex flex-col gap-5">
      <NoticeLine detail={t('compose.noProfileBody')}>{t('compose.noProfileTitle')}</NoticeLine>
      <PressableLink to="/compose/profile" variant="primary" size="lg" className="w-full">
        {t('compose.createProfile')}
      </PressableLink>
    </div>
  ) : null;

  // ── the quota sentence, its count in the main ink ─────────────────────────────────────────────
  const [slotsBefore, slotsAfter] = t('compose.slots', { left: COUNT_MARK, max: quotas.postPublishDailyMax }).split(COUNT_MARK);
  const slotsSentence =
    slotsAfter === undefined ? (
      t('compose.slots', { left: slotsLeft, max: quotas.postPublishDailyMax })
    ) : (
      <>
        {slotsBefore}
        <span className="text-text-1">{slotsLeft}</span>
        {slotsAfter}
      </>
    );

  const newPostLink = (
    <TextLink to="/compose/posts/new" lead={<Plus aria-hidden />}>
      {t('compose.newPost')}
    </TextLink>
  );

  const rows = posts.data?.posts ?? [];

  return (
    <Screen top="push">
      {/* ── the header: who the desk belongs to, its status control, the display title ─────── */}
      {profile && !profileRemoved ? (
        <ScreenHeader
          kind="identity"
          lead={<Monogram initials={initialsOf(profile.displayName)} size={28} />}
          name={profile.displayName}
          handle={`@${profile.handle}`}
          title={t('compose.title')}
          trailing={
            // Opens the profile sheet. Bare — a dot, the word and the chevron, a 44 pt target —
            // and the FIRST button named "Élő" on the page (the filter's "Élő" comes later).
            <TextLink
              aria-haspopup="dialog"
              onClick={() => setProfileSheet(true)}
              lead={<Dot tone={isLive ? 'live' : 'off'} />}
              // The chevron stands 2 after the word (the kit gap is 6): given back as placement.
              trail={
                <span className="-ml-1 inline-flex">
                  <ChevronDown aria-hidden />
                </span>
              }
            >
              {isLive ? t('compose.live') : t('compose.hidden')}
            </TextLink>
          }
        />
      ) : (
        <ScreenHeader kind="root" title={t('compose.title')} />
      )}

      {gate}

      {/* ── the hero: the inventory, the quota, the one pill ──────────────────────────────────── */}
      <div className="flex flex-col gap-5">
        <div role="group" aria-label={t('compose.posts')} className="relative flex h-[100px] items-start">
          <span className="flex items-baseline">
            <Numeral size="giant" value={counts.total} mode="roll" from={0} />
            <span className="text-cap ml-2 text-text-2">{t('compose.postsUnit')}</span>
          </span>
          <StateSplit rows={STATES.map((key) => ({ key, label: t(`compose.state.${key}`), count: counts.tally[key] }))} />
        </div>

        <div className="flex flex-col gap-2">
          {/* The meter is INK: lime is reserved for the screen's one live datum. At 0 left it turns
              to the warning colour. */}
          <ProgressBar
            value={quotas.publishedToday}
            max={quotas.postPublishDailyMax}
            tone={slotsLeft === 0 ? 'warn' : 'ink'}
            label={t('compose.slots', { left: slotsLeft, max: quotas.postPublishDailyMax })}
          />
          <p className="text-cap text-text-2">{slotsSentence}</p>
        </div>

        {blocked ? null : (
          <PressableLink
            to="/compose/posts/new"
            variant="primary"
            size="lg"
            className="w-full"
            icon={<Plus size={20} strokeWidth={2.25} aria-hidden />}
          >
            {t('compose.newPost')}
          </PressableLink>
        )}
      </div>

      {/* ── the posts ────────────────────────────────────────────────────────────────────────── */}
      <Section title={t('compose.posts')} trailing={blocked ? newPostLink : undefined}>
        {/* The frame stands the filter and the list 4 apart, and 4 under the eyebrow (the kit
            head -> content is 16): placement inside the section. */}
        <div className="-mt-3 flex flex-col gap-1">
          {/* Words with an INK mark: the filter changes the view of the desk, not its subject. "Több"
              does not select — it opens the two rare states once, and goes. */}
          <ChipRow wrap label={t('compose.posts')}>
            {(moreFilters ? ALL_FILTERS : PRIMARY_FILTERS).map((s) => (
              <Segment
                key={s}
                layout="hug"
                mark="ink"
                selected={state === s}
                aria-pressed={state === s}
                onClick={() => setState(s)}
              >
                {t(`compose.state.${s}`)}
              </Segment>
            ))}
            {moreFilters ? null : (
              <Segment layout="hug" mark="ink" selected={false} onClick={() => setMoreFilters(true)}>
                {t('common.more')}
              </Segment>
            )}
          </ChipRow>

          {posts.isPending ? (
            <div role="status" aria-busy="true">
              <span className="sr-only">{t('common.loading')}</span>
              <RowStack as="div">
                {[0, 1, 2].map((i) => (
                  <ListRowSkeleton key={i} sub index={i} />
                ))}
              </RowStack>
            </div>
          ) : rows.length > 0 ? (
            <RowStack>
              {rows.map((p) => {
                const rowState = stateOf(p);
                const live = rowState === 'live';
                return (
                  <ListRow
                    key={p.id}
                    to={`/compose/posts/${p.id}`}
                    chevron
                    title={p.title}
                    sub={
                      <span className="flex min-w-0 items-center gap-2">
                        <Dot tone={LEVEL[rowState]} />
                        <span className="truncate">
                          {t(`marketplace.kind.${p.kind}`, { defaultValue: p.kind })}
                          {' · '}
                          <span className={live ? 'text-text-1' : undefined}>{t(`compose.state.${rowState}`)}</span>
                        </span>
                      </span>
                    }
                  />
                );
              })}
            </RowStack>
          ) : state !== 'all' ? (
            // A FILTER THAT MATCHES NOTHING IS NOT AN EMPTY DESK: the hero above still reads the real
            // total, so the way out is the filter itself.
            <EmptyState
              className="mt-3"
              title={t('compose.noPostsInFilterTitle')}
              body={t('compose.noPostsInFilterBody')}
              action={
                <TextLink text="body" onClick={() => setState('all')}>
                  {t('compose.showAllPosts')}
                </TextLink>
              }
            />
          ) : (
            <EmptyState className="mt-3" title={t('compose.noPostsTitle')} body={t('compose.noPostsBody')} />
          )}
        </div>
      </Section>

      {/* ── the profile sheet: the two operations the status control owns ─────────────────────
          Editing goes to the profile editor; publishing / unpublishing happens here, with no
          confirmation (the screen note), and the sheet stays open so its outcome is read where
          it was raised. The sheet draws no pill: the page keeps its one. */}
      <Sheet open={profileSheet} onClose={() => setProfileSheet(false)} title={t('nav.profile')}>
        <RowStack>
          <ListRow
            to="/compose/profile"
            chevron
            onClick={() => setProfileSheet(false)}
            title={t('compose.editProfile')}
          />
          <ListRow
            tone={isLive ? 'danger' : 'default'}
            busy={setLive.isPending}
            onClick={() => profile && setLive.mutate(profile.publishedAt === null)}
            title={isLive ? t('compose.unpublishProfile') : t('compose.publishProfile')}
          />
        </RowStack>

        {/* Unpublishing takes the whole back catalogue dark, because a public post needs a live
            profile. The server counts them; this says so rather than letting it be a surprise. */}
        {setLive.data && typeof setLive.data.postsWentDark === 'number' && setLive.data.postsWentDark > 0 ? (
          <NoticeLine role="status">{t('compose.wentDark', { count: setLive.data.postsWentDark })}</NoticeLine>
        ) : null}

        {/* A refusal renders where it was raised, not on the screen behind the sheet — with the
            values its copy names, so a raw placeholder never prints. */}
        {setLiveConflict ? (
          <NoticeLine tone="danger" role="alert">
            {t(`compose.reason.${setLiveConflict.reason}`, {
              defaultValue: t('compose.reason.generic'),
              version: setLiveConflict.activeVersion ?? standing.activeGuidelinesVersion,
              when: new Date((setLiveConflict.eligibleAt ?? standing.eligibleAt) * 1000).toLocaleString(i18n.language),
            })}
          </NoticeLine>
        ) : null}
      </Sheet>
    </Screen>
  );
}

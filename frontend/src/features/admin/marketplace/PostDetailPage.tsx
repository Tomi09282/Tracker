import { useMemo, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink } from 'lucide-react';
import { ApiError } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { initialsOf } from '../../../lib/person';
import { Pressable } from '../../../ui/primitives/Pressable';
import { TextLink } from '../../../ui/primitives/TextLink';
import { EmptyState } from '../../../ui/feedback/EmptyState';
import { NoticeLine } from '../../../ui/feedback/NoticeLine';
import { ConfirmSheet } from '../../../ui/feedback/ConfirmSheet';
import { Skeleton } from '../../../ui/feedback/ScreenSkeleton';
import { Dot, type DotTone } from '../../../ui/data/Dot';
import { Monogram } from '../../../ui/data/Monogram';
import { ProgressBar } from '../../../ui/data/ProgressBar';
import { Rule } from '../../../ui/data/Rule';
import { RowStack } from '../../../ui/data/RowStack';
import { ListRow } from '../../../ui/data/ListRow';
import { Section } from '../../../ui/data/SectionHeader';
import { Screen } from '../../../ui/shell/Screen';
import { ScreenHeader } from '../../../ui/shell/ScreenHeader';
import { UserPhoto } from '../../../ui/media/UserPhoto';
import { hasRole, useSession } from '../../auth/useSession';
import { DocRenderer, type BlockNode } from '../../marketplace/DocRenderer';
import { useOnline } from '../../plans/useOnline';
import { AdminForbidden } from '../AdminShell';
import {
  decideReports,
  isNotFound,
  isNotRemoved,
  useAdminPost,
  useRefreshAll,
  useRestore,
  type AdminPostDetail,
  type AdminPostReport,
} from './adminPostsApi';
import { PostStateTag, useKindLabel, useStamp } from './postParts';
import { TakeDownSheet, type TakeDownTarget } from './TakeDownSheet';

const PUBLIC_ID = /^[A-Za-z0-9_-]{12}$/;

/**
 * One marketplace post, as the admin inspects it (`/admin/marketplace/posts/:publicId`, frames
 * admin-post-detail-1, -2, -2-draft and -3, with the two sheets -2-takedown and -2-restore).
 *
 * ═══ THE ADMIN VIEWS, TAKES DOWN, RESTORES — AND DOES NOT EDIT ═════════════════════════════════
 *
 * Every row of ADATOK is read-only (the section says so): the owner's decision is that a moderator
 * removes a post, never rewrites it. The two acts are a take-down with a REQUIRED reason and a
 * restore. A take-down is a sheet with its reason; a restore is a plain confirmation — it gives
 * back what was public and is the page's one lime pill while the post is removed.
 *
 * ═══ WHAT THE SERVER DECIDES, AND THIS ONLY DRAWS ══════════════════════════════════════════════
 *
 * The state, whether the post is on the open internet right now (`publicVisibility`), whether the
 * body and the pictures may be shown at all (a post that was never published is private to its
 * author: `bodyWithheld`), and which acts exist. The buttons that the state makes meaningless are
 * not drawn, and the server refuses them anyway.
 *
 * Reports carry no reporter. A report is one row per reporter on the server; the page groups the
 * rows of one reason, which is exactly "N different reporters".
 */
export function PostDetailPage() {
  const { t } = useTranslation();
  const { publicId } = useParams();
  const { data: user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const id = publicId && PUBLIC_ID.test(publicId) ? publicId : undefined;
  const query = useAdminPost(id);
  const online = useOnline();

  // Back to the list it was opened from (its search and state are in that address): the history
  // step when the row pushed this page, the list itself when the page was opened by its address.
  const leave = () => {
    if (location.key !== 'default') void navigate(-1);
    else void navigate('/admin/marketplace?view=posts', { replace: true });
  };

  if (user && !hasRole(user, 'admin')) return <AdminForbidden />;
  if (query.error instanceof ApiError && query.error.status === 403) return <AdminForbidden />;

  return (
    <Screen top="push" width="wide">
      <ScreenHeader
        kind="push"
        title={t('adminPosts.detail.title')}
        back={{ onClick: leave, label: t('admin.section.marketplace') }}
      />
      {!id || isNotFound(query.error) ? (
        <EmptyState
          title={t('adminPosts.detail.goneTitle')}
          body={t('adminPosts.detail.goneBody')}
          action={
            <TextLink text="body" onClick={leave}>
              {t('common.back')}
            </TextLink>
          }
        />
      ) : query.isPending ? (
        <DetailSkeleton />
      ) : query.isError || !query.data ? (
        <EmptyState
          title={online ? t('adminPosts.errorTitle') : t('offline.title')}
          body={t('adminPosts.errorBody')}
          action={
            <TextLink text="body" busy={query.isRefetching} onClick={() => void query.refetch()}>
              {t('common.retry')}
            </TextLink>
          }
        />
      ) : (
        <PostBody data={query.data} online={online} />
      )}
    </Screen>
  );
}

function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{t('common.loading')}</span>
      <div aria-hidden className="flex flex-col gap-3 pt-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-7 w-48" />
      </div>
      <div aria-hidden className="flex flex-col gap-4 pt-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

function PostBody({ data, online }: { data: AdminPostDetail; online: boolean }) {
  const { t } = useTranslation();
  const kind = useKindLabel();
  const { post, author } = data;
  const [sheet, setSheet] = useState<{ target: TakeDownTarget; open: boolean } | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const askTakeDown = (target: TakeDownTarget) => setSheet({ target, open: true });

  const removed = post.state === 'removed';
  const live = post.state === 'live';
  const isDraft = post.bodyWithheld; // never published: private to its author
  const cover = post.mediaWithheld ? undefined : (post.media.find((m) => m.role === 'cover') ?? post.media[0]);
  const hiddenOther = post.publicVisibility.hiddenBy.filter((h) => h !== 'removed' && h !== 'draft' && h !== 'withdrawn');
  const authorOff = author.disabled && live;
  // The profile was taken down (a second, separate act with no way back here): the notice names it, not only the disable.
  const profileRemoved = post.publicVisibility.hiddenBy.includes('profile_removed');

  return (
    <div className="flex flex-col gap-7">
      {cover ? (
        // admin-post-detail-1: the middle 232 of a 440 x 330 render, wider than the column (the screen clips the
        // sides). Not feathered: the picture's black is the page (`blend="lighten"`), so its light reaches the top
        // at full strength and no box shows (review S-admin-posts 1); dimmed on the picture itself while removed
        // (an opacity on a parent would isolate the blend).
        <div className="-mx-6 -mt-1 flex h-58 justify-center overflow-hidden">
          <UserPhoto
            src={cover.url}
            alt={cover.alt ?? ''}
            ratio={440 / 232}
            blend="lighten"
            desaturate
            priority
            className={cn('w-110 max-w-none shrink-0', removed && 'opacity-40')}
          />
        </div>
      ) : null}

      <header className={cn('flex flex-col gap-2', !cover && '-mt-1')}>
        <div className="flex items-center gap-4">
          <span className="text-micro text-text-2">{kind(post.kind)}</span>
          {/* The lime lamp says "on the open internet": a live post nobody can see now (author off, profile gone) gets the ink dot. */}
          <PostStateTag state={post.state} lamp={post.publicVisibility.visible} />
        </div>
        <h2 className="text-title break-words text-text-1">{post.title}</h2>
        {isDraft && !removed ? <p className="text-cap text-text-2">{t('adminPosts.detail.privateDraft')}</p> : null}
        {live && post.publicVisibility.visible ? (
          <TextLink href={`/m/p/${post.id}`} target="_blank" rel="noreferrer" lead={<ExternalLink />} className="self-start">
            {t('admin.marketplace.openLive')}
          </TextLink>
        ) : null}
      </header>

      {removed && post.removal ? (
        <RemovedBanner removal={post.removal} onRestore={() => setRestoreOpen(true)} online={online} othersHide={hiddenOther.length > 0} />
      ) : null}

      {authorOff ? (
        <section className="flex flex-col gap-1">
          <Rule />
          <NoticeLine tone="warn" role="status">
            {t('adminPosts.detail.authorOff')}
          </NoticeLine>
          {profileRemoved ? (
            <NoticeLine tone="warn" role="status">
              {t('adminPosts.detail.profileOff')}
            </NoticeLine>
          ) : null}
          {author.handle && author.profile && !author.profile.removed ? (
            <TextLink
              text="cap"
              tone="danger"
              trail={<ChevronRight />}
              className="self-start"
              disabled={!online}
              onClick={() => askTakeDown({ kind: 'both', postId: post.id, handle: author.handle })}
            >
              {t('adminPosts.takedown.both.title')}
            </TextLink>
          ) : null}
        </section>
      ) : live && hiddenOther.length > 0 ? (
        <section className="flex flex-col gap-1">
          <Rule />
          <NoticeLine tone="warn" role="status">
            {profileRemoved ? t('adminPosts.detail.profileOff') : t('adminPosts.detail.notShown')}
          </NoticeLine>
        </section>
      ) : null}

      <Facts data={data} />

      <Section gap={8} title={t('adminPosts.author.title')}>
        <RowStack>
          <ListRow
            to={`/admin/accounts/${author.id}`}
            title={author.displayName ?? (author.handle ? `@${author.handle}` : '—')}
            sub={
              author.handle
                ? `@${author.handle}${author.profile?.verified ? ` · ${t('marketplace.verified')}` : ''}`
                : undefined
            }
            leadSlot
            lead={<Monogram initials={initialsOf(author.displayName ?? author.handle ?? '?')} />}
            trailing={author.disabled ? <span className="text-micro text-danger">{t('adminPosts.author.disabled')}</span> : undefined}
            chevron
          />
        </RowStack>
      </Section>

      <Section gap={12} title={t('adminPosts.timeline.title')}>
        <Timeline data={data} />
      </Section>

      {!isDraft ? <BodySection data={data} /> : null}
      {!isDraft && cover ? <MediaSection data={data} /> : null}
      {data.reports.total > 0 ? <ReportsSection data={data} online={online} onUphold={askTakeDown} /> : null}

      <ManageSection data={data} online={online} onTakeDown={askTakeDown} />

      <TakeDownSheet
        target={sheet?.target ?? null}
        open={sheet?.open ?? false}
        onClose={() => setSheet((s) => (s ? { ...s, open: false } : s))}
      />
      <RestoreSheet
        open={restoreOpen}
        postId={post.id}
        othersHide={hiddenOther.length > 0}
        onClose={() => setRestoreOpen(false)}
      />
    </div>
  );
}

/** Who took the post down, why and when — and the one lime pill of the page while it is removed. */
function RemovedBanner({
  removal,
  onRestore,
  online,
  othersHide,
}: {
  removal: NonNullable<AdminPostDetail['post']['removal']>;
  onRestore: () => void;
  online: boolean;
  /** Something besides the take-down still hides the post: do not promise it will show again. */
  othersHide: boolean;
}) {
  const { t } = useTranslation();
  const { dateTime } = useStamp();
  const who = removal.by ? (removal.by.displayName ?? removal.by.email) : null;
  return (
    <section className="flex flex-col gap-2">
      <Rule />
      <div className="flex pt-2">
        <PostStateTag state="removed" />
      </div>
      <p className="text-cap text-text-3">{t('adminPosts.removed.reason')}</p>
      <p className="text-body break-words text-text-1">{removal.reason ?? '—'}</p>
      <p className="text-data text-text-3">{[who, dateTime(removal.at)].filter(Boolean).join(' · ')}</p>
      <div className="pt-3">
        <Pressable variant="primary" size="lg" className="w-full" disabled={!online} onClick={onRestore}>
          {t('adminPosts.restore.action')}
        </Pressable>
      </div>
      {othersHide ? null : <p className="text-cap text-text-3">{t('adminPosts.restore.hint')}</p>}
    </section>
  );
}

/** ADATOK: what the post says about itself, read-only. A fact the kind does not have is not drawn. */
function Facts({ data }: { data: AdminPostDetail }) {
  const { t, i18n } = useTranslation();
  const kind = useKindLabel();
  const { dateTime } = useStamp();
  const { post } = data;
  const price = useMemo(() => {
    if (!post.price) return null;
    try {
      return new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: post.price.currency,
        minimumFractionDigits: post.price.minorUnits,
        maximumFractionDigits: post.price.minorUnits,
      }).format(post.price.minor / 10 ** post.price.minorUnits);
    } catch {
      return `${post.price.minor / 10 ** post.price.minorUnits} ${post.price.currency}`;
    }
  }, [post.price, i18n.language]);

  const rows: Array<[string, string]> = [[t('adminPosts.facts.kind'), kind(post.kind)]];
  if (post.city) rows.push([t('compose.city'), post.city.name]);
  if (post.eventAt !== null) rows.push([t('adminPosts.facts.time'), dateTime(post.eventAt, post.eventTz)]);
  if (post.capacity !== null) rows.push([t('adminPosts.facts.capacity'), t('adminPosts.facts.seats', { count: post.capacity })]);
  if (price) rows.push([t('adminPosts.facts.price'), price]);

  return (
    <Section gap={8} title={t('adminPosts.facts.title')} trailing={<span className="text-cap text-text-2">{t('adminPosts.facts.readOnly')}</span>}>
      <RowStack as="div" trim>
        {rows.map(([label, value]) => (
          <div key={label} data-row-pad="" className="flex min-h-11 items-center justify-between gap-4">
            <span className="text-cap text-text-2">{label}</span>
            <span className="text-end text-data text-text-1">{value}</span>
          </div>
        ))}
      </RowStack>
    </Section>
  );
}

/** ÁLLAPOT: the steps the post went through, oldest first; the current one is the filled mark. */
function Timeline({ data }: { data: AdminPostDetail }) {
  const { t } = useTranslation();
  const { dateTime } = useStamp();
  const { post, timeline } = data;
  const steps = timeline.map((s) => {
    const key = s.kind;
    if (s.kind === 'removed') {
      const who = s.by ? (s.by.displayName ?? s.by.email) : null;
      return {
        key,
        title: who ? `${t('adminPosts.timeline.removed')} · ${who}` : t('adminPosts.timeline.removed'),
        detail: s.reason ? t('adminPosts.timeline.reason', { reason: s.reason }) : null,
        at: s.at,
        danger: true,
      };
    }
    return { key, title: t(`adminPosts.timeline.${s.kind}`), detail: null as string | null, at: s.at, danger: false };
  });
  // A post that was never published says so under its one step, instead of a missing one.
  if (post.publishedAt === null && steps.length === 1) steps[0].detail = t('adminPosts.timeline.notPublished');

  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const tone: DotTone = !last ? 'ring' : s.danger ? 'danger' : 'ink';
        return (
          <li key={s.key} className={cn('relative ps-6', !last && 'pb-5')}>
            <Dot tone={tone} size={8} className="absolute start-0 top-1.5" />
            {!last ? <span aria-hidden className="absolute start-[3.5px] top-6 bottom-0 w-px bg-hair" /> : null}
            <p className={cn('text-body-m', s.danger ? 'text-danger' : 'text-text-1')}>{s.title}</p>
            {s.detail ? <p className="text-cap text-text-2">{s.detail}</p> : null}
            <p className="text-data text-text-3">{dateTime(s.at)}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** SZÖVEG: four lines of what the post says, the whole text on request (a second read, never the default). */
function BodySection({ data }: { data: AdminPostDetail }) {
  const { t } = useTranslation();
  const [full, setFull] = useState(false);
  const whole = useAdminPost(data.post.id, full);
  const excerpt = data.post.body?.excerpt ?? '';
  const doc = whole.data?.post.body?.doc;
  if (!data.post.body) return null;
  return (
    <Section gap={12} title={t('adminPosts.body.title')}>
      {full && Array.isArray(doc) ? (
        <DocRenderer doc={doc as BlockNode[]} />
      ) : (
        <p className="line-clamp-4 whitespace-pre-line text-body text-text-1">{excerpt}</p>
      )}
      {full && whole.isError ? (
        <NoticeLine tone="danger" role="alert" action={<TextLink onClick={() => void whole.refetch()}>{t('common.retry')}</TextLink>}>
          {t('adminPosts.errorBody')}
        </NoticeLine>
      ) : null}
      <TextLink
        text="cap"
        className="self-start"
        trail={full ? <ChevronUp /> : <ChevronDown />}
        busy={full && whole.isFetching && !Array.isArray(doc)}
        aria-expanded={full}
        onClick={() => setFull((v) => !v)}
      >
        {full ? t('common.less') : t('adminPosts.body.full')}
      </TextLink>
    </Section>
  );
}

/** MÉDIA: the pictures of a published post, the cover first (served to the admin by the server, same-origin). */
function MediaSection({ data }: { data: AdminPostDetail }) {
  const { t } = useTranslation();
  const media = data.post.media;
  return (
    <Section gap={12} title={t('adminPosts.media.title')} trailing={<span className="text-cap text-text-2">{t('adminPosts.media.count', { count: media.length })}</span>}>
      <ul className="grid grid-cols-3 gap-4">
        {media.map((m, i) => (
          <li key={m.key} className="flex flex-col gap-2">
            {/* A box of its own: the three captions stay on one line whatever shape the pictures are (review S-admin-posts 9). */}
            <div className="aspect-[4/3] w-full overflow-hidden">
              <UserPhoto src={m.thumbUrl} alt={m.alt ?? ''} ratio={4 / 3} blend="lighten" desaturate className="h-full" />
            </div>
            <span className="text-data text-text-3">{i === 0 && m.role === 'cover' ? t('adminPosts.media.cover') : t('adminPosts.media.nth', { n: i + 1 })}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface ReportGroup {
  key: string;
  reason: string;
  status: AdminPostReport['status'];
  closed: boolean;
  ids: number[];
  severity: number;
  snapshot: string | null;
  at: number;
  resolvedAt: number | null;
}

/** One row per reason and outcome: the server keeps one row per reporter, so the count of rows IS the count of reporters. */
function groupReports(items: AdminPostReport[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const r of items) {
    const key = `${r.closed ? 'closed' : 'open'}|${r.reason}|${r.status}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(r.id);
      g.at = Math.max(g.at, r.createdAt);
      g.resolvedAt = r.resolvedAt !== null ? Math.max(g.resolvedAt ?? 0, r.resolvedAt) : g.resolvedAt;
      g.snapshot ??= r.snapshot;
    } else {
      groups.set(key, {
        key,
        reason: r.reason,
        status: r.status,
        closed: r.closed,
        ids: [r.id],
        severity: r.severity,
        snapshot: r.snapshot,
        at: r.createdAt,
        resolvedAt: r.resolvedAt,
      });
    }
  }
  // Open before closed; then the queue's own order: the worst reason first, the oldest filing first.
  return [...groups.values()].sort((a, b) => Number(a.closed) - Number(b.closed) || b.severity - a.severity || a.at - b.at);
}

/** JELENTÉSEK: the open reports with their two decisions, the closed ones as a quiet outcome line. */
function ReportsSection({
  data,
  online,
  onUphold,
}: {
  data: AdminPostDetail;
  online: boolean;
  onUphold: (t: TakeDownTarget) => void;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupReports(data.reports.items), [data.reports.items]);
  const closed = data.reports.total - data.reports.open;
  const trailing =
    data.reports.open > 0 && closed > 0
      ? t('adminPosts.reports.both', { open: data.reports.open, closed })
      : data.reports.open > 0
        ? t('adminPosts.reports.open', { count: data.reports.open })
        : t('adminPosts.reports.closed', { count: closed });
  return (
    <Section gap={8} title={t('adminPosts.reports.title')} trailing={<span className="text-cap text-text-2">{trailing}</span>}>
      <div className="pt-3.5">
        <RowStack as="div" trim aria-label={t('adminPosts.reports.title')}>
          {groups.map((g) => (
            <ReportGroupRow key={g.key} group={g} postId={data.post.id} online={online} onUphold={onUphold} />
          ))}
        </RowStack>
      </div>
    </Section>
  );
}

function ReportGroupRow({
  group,
  postId,
  online,
  onUphold,
}: {
  group: ReportGroup;
  postId: string;
  online: boolean;
  onUphold: (t: TakeDownTarget) => void;
}) {
  const { t } = useTranslation();
  const { dateTime } = useStamp();
  const refresh = useRefreshAll();
  const reject = useMutation({
    networkMode: 'always', // see useTakeDown
    mutationFn: () => decideReports(group.ids, 'rejected', null),
    onSuccess: () => refresh(),
  });
  return (
    <article data-row-pad="" className="flex flex-col gap-2.5 pt-4 pb-2">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-body-m text-text-1">{t(`admin.marketplace.reason.${group.reason}`, { defaultValue: group.reason })}</h3>
        <span className="shrink-0 text-data text-text-3">{dateTime(group.at)}</span>
      </div>
      <p className="text-cap text-text-2">{t(group.ids.length === 1 ? 'admin.marketplace.reportersOne' : 'admin.marketplace.reporters', { count: group.ids.length })}</p>
      <div className="flex items-center gap-3">
        <span className="text-cap text-text-2">{t('adminPosts.reports.severity')}</span>
        <ProgressBar value={group.severity} max={100} label={t('adminPosts.reports.severity')} valueText={String(group.severity)} className="w-24" />
        <span className="text-data text-text-2">{group.severity}</span>
      </div>
      {group.snapshot ? (
        <div className="flex flex-col gap-1 border-s border-edge ps-4">
          <p className="text-micro text-text-3">{t('admin.marketplace.snapshot')}</p>
          <p className="line-clamp-4 whitespace-pre-line text-cap text-text-2">{group.snapshot}</p>
        </div>
      ) : null}
      {!group.closed ? (
        <>
          <div className="flex items-center gap-6">
            <TextLink busy={reject.isPending} disabled={!online} onClick={() => reject.mutate()}>
              {t('admin.marketplace.reject')}
            </TextLink>
            <TextLink tone="danger" disabled={!online || reject.isPending} onClick={() => onUphold({ kind: 'report', postId, reportIds: group.ids })}>
              {t('adminPosts.reports.upholdAndTakeDown')}
            </TextLink>
          </div>
          {reject.isError ? (
            <NoticeLine tone="danger" role="alert">
              {t('adminPosts.errorBody')}
            </NoticeLine>
          ) : null}
        </>
      ) : (
        <p className="text-data uppercase text-text-2">
          {t(group.status === 'upheld' ? 'adminPosts.reports.upheld' : 'adminPosts.reports.rejected')}
          {group.resolvedAt !== null ? ` · ${dateTime(group.resolvedAt)}` : ''}
        </p>
      )}
    </article>
  );
}

/** KEZELÉS: the acts that exist for this post in this state. A take-down needs a public post to take down. */
function ManageSection({
  data,
  online,
  onTakeDown,
}: {
  data: AdminPostDetail;
  online: boolean;
  onTakeDown: (t: TakeDownTarget) => void;
}) {
  const { t } = useTranslation();
  const { post, author } = data;
  const rows: ReactNode[] = [];
  if (post.state === 'live') {
    rows.push(
      <ListRow
        key="post"
        tone="danger"
        title={t('adminPosts.takedown.post.title')}
        sub={t('adminPosts.manage.postSub')}
        subLines={2}
        disabled={!online}
        chevron
        onClick={() => onTakeDown({ kind: 'post', postId: post.id })}
      />,
    );
  }
  if (author.handle && author.profile && !author.profile.removed) {
    rows.push(
      <ListRow
        key="profile"
        tone="danger"
        title={t('adminPosts.takedown.profile.title')}
        sub={t('adminPosts.manage.profileSub')}
        subLines={2}
        disabled={!online}
        chevron
        onClick={() => onTakeDown({ kind: 'profile', postId: post.id, handle: author.handle })}
      />,
    );
  }
  if (rows.length === 0) return null;
  return (
    <Section gap={8} title={t('adminPosts.manage.title')}>
      <RowStack>{rows}</RowStack>
      {post.bodyWithheld && post.state === 'draft' ? <p className="text-cap text-text-2">{t('adminPosts.manage.draftNote')}</p> : null}
    </Section>
  );
}

/** "Visszaállítod a posztot?" — a plain confirmation: the act gives back, so its link is ink, not danger. */
function RestoreSheet({
  open,
  postId,
  othersHide,
  onClose,
}: {
  open: boolean;
  postId: string;
  othersHide: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const restore = useRestore();
  const online = useOnline();
  const run = () => {
    restore.mutate(postId, {
      onSuccess: () => onClose(),
      // Somebody restored it already: the page has reloaded into the live state, nothing to report.
      onError: (e) => {
        if (isNotRemoved(e)) onClose();
      },
    });
  };
  const failed = restore.isError && !isNotRemoved(restore.error);
  return (
    <ConfirmSheet
      open={open}
      onClose={() => {
        restore.reset();
        onClose();
      }}
      tone="default"
      title={t('adminPosts.restore.title')}
      message={othersHide ? t('adminPosts.restore.messageHidden') : t('adminPosts.restore.message')}
      confirmLabel={t('adminPosts.restore.action')}
      confirmDisabled={!online}
      busy={restore.isPending}
      status={failed ? 'error' : restore.isPending ? 'busy' : 'idle'}
      onRetry={run}
      onConfirm={run}
    />
  );
}

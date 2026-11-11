import { useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { useOnline } from '../plans/useOnline';
import { decideReports } from './marketplace/adminPostsApi';
import { groupCases, reportersKey, type ReportRow } from './marketplace/reportCases';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { Chip, ChipRow } from '../../ui/primitives/ChipRow';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Section, SectionHeader } from '../../ui/data/SectionHeader';
import { Rule } from '../../ui/data/Rule';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';

export const REPORT_STATUSES = ['open', 'triaged', 'upheld', 'rejected'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** The `?status=` of the page: one of the four words, `open` when absent or anything else. */
export function reportStatusOf(raw: string | null): ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as ReportStatus) : 'open';
}

/** The page's search for a status (and a report): `open` is the default and is not written. */
export function reportSearch(status: ReportStatus, report?: number): string {
  const params = new URLSearchParams();
  if (status !== 'open') params.set('status', status);
  if (report !== undefined) params.set('report', String(report));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** One read of the queue per status, shared by the list and the report page (same cache key). */
function useReports(status: ReportStatus) {
  return useQuery({
    queryKey: ['admin-marketplace-reports', status],
    queryFn: () =>
      apiWithRefresh<{ reports: ReportRow[] }>(`/admin/marketplace/reports?status=${encodeURIComponent(status)}`),
  });
}

/** "2026. 10. 15. 18:42": the instant a report was filed, to the minute, in the reader's language. */
function useReportedAt() {
  const { i18n } = useTranslation();
  return (unixSeconds: number) =>
    new Date(unixSeconds * 1000).toLocaleString(i18n.language, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
}

/** A report's subject: the post's title, or the reported profile. */
const subjectOf = (r: ReportRow) => (r.postId ? r.postTitle : `@${r.profileHandle} · ${r.profileName}`);

/**
 * The marketplace moderation queue (admin-view-3).
 *
 * ═══ WHAT THIS SCREEN DELIBERATELY DOES NOT SHOW ═══════════════════════════════════════════════
 *
 * There is no reporter here — not a name, not an id, not a count of how many times one person
 * filed. The server's projection omits it and this screen could not display it if it wanted to.
 * A moderator judging content does not need to know who objected, and a queue that shows it invites
 * the decision to be about them instead of about the content.
 *
 * What IS shown is `distinctReporters`: how many DIFFERENT people objected. That is the number that
 * means something, and it is the reason a duplicate report from one person replays instead of
 * adding a row.
 *
 * ═══ THE QUEUE IS DOORS; THE CASE IS A PAGE (design round A, fix 3) ════════════════════════════
 *
 * The status filter as lime-marked words (the count of open reports stands in the page's switch
 * now, admin-market-v2-reports — this queue has no head of its own), and each report as one row
 * that opens it: the subject, the reason and the reporter count, the mono date,
 * the chevron. The snapshot, the live-page link, the reporter's note and the decision stand on the
 * pushed report page (`MarketplaceReport`, admin-view-3-report). No pill on this page.
 */
export function MarketplaceQueue({ status, onStatus }: { status: ReportStatus; onStatus: (s: ReportStatus) => void }) {
  const { t } = useTranslation();
  const reportedAt = useReportedAt();
  const queue = useReports(status);
  const cases = useMemo(() => groupCases(queue.data?.reports ?? []), [queue.data]);

  return (
    <section className="flex flex-col gap-6" aria-label={t('admin.marketplace.title')}>
      {/* 16 between the words, as admin-view-3 sets them: the four statuses then fit the 354 measure
          (the kit line is 24 apart); a longer locale still scrolls sideways inside the line. */}
      <ChipRow label={t('admin.marketplace.title')} scroll="bleed" className="gap-x-4">
        {REPORT_STATUSES.map((s) => (
          <Chip key={s} selected={status === s} onClick={() => onStatus(s)}>
            {t(`admin.marketplace.status.${s}`)}
          </Chip>
        ))}
      </ChipRow>

      {queue.isPending ? (
        <div role="status">
          <span className="sr-only">{t('common.loading')}</span>
          <RowStack as="div" aria-hidden open>
            {[0, 1, 2].map((i) => (
              <ListRowSkeleton key={i} sub index={i} />
            ))}
          </RowStack>
        </div>
      ) : cases.length > 0 ? (
        <RowStack open close aria-label={t('admin.marketplace.title')}>
          {cases.map((c) => (
            <ListRow
              key={c.key}
              to={{ search: reportSearch(status, c.head.id) }}
              title={subjectOf(c.head)}
              lines={2}
              // The frame's row stands 91 high (admin-market-v2-reports), the old queue's 83 (review S-admin-posts 4): 14 above and below, not 10.
              className="py-3.5"
              sub={
                <>
                  {/* How many DIFFERENT people, not how many reports. One person filing five times
                      is one person, and the server makes that true by replaying their duplicates. */}
                  <span className="block truncate">
                    {t(`admin.marketplace.reason.${c.head.reason}`, { defaultValue: c.head.reason })}
                    {' · '}
                    {t(reportersKey(c.reporters), { count: c.reporters })}
                  </span>
                  <span className="mt-0.5 block truncate text-data text-text-3">{reportedAt(c.at)}</span>
                </>
              }
              subLines={2}
              chevron
            />
          ))}
        </RowStack>
      ) : (
        // Also where a failed read lands (as before).
        <EmptyState title={t('admin.marketplace.emptyTitle')} body={t('admin.marketplace.emptyBody')} />
      )}
    </section>
  );
}

/**
 * One marketplace report, pushed from its queue row (admin-view-3-report): "‹ PIACTÉR / Bejelentés".
 *
 * The subject with its reason, reporter count and mono date, the live-page link; the text AS
 * REPORTED; then DÖNTÉS — the removal reason with its hint, the internal note, the one lime pill
 * "Helybenhagyás és eltávolítás" and "Elutasítás" as text. There is no "Mégse": the back control
 * leaves the page, and a decided case leaves it too.
 *
 * ═══ AND WHAT IT SHOWS THAT THE LIVE PAGE NO LONGER DOES ═══════════════════════════════════════
 *
 * The snapshot is the text as it was WHEN REPORTED. An author who edits after a complaint does not
 * get to change what the moderator is looking at — and the moment a case closes, the server destroys
 * that copy, which a trigger enforces. This page is the only place it is ever displayed.
 *
 * ═══ WHY A SEARCH PARAMETER AND NOT A ROUTE ════════════════════════════════════════════════════
 *
 * The server has no read of one report; the case is a row of the status list it was opened from, so
 * the page lives at `/admin/marketplace?report=<id>` (with the list's `status`) and reads the same
 * cached list. The admin bar keeps Piactér lit, and a report that is no longer in its list (decided
 * by somebody else, or a stale link) sends the reader back to the list.
 */
export function MarketplaceReport({ id, status }: { id: number; status: ReportStatus }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const reportedAt = useReportedAt();
  const online = useOnline();
  const queue = useReports(status);
  const report = queue.data?.reports.find((r) => r.id === id);
  // The case: every report of this reason on this subject. Deciding it decides all of them (one act, as on the post page).
  const reportCase = useMemo(() => groupCases(queue.data?.reports ?? []).find((c) => c.ids.includes(id)), [queue.data, id]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const decideId = useId();

  // Back to the list it was opened from: the history step when there is one inside the app (the
  // row pushed this page), the list itself when the page was opened by its address.
  const leave = () => {
    if (location.key !== 'default') void navigate(-1);
    else void navigate({ search: reportSearch(status) }, { replace: true });
  };

  const resolve = useMutation({
    // NEVER queued while offline: a decision is made now or it fails and says so (review S-admin-moderation 2, same cause).
    networkMode: 'always',
    mutationFn: (v: { status: 'upheld' | 'rejected'; removalReason: string | null; note: string | null }) =>
      decideReports(reportCase?.ids ?? [id], v.status, v.removalReason, v.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-marketplace-reports'] });
      void qc.invalidateQueries({ queryKey: ['admin-marketplace-posts'] });
      void qc.invalidateQueries({ queryKey: ['admin-marketplace-post'] });
      leave();
    },
  });

  const missing = !queue.isPending && !report && !resolve.isSuccess;
  useEffect(() => {
    if (missing) void navigate({ search: reportSearch(status) }, { replace: true });
  }, [missing, navigate, status]);

  const decidable = report && (report.status === 'open' || report.status === 'triaged');

  return (
    <Screen top="push" width="wide">
      <ScreenHeader
        kind="push"
        title={t('admin.marketplace.report')}
        back={{ onClick: leave, label: t('admin.section.marketplace') }}
      />

      {!report ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="text-title text-text-1">{subjectOf(report)}</h2>
            <p className="text-cap text-text-2">
              {t(`admin.marketplace.reason.${report.reason}`, { defaultValue: report.reason })}
              {' · '}
              {t(reportersKey(reportCase?.reporters ?? 1), { count: reportCase?.reporters ?? 1 })}
            </p>
            <p className="text-data text-text-3">{reportedAt(reportCase?.at ?? report.createdAt)}</p>
            {/* The reporter's own words, when they wrote any: kept from the old queue (behaviour
                wins, Q4); the frame's sample report has none. */}
            {report.note ? <p className="mt-3 text-body text-text-2">{report.note}</p> : null}
            {report.postId ? (
              <>
                {/* The inspect page of the post: its history and the other reports are one tap away (review S-admin-posts 10). */}
                <TextLink to={`/admin/marketplace/posts/${report.postId}`} trail={<ChevronRight />} className="self-start">
                  {t('adminPosts.openPost')}
                </TextLink>
                <TextLink
                  href={`/m/p/${report.postId}`}
                  target="_blank"
                  rel="noreferrer"
                  lead={<ExternalLink />}
                  className="self-start"
                >
                  {t('admin.marketplace.openLive')}
                </TextLink>
              </>
            ) : null}
          </div>

          {/* The text AS REPORTED. The live page may say something else by now, and that is the
              point of keeping a copy until the case closes. */}
          {report.snapshot ? (
            <Section title={t('admin.marketplace.snapshot')}>
              <p className="text-body whitespace-pre-wrap text-text-1">{report.snapshot}</p>
              {report.snapshotTruncated === 1 ? (
                <p className="text-cap text-text-3">{t('admin.marketplace.snapshotTruncated')}</p>
              ) : null}
            </Section>
          ) : null}

          {decidable ? (
            // admin-view-3-report draws this section 24 apart throughout (kit sect with gap 24): the
            // strong rule, 24, the eyebrow, 24, the form — not the 16 of a default section head.
            <section aria-labelledby={decideId} className="flex w-full flex-col gap-6">
              <Rule strong />
              <SectionHeader rule={false} title={t('admin.marketplace.decide')} titleId={decideId} />
              <div className="flex flex-col gap-6">
                <Field
                  label={t('admin.marketplace.removalReason')}
                  value={reason}
                  maxLength={2000}
                  onChange={(e) => setReason(e.target.value)}
                  hint={t('admin.marketplace.removalReasonHint')}
                />
                <Field
                  label={t('admin.marketplace.resolutionNote')}
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex flex-col gap-2 pt-2">
                  {/* Upholding WITH a removal is one act on the server: the report closes and the
                      content comes down inside one transaction, so there is no moment where the
                      case reads as handled and the post is still public. */}
                  <Pressable
                    variant="primary"
                    size="lg"
                    className="w-full"
                    busy={resolve.isPending}
                    disabled={reason.trim().length === 0 || !online}
                    onClick={() => resolve.mutate({ status: 'upheld', removalReason: reason, note: note || null })}
                  >
                    {t('admin.marketplace.upholdAndRemove')}
                  </Pressable>
                  {reason.trim().length === 0 ? (
                    <p className="text-center text-cap text-text-3">{t('admin.marketplace.reasonRequired')}</p>
                  ) : null}
                  <TextLink
                    text="body"
                    className="self-center"
                    busy={resolve.isPending}
                    disabled={!online}
                    onClick={() => resolve.mutate({ status: 'rejected', removalReason: null, note: note || null })}
                  >
                    {t('admin.marketplace.reject')}
                  </TextLink>
                  {resolve.isError ? (
                    <NoticeLine tone="danger" role="alert">
                      {t(online ? 'adminPosts.errorBody' : 'adminUsers.err.offline')}
                    </NoticeLine>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

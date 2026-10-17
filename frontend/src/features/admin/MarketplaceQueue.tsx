import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { Chip, ChipRow } from '../../ui/primitives/ChipRow';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { SectionHeader } from '../../ui/data/SectionHeader';

interface ReportRow {
  id: number;
  reason: string;
  note: string | null;
  snapshot: string | null;
  snapshotTruncated: 0 | 1;
  status: string;
  createdAt: number;
  postId: string | null;
  postTitle: string | null;
  profileHandle: string | null;
  profileName: string | null;
  authorHandle: string | null;
  severity: number;
  distinctReporters: number;
}

/**
 * The marketplace moderation queue.
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
 * ═══ AND WHAT IT SHOWS THAT THE LIVE PAGE NO LONGER DOES ═══════════════════════════════════════
 *
 * The snapshot is the text as it was WHEN REPORTED. An author who edits after a complaint does not
 * get to change what the moderator is looking at — and the moment a case closes, the server destroys
 * that copy, which a trigger enforces. This screen is the only place it is ever displayed.
 *
 * ═══ UNDRAWN: THE MODERATION GRAMMAR, NOTHING HIDDEN BEHIND A NEW TAP ══════════════════════════
 *
 * No frame draws this tab. It is built in the language of the Moderáció tab beside it: the eyebrow,
 * the status filter as lime-marked words (a filter changes the subject), and each report as a ruled
 * block — the subject as the row's title, the reason and the reporter count, the date in mono —
 * with the live-page link, the reporter's note and the snapshot under it. Nothing is enclosed. The
 * note and the snapshot stay visible without a tap, as before (behaviour wins, Q4); the decision is
 * the one step behind "Döntés", and its form carries this tab's only pill.
 */
export function MarketplaceQueue() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'triaged' | 'upheld' | 'rejected'>('open');
  const [openId, setOpenId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const queue = useQuery({
    queryKey: ['admin-marketplace-reports', status],
    queryFn: () =>
      apiWithRefresh<{ reports: ReportRow[] }>(
        `/admin/marketplace/reports?status=${encodeURIComponent(status)}`,
      ),
  });

  const resolve = useMutation({
    mutationFn: (v: { id: number; status: string; remove: boolean; removalReason: string | null; note: string | null }) =>
      apiWithRefresh(`/admin/marketplace/reports/${v.id}/resolve`, {
        method: 'POST',
        body: { status: v.status, note: v.note, remove: v.remove, removal_reason: v.removalReason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-marketplace-reports'] });
      setOpenId(null);
      setReason('');
      setNote('');
    },
  });

  const statuses = ['open', 'triaged', 'upheld', 'rejected'] as const;

  return (
    <section className="flex flex-col gap-4" aria-label={t('admin.marketplace.title')}>
      <SectionHeader rule={false} title={t('admin.marketplace.title')} />
      <ChipRow label={t('admin.marketplace.title')} scroll="bleed">
        {statuses.map((s) => (
          <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>
            {t(`admin.marketplace.status.${s}`)}
          </Chip>
        ))}
      </ChipRow>

      {queue.isPending ? (
        <div role="status">
          <span className="sr-only">{t('common.loading')}</span>
          <RowStack as="div" aria-hidden>
            {[0, 1].map((i) => (
              <ListRowSkeleton key={i} sub index={i} />
            ))}
          </RowStack>
        </div>
      ) : queue.data && queue.data.reports.length > 0 ? (
        <RowStack close aria-label={t('admin.marketplace.title')}>
          {queue.data.reports.map((r) => (
            <div key={r.id} className="flex flex-col gap-4 pb-6">
              <ListRow
                title={r.postId ? r.postTitle : `@${r.profileHandle} · ${r.profileName}`}
                sub={
                  <>
                    {/* How many DIFFERENT people, not how many reports. One person filing five
                        times is one person, and the server makes that true by replaying their
                        duplicates. */}
                    <span className="block truncate">
                      {t(`admin.marketplace.reason.${r.reason}`, { defaultValue: r.reason })}
                      {' · '}
                      {t('admin.marketplace.reporters', { count: r.distinctReporters })}
                    </span>
                    <span className="mt-0.5 block truncate text-data">
                      {new Date(r.createdAt * 1000).toLocaleString(i18n.language)}
                    </span>
                  </>
                }
                subLines={2}
              />

              {r.postId ? (
                <TextLink href={`/m/p/${r.postId}`} target="_blank" rel="noreferrer" lead={<ExternalLink />} className="self-start">
                  {t('admin.marketplace.openLive')}
                </TextLink>
              ) : null}

              {r.note ? <p className="text-body text-text-2">{r.note}</p> : null}

              {/* The text AS REPORTED. The live page may say something else by now, and that is the
                  point of keeping a copy until the case closes. */}
              {r.snapshot ? (
                <div className="flex flex-col gap-4">
                  <SectionHeader rule={false} heading="h3" title={t('admin.marketplace.snapshot')} />
                  <p className="text-body whitespace-pre-wrap text-text-1">{r.snapshot}</p>
                  {r.snapshotTruncated === 1 ? (
                    <p className="text-cap text-text-3">{t('admin.marketplace.snapshotTruncated')}</p>
                  ) : null}
                </div>
              ) : null}

              {openId === r.id ? (
                <div className="flex flex-col gap-6 pt-2">
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
                  <div className="flex flex-col items-start gap-2">
                    {/* Upholding WITH a removal is one act on the server: the report closes and the
                        content comes down inside one transaction, so there is no moment where the
                        case reads as handled and the post is still public. */}
                    <Pressable
                      variant="primary"
                      size="lg"
                      className="w-full"
                      busy={resolve.isPending}
                      disabled={reason.trim().length === 0}
                      onClick={() =>
                        resolve.mutate({ id: r.id, status: 'upheld', remove: true, removalReason: reason, note: note || null })
                      }
                    >
                      {t('admin.marketplace.upholdAndRemove')}
                    </Pressable>
                    {reason.trim().length === 0 ? (
                      <p className="text-cap text-text-3">{t('admin.marketplace.reasonRequired')}</p>
                    ) : null}
                    <div className="flex items-center gap-6">
                      <TextLink
                        text="body"
                        busy={resolve.isPending}
                        onClick={() =>
                          resolve.mutate({ id: r.id, status: 'rejected', remove: false, removalReason: null, note: note || null })
                        }
                      >
                        {t('admin.marketplace.reject')}
                      </TextLink>
                      <TextLink text="body" tone="quiet" onClick={() => setOpenId(null)}>
                        {t('admin.marketplace.cancel')}
                      </TextLink>
                    </div>
                  </div>
                </div>
              ) : r.status === 'open' || r.status === 'triaged' ? (
                <TextLink text="body" className="self-start" onClick={() => setOpenId(r.id)}>
                  {t('admin.marketplace.decide')}
                </TextLink>
              ) : null}
            </div>
          ))}
        </RowStack>
      ) : (
        // Also where a failed read lands (as before).
        <EmptyState title={t('admin.marketplace.emptyTitle')} body={t('admin.marketplace.emptyBody')} />
      )}
    </section>
  );
}

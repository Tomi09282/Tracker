import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, ExternalLink } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

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

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title-3 text-text-1">{t('admin.marketplace.title')}</h2>
        <ul className="flex flex-wrap gap-1">
          {(['open', 'triaged', 'upheld', 'rejected'] as const).map((s) => (
            <li key={s}>
              <Pressable
                variant={status === s ? 'primary' : 'secondary'}
                density="compact"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
              >
                {t(`admin.marketplace.status.${s}`)}
              </Pressable>
            </li>
          ))}
        </ul>
      </div>

      {queue.isPending ? (
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : queue.data && queue.data.reports.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {queue.data.reports.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption rounded-chip bg-surface-3 px-2 py-1 text-text-1">
                  {t(`admin.marketplace.reason.${r.reason}`, { defaultValue: r.reason })}
                </span>
                {/* How many DIFFERENT people, not how many reports. One person filing five times is
                    one person, and the server makes that true by replaying their duplicates. */}
                <span className="text-caption text-text-3">
                  {t('admin.marketplace.reporters', { count: r.distinctReporters })}
                </span>
                <span className="text-caption text-text-3">
                  {new Date(r.createdAt * 1000).toLocaleString(i18n.language)}
                </span>
              </div>

              <p className="text-body text-text-1">
                {r.postId ? r.postTitle : `@${r.profileHandle} · ${r.profileName}`}
              </p>

              {r.postId ? (
                <a
                  href={`/m/p/${r.postId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-body-s flex min-h-[var(--target-min)] items-center gap-1 text-accent"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  {t('admin.marketplace.openLive')}
                </a>
              ) : null}

              {r.note ? <p className="text-body-s text-text-2">{r.note}</p> : null}

              {/* The text AS REPORTED. The live page may say something else by now, and that is the
                  point of keeping a copy until the case closes. */}
              {r.snapshot ? (
                <div className="rounded-field bg-surface-3 p-2">
                  <p className="text-caption text-text-3">{t('admin.marketplace.snapshot')}</p>
                  <p className="text-body-s whitespace-pre-wrap text-text-1">{r.snapshot}</p>
                  {r.snapshotTruncated === 1 ? (
                    <p className="text-caption mt-1 text-text-3">{t('admin.marketplace.snapshotTruncated')}</p>
                  ) : null}
                </div>
              ) : null}

              {openId === r.id ? (
                <div className="flex flex-col gap-2 border-t border-line pt-2">
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
                  <div className="flex flex-wrap gap-2">
                    {/* Upholding WITH a removal is one act on the server: the report closes and the
                        content comes down inside one transaction, so there is no moment where the
                        case reads as handled and the post is still public. */}
                    <Pressable
                      variant="primary"
                      busy={resolve.isPending}
                      disabled={reason.trim().length === 0}
                      onClick={() =>
                        resolve.mutate({ id: r.id, status: 'upheld', remove: true, removalReason: reason, note: note || null })
                      }
                    >
                      {t('admin.marketplace.upholdAndRemove')}
                    </Pressable>
                    <Pressable
                      variant="secondary"
                      busy={resolve.isPending}
                      onClick={() => resolve.mutate({ id: r.id, status: 'rejected', remove: false, removalReason: null, note: note || null })}
                    >
                      {t('admin.marketplace.reject')}
                    </Pressable>
                    <Pressable variant="secondary" onClick={() => setOpenId(null)}>
                      {t('admin.marketplace.cancel')}
                    </Pressable>
                  </div>
                  {reason.trim().length === 0 ? (
                    <p className="text-caption text-text-3">{t('admin.marketplace.reasonRequired')}</p>
                  ) : null}
                </div>
              ) : r.status === 'open' || r.status === 'triaged' ? (
                <Pressable variant="secondary" onClick={() => setOpenId(r.id)}>
                  {t('admin.marketplace.decide')}
                </Pressable>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <EmptyState
            icon={ShieldAlert}
            title={t('admin.marketplace.emptyTitle')}
            body={t('admin.marketplace.emptyBody')}
          />
        </div>
      )}
    </section>
  );
}

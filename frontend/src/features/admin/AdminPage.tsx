import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Users, Dumbbell, Image, ShieldCheck, Languages, Check, X, Palette } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { apiWithRefresh } from '../../lib/api';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { CountUp } from '../../ui/feedback/CountUp';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { useSession } from '../auth/useSession';
import { MarketplaceQueue } from './MarketplaceQueue';
import { AdminMetrics } from './AdminMetrics';
import { DataTable } from '../../ui/data/DataTable';
import { UserSearch } from './UserSearch';

interface Stats {
  users: { total: number; coaches: number; admins: number; disabled: number; new_7d: number };
  exercises: { total: number; global: number; private: number; custom: number };
  media: { total: number; bytes: number };
  moderation: { pending: number };
  translations: { rows: number; langs: number };
  sessions: { active: number };
  audit: { events_24h: number };
}

interface QueueItem {
  id: number;
  name: string;
  owner_email: string | null;
  submitted_at: number;
  difficulty: string | null;
  media_count: number;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-chip bg-accent-subtle text-accent">
          <Icon size={20} strokeWidth={2} aria-hidden />
        </span>
        <span className="text-micro uppercase text-text-3">{label}</span>
      </div>
      <p className="text-display mt-3 text-text-1">
        <CountUp to={value} />
      </p>
      {sub ? <p className="text-caption mt-1 text-text-3">{sub}</p> : null}
    </div>
  );
}

/**
 * Admin — Bible blueprint 10: stat cards with odometer numbers, then a dense table with a
 * sticky header and row hover, inside the 1120px wide column.
 *
 * This screen is F8-lite. The full admin, including the Element Style Studio, is Phase 7.
 */
export function AdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: user } = useSession();
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiWithRefresh<Stats>('/admin/stats'),
    enabled: user?.role === 'admin',
  });

  const queue = useQuery({
    queryKey: ['admin', 'moderation'],
    queryFn: () => apiWithRefresh<{ queue: QueueItem[] }>('/admin/moderation'),
    enabled: user?.role === 'admin',
  });

  const decide = useMutation({
    mutationFn: (v: { id: number; decision: 'approve' | 'reject'; reason?: string }) =>
      apiWithRefresh(`/admin/moderation/${v.id}`, {
        method: 'POST',
        body: { decision: v.decision, ...(v.reason ? { reason: v.reason } : {}) },
      }),
    onSuccess: () => {
      setRejecting(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  // The server enforces this too — this is only so a non-admin sees an explanation instead of
  // a screen full of failed requests.
  if (user && user.role !== 'admin') {
    return (
      <div className="col-wide screen-x py-6">
        {/* `heading="h1"` because this IS the page for a non-admin — the whole route renders
            nothing else, and a page with no `h1` is one a screen-reader user cannot navigate
            into. Found by the Phase 1 E2E walk at 360 px, same defect class as /workout. */}
        <EmptyState
          icon={ShieldCheck}
          title={t('admin.forbiddenTitle')}
          body={t('admin.forbiddenBody')}
          heading="h1"
        />
      </div>
    );
  }

  return (
    <div className="col-wide screen-x py-6">
      <p className="text-micro uppercase text-accent">{t('admin.eyebrow')}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title-1 text-text-1">{t('admin.title')}</h1>
        {/* A real anchor, not a button that navigates: the studio is a page, and a page you can
            open in a new tab or middle-click is a page. */}
        <Link
          to="/admin/styles"
          className="text-body-s flex min-h-[var(--target-min)] items-center gap-1.5 text-accent"
        >
          <Palette className="size-4" aria-hidden />
          {t('admin.styleStudio')}
        </Link>
      </div>

      {stats.isPending ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-card" />
          ))}
        </div>
      ) : stats.data ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label={t('admin.users')}
            value={stats.data.users.total}
            sub={t('admin.usersSub', { coaches: stats.data.users.coaches, new: stats.data.users.new_7d })}
          />
          <StatCard
            icon={Dumbbell}
            label={t('admin.exercises')}
            value={stats.data.exercises.total}
            sub={t('admin.exercisesSub', { global: stats.data.exercises.global, custom: stats.data.exercises.custom })}
          />
          <StatCard
            icon={Languages}
            label={t('admin.translations')}
            value={stats.data.translations.rows}
            sub={t('admin.translationsSub', { langs: stats.data.translations.langs })}
          />
          <StatCard
            icon={Image}
            label={t('admin.media')}
            value={stats.data.media.total}
            sub={`${(stats.data.media.bytes / 1024 / 1024).toFixed(1)} MB`}
          />
        </div>
      ) : null}

      <AdminMetrics enabled={user?.role === 'admin'} />

      <UserSearch enabled={user?.role === 'admin'} />

      <section className="mt-8">
        <div className="flex items-baseline gap-2">
          <h2 className="text-title-3 text-text-1">{t('admin.moderation')}</h2>
          {stats.data ? (
            <span className="text-caption tabular-nums text-text-3">
              {t('admin.pendingCount', { count: stats.data.moderation.pending })}
            </span>
          ) : null}
        </div>

        {queue.isPending ? (
          <Skeleton className="mt-3 h-40 rounded-card" />
        ) : (queue.data?.queue.length ?? 0) === 0 ? (
          <div className="mt-3 rounded-card border border-[var(--surface-border)] bg-surface-1">
            <EmptyState icon={Check} title={t('admin.queueEmptyTitle')} body={t('admin.queueEmptyBody')} />
          </div>
        ) : (
          <div className="mt-3">
            <DataTable
              caption={t('admin.moderation')}
              rows={queue.data!.queue}
              rowKey={(row) => row.id}
              columns={[
                { key: 'name', header: t('admin.col.name'), render: (row) => row.name },
                {
                  key: 'owner',
                  header: t('admin.col.owner'),
                  render: (row) => <span className="text-text-2">{row.owner_email ?? '—'}</span>,
                },
                { key: 'media', header: t('admin.col.media'), numeric: true, render: (row) => row.media_count },
                {
                  key: 'actions',
                  header: t('admin.col.actions'),
                  render: (row) =>
                    rejecting === row.id ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <Field
                          label={t('admin.reason')}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="w-56"
                        />
                        <Pressable
                          variant="danger"
                          density="compact"
                          disabled={reason.trim().length === 0}
                          busy={decide.isPending}
                          onClick={() => decide.mutate({ id: row.id, decision: 'reject', reason })}
                        >
                          {t('admin.reject')}
                        </Pressable>
                        <Pressable density="compact" variant="ghost" onClick={() => setRejecting(null)}>
                          {t('common.cancel')}
                        </Pressable>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Pressable
                          variant="primary"
                          density="compact"
                          busy={decide.isPending}
                          icon={<Check size={20} strokeWidth={2} aria-hidden />}
                          onClick={() => decide.mutate({ id: row.id, decision: 'approve' })}
                        >
                          {t('admin.approve')}
                        </Pressable>
                        {/* Destructive action: never in the primary position, and it cannot fire
                            without a reason the author can act on. */}
                        <Pressable
                          variant="ghost"
                          density="compact"
                          icon={<X size={20} strokeWidth={2} aria-hidden />}
                          onClick={() => {
                            setRejecting(row.id);
                            setReason('');
                          }}
                        >
                          {t('admin.reject')}
                        </Pressable>
                      </div>
                    ),
                },
              ]}
            />
          </div>
        )}
      </section>

      <MarketplaceQueue />

      {stats.data ? (
        <p className={cn('text-caption mt-6 text-text-3')}>
          {t('admin.footer', {
            sessions: stats.data.sessions.active,
            events: stats.data.audit.events_24h,
          })}
        </p>
      ) : null}
    </div>
  );
}

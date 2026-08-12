import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Users, Dumbbell, Image, ShieldCheck, Languages, Palette, Activity, Globe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { apiWithRefresh } from '../../lib/api';
import { CountUp } from '../../ui/feedback/CountUp';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { useSession } from '../auth/useSession';
import { MarketplaceQueue } from './MarketplaceQueue';
import { ModerationQueue } from './ModerationQueue';
import { AdminMetrics } from './AdminMetrics';
import { AdminShell } from './AdminShell';
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
  const { data: user } = useSession();
  // Which panel is open. Local state rather than a route: these are four views of one screen, and
  // a URL per view would mean four routes the palette and the router both have to know about.
  const [section, setSection] = useState('overview');

  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiWithRefresh<Stats>('/admin/stats'),
    enabled: user?.role === 'admin',
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

      {/*
        Four sections behind a rail rather than four stacked on one page.

        Stacked, an admin arriving to answer "is this account disabled" scrolled past a metrics
        grid, four charts and a moderation table to reach the search box — and every one of those
        fetched on arrival. Behind a rail, the section that is not open does not render, so it does
        not fetch either: `render` is a function for that reason, not a node.
      */}
      <AdminShell
        sections={[
          {
            key: 'overview',
            icon: Activity,
            render: () => <AdminMetrics enabled={user?.role === 'admin'} />,
          },
          {
            key: 'accounts',
            icon: Users,
            render: () => <UserSearch enabled={user?.role === 'admin'} />,
          },
          {
            key: 'moderation',
            icon: ShieldCheck,
            badge: stats.data?.moderation.pending || undefined,
            render: () => (
              <>
      <section className="mt-8">
        <div className="flex items-baseline gap-2">
          <h2 className="text-title-3 text-text-1">{t('admin.moderation')}</h2>
          {stats.data ? (
            <span className="text-caption tabular-nums text-text-3">
              {t('admin.pendingCount', { count: stats.data.moderation.pending })}
            </span>
          ) : null}
        </div>

        {/* The queue AND the decision live here now. They used to be a table in this file whose
            row carried Approve — see the header comment in ModerationQueue for why that moved. */}
        <ModerationQueue />
      </section>
              </>
            ),
          },
          {
            key: 'marketplace',
            icon: Globe,
            render: () => <MarketplaceQueue />,
          },
        ]}
        active={section}
        onSelect={setSection}
      />

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

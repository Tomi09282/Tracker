import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Users, Dumbbell, Image, ShieldCheck, Palette, Globe, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { apiWithRefresh } from '../../lib/api';
import { CountUp } from '../../ui/feedback/CountUp';
import { Gauge } from '../../ui/feedback/Gauge';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Surface } from '../../ui/primitives/Surface';
import { Pressable } from '../../ui/primitives/Pressable';
import { SummaryTile } from '../../ui/data/SummaryTile';
import { useSession } from '../auth/useSession';
import { MarketplaceQueue } from './MarketplaceQueue';
import { ModerationQueue } from './ModerationQueue';
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

/**
 * ═══ THE ARCS PARTITION BY ROLE, AND THAT IS THE WHOLE POINT ═══════════════════════════════════
 *
 * A donut claims its arcs add up to the hole. The obvious three — members, coaches, new this week —
 * do not: `users.new_7d` counts everyone who registered in the last seven days, so a coach who
 * signed up on Tuesday is in TWO of them, and `total − coaches − new` would silently redefine
 * "coaches" as "coaches who did not join this week".
 *
 * `role` is one column on `users` — the server counts `SUM(role = 'coach')` and `SUM(role =
 * 'admin')` off it — so member / coach / admin are disjoint by construction and sum to the total
 * exactly. That is a partition the picture can honestly make, and it is also the one an admin
 * actually reads: who is on the platform, in what capacity.
 *
 * `new_7d` is a rate, not a slice, and a rate belongs on a trend, not in a ring.
 */
const ARC_COLOR = ['var(--accent)', 'var(--text-2)', 'var(--text-3)'] as const;

function UserDonut({ users }: { users: Stats['users'] }) {
  const { t } = useTranslation();

  const members = Math.max(0, users.total - users.coaches - users.admins);
  const slices = [
    { key: 'user', label: t('adminUsers.role.user'), count: members, color: ARC_COLOR[0] },
    { key: 'coach', label: t('adminUsers.role.coach'), count: users.coaches, color: ARC_COLOR[1] },
    { key: 'admin', label: t('adminUsers.role.admin'), count: users.admins, color: ARC_COLOR[2] },
  ];

  return (
    <Surface as="section" className="flex flex-col items-center gap-group">
      <Gauge
        className="aspect-square w-full max-w-72"
        label={t('admin.users')}
        thickness={0.14}
        /* A CLOSED track, unlike every other gauge in the app. The open bottom exists so a single
           near-full arc does not read as a plain circle outline; here three coloured arcs already
           say "donut", and a hole at six o'clock would take a slice out of a total that is
           supposed to be whole.
           This governs only the ZERO-SEGMENT fallback track: with segments, `Gauge` takes its
           donut branch and carves an even seam out of each arc's own end, which is the separation
           the design asks for between adjacent slices. */
        gap={0}
        segments={
          users.total > 0
            ? slices.map((s) => ({ value: s.count / users.total, color: s.color, label: s.label }))
            : []
        }
      >
        <span className="flex flex-col items-center">
          <span className="text-display font-display tabular-nums text-text-1">
            <CountUp to={users.total} />
          </span>
          <span className="text-body-s text-text-2">{t('admin.users')}</span>
        </span>
      </Gauge>

      <ul className="flex flex-wrap items-center justify-center gap-group">
        {slices.map((s) => (
          <li key={s.key} className="text-caption flex items-center gap-tight text-text-2">
            <span aria-hidden className="size-2 shrink-0 rounded-chip" style={{ backgroundColor: s.color }} />
            {s.label}
            <span className="tabular-nums text-text-1">{s.count}</span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/**
 * The moderation panel's own header — an icon tile, the heading with its waiting count under it,
 * and the refresh control.
 *
 * ═══ WHY THE REFRESH BUTTON IS NEW ═════════════════════════════════════════════════════════════
 *
 * The queue only ever refetched as a side effect of a decision. So the one state that is REACHED by
 * doing nothing — somebody else decided a submission while this list sat on screen, and opening it
 * now 404s — had no way out except a full page reload. `admin.reviewGoneBody` literally instructs
 * the admin to "refresh the list", and until now there was nothing to press.
 */
function ModerationHeader({ pending }: { pending?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['admin', 'moderation'] }) > 0;

  return (
    <div className="flex items-center gap-tight">
      <span
        aria-hidden
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-accent-subtle text-accent"
      >
        <ShieldCheck className="size-icon-m" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-title-3 text-text-1">{t('admin.moderation')}</h2>
        {/* A count, and only when there IS one — never a grey zero, which reads both as an empty
            queue and as a badge that is broken. */}
        {pending ? (
          <p className="text-caption tabular-nums text-text-3">
            {t('admin.pendingCount', { count: pending })}
          </p>
        ) : null}
      </div>
      <Pressable
        shape="icon"
        variant="secondary"
        /* `common.retry` — "Újra" — is a stand-in. This control wants its own key; see the note in
           the handover. It is the ONLY name a screen-reader user gets for the button. */
        aria-label={t('common.retry')}
        busy={fetching}
        onClick={() => void qc.invalidateQueries({ queryKey: ['admin', 'moderation'] })}
      >
        <RefreshCw
          className={cn('size-icon-m', fetching && 'animate-spin motion-reduce:animate-none')}
          strokeWidth={2}
          aria-hidden
        />
      </Pressable>
    </div>
  );
}

/**
 * Admin — the platform's landing screen for the one role that can change it.
 *
 * ═══ FOUR STAT CARDS BECAME A DONUT AND TWO TILES ══════════════════════════════════════════════
 *
 * `FELHASZNÁLÓK`, `GYAKORLATOK`, `FORDÍTÁSOK`, `MÉDIAFÁJLOK` were four identical label-number-subline
 * cards in a grid — four unrelated facts, read left to right, none of them the reason anybody opened
 * this page. The user count is the one number an admin looks at twice, and what it is made of is the
 * actual question, so it became the anchor. Translation row counts were cut outright: they change
 * when somebody runs an import, which is not a thing anyone monitors.
 *
 * ═══ AND `Moderáció` IS THE SECTION THAT OPENS ═════════════════════════════════════════════════
 *
 * The badge on that pill is the only element on the screen that means "someone is waiting". The
 * overview panel that used to open by default held four more stat cards and four trend charts — a
 * metrics view, which an admin arriving to clear a queue scrolled straight past.
 */
export function AdminPage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  // Which panel is open. Local state rather than a route: these are three views of one screen, and
  // a URL per view would mean three routes the palette and the router both have to know about.
  const [section, setSection] = useState('moderation');

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
    <div className="col-wide screen-x flex flex-col gap-section py-6">
      <header className="flex flex-wrap items-center justify-between gap-group">
        <div className="min-w-0">
          <p className="text-micro uppercase text-accent">{t('admin.eyebrow')}</p>
          <h1 className="text-title-1 mt-1 text-text-1">{t('admin.title')}</h1>
        </div>
        {/* A real anchor, not a button that navigates: the studio is a page, and a page you can
            open in a new tab or middle-click is a page. */}
        <Link
          to="/admin/styles"
          className="text-body-s flex min-h-[var(--target-min)] items-center gap-2 text-accent"
        >
          <Palette className="size-icon-s" aria-hidden />
          {t('admin.styleStudio')}
        </Link>
      </header>

      {stats.isPending ? (
        // The skeletons carry the NEW geometry — a donut-proportioned card and two tile-proportioned
        // ones. A placeholder at the old four-across grid would move the whole page on swap, which
        // is the exact shift a skeleton exists to prevent.
        <div className="flex flex-col gap-section">
          <Skeleton className="h-88 w-full rounded-card" />
          <div className="grid grid-cols-2 gap-group">
            {/* 88px: card pad 16×2 + the figure/caption column (32 + 8 + 16). `layout="row"` puts
                the 44px puck beside that column rather than above it, so the tile is a row shorter
                than the 144 this placeholder used to reserve. */}
            <Skeleton className="h-22 rounded-card" />
            <Skeleton className="h-22 rounded-card" />
          </div>
        </div>
      ) : stats.data ? (
        <div className="flex flex-col gap-section">
          <UserDonut users={stats.data.users} />
          {/* Puck beside the figure, as 11-admin-attekintes.webp draws them — the donut above is the
              screen's one centred object and these two are its footnotes, not two more of it.
              Captions stay sentence case (`Gyakorlat`, `Médiafájl`): that mockup writes them that
              way, and unlike the coach tiles they name a thing counted, not a metric. */}
          <div className="grid grid-cols-2 gap-group">
            <SummaryTile
              icon={Dumbbell}
              layout="row"
              value={stats.data.exercises.total}
              caption={t('admin.exercises')}
            />
            <SummaryTile
              icon={Image}
              layout="row"
              value={stats.data.media.total}
              caption={t('admin.media')}
            />
          </div>
        </div>
      ) : null}

      {/*
        Three sections behind a pill row rather than three stacked on one page.

        Stacked, an admin arriving to answer "is this account disabled" scrolled past a moderation
        table and a marketplace queue to reach the search box — and every one of those fetched on
        arrival. Behind the row, the section that is not open does not render, so it does not fetch
        either: `render` is a function for that reason, not a node.
      */}
      <AdminShell
        sections={[
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
              <section className="flex flex-col gap-group">
                <ModerationHeader pending={stats.data?.moderation.pending} />
                {/* The queue AND the decision live here now. They used to be a table in this file
                    whose row carried Approve — see the header comment in ModerationQueue. */}
                <ModerationQueue />
              </section>
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
        // Below the fold, and kept: the cheapest liveness signal on the screen.
        <p className="text-caption text-text-3">
          {t('admin.footer', {
            sessions: stats.data.sessions.active,
            events: stats.data.audit.events_24h,
          })}
        </p>
      ) : null}
    </div>
  );
}

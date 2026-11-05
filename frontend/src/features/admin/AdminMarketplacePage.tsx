import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Screen } from '../../ui/shell/Screen';
import { hasRole, useSession } from '../auth/useSession';
import { AdminForbidden, AdminHeader } from './AdminShell';
import { MarketplaceQueue, MarketplaceReport, reportSearch, reportStatusOf } from './MarketplaceQueue';
import { useOpenReportCount } from './marketplace/adminPostsApi';
import { PostsList, postQueryOf, postStateOf } from './marketplace/PostsList';

/** A report id from the address: digits only, bounded — anything else is no report. */
const reportIdOf = (raw: string | null) => (raw && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

type View = 'reports' | 'posts';

/**
 * Piactér (`/admin/marketplace`) — the admin bar's marketplace tab.
 *
 * admin-market-v2: the admin header, the quiet two-word switch "JELENTÉSEK 4 | POSZTOK" (the count
 * of open reports sits in the switch, so the queue has no head of its own any more), and under it
 * one of two lists:
 *
 *   Jelentések  the queue as one-line doors (`?status=` the chosen filter, `?report=<id>` the pushed
 *               report page, admin-view-3-report) — as before, cleaner;
 *   Posztok     every post in every state (`?view=posts`, `?q=` the search, `?state=` the filter);
 *               a post opens its own page at `/admin/marketplace/posts/:publicId`.
 *
 * Everything the lists are filtered by lives in the address, so a list opened from, and the way back
 * to, it return to the same words. The server enforces the role on every endpoint behind it; this
 * only explains a refusal.
 */
export function AdminMarketplacePage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'posts' ? 'posts' : 'reports';
  const status = reportStatusOf(params.get('status'));
  const report = reportIdOf(params.get('report'));
  const openReports = useOpenReportCount(user ? hasRole(user, 'admin') : false);

  // A filter, a search or a view changes the subject, not the place: it replaces the address instead of pushing.
  const setPosts = useCallback(
    (next: { q?: string; state?: string }) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('view', 'posts');
          p.delete('report');
          for (const [k, v] of Object.entries(next)) {
            if (v) p.set(k, v);
            else p.delete(k);
          }
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  const onQuery = useCallback((q: string) => setPosts({ q }), [setPosts]);

  if (user && !hasRole(user, 'admin')) return <AdminForbidden />;

  if (view === 'reports' && report !== null) return <MarketplaceReport key={report} id={report} status={status} />;

  return (
    <Screen top="push" width="wide">
      {/* admin-market-v2 sets the header, the switch and the list 24 apart throughout. */}
      <div className="flex flex-col gap-6">
      <AdminHeader title={t('admin.section.marketplace')} />
      <Segmented<View>
        layout="cells"
        quiet
        label={t('adminPosts.view.label')}
        value={view}
        onChange={(v) => setParams(v === 'posts' ? new URLSearchParams({ view: 'posts' }) : new URLSearchParams(), { replace: true })}
        options={[
          { value: 'reports', label: t('adminPosts.view.reports'), count: openReports.data },
          { value: 'posts', label: t('adminPosts.view.posts') },
        ]}
      />
      {view === 'posts' ? (
        <PostsList
          q={postQueryOf(params.get('q'))}
          state={postStateOf(params.get('state'))}
          onQuery={onQuery}
          onState={(s) => setPosts({ state: s === 'all' ? '' : s })}
        />
      ) : (
        <MarketplaceQueue status={status} onStatus={(s) => setParams(new URLSearchParams(reportSearch(s)), { replace: true })} />
      )}
      </div>
    </Screen>
  );
}

import { useTranslation } from 'react-i18next';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Screen } from '../../ui/shell/Screen';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { hasRole, useSession } from '../auth/useSession';
import { ModerationQueue, useModerationQueue } from './ModerationQueue';
import { AdminForbidden, AdminHeader } from './AdminShell';
import { StatsPanel, inked } from './StatsPanel';
import { useAdminStats } from './statisticsModel';

/**
 * The moderation panel's head: the eyebrow, and ONE trailing node — the waiting count (mono, the
 * figure in ink) with the refresh glyph after it.
 *
 * ═══ WHY THE REFRESH BUTTON EXISTS ═════════════════════════════════════════════════════════════
 *
 * The queue only ever refetched as a side effect of a decision. So the one state that is REACHED by
 * doing nothing — somebody else decided a submission while this list sat on screen, and opening it
 * now 404s — had no way out except a full page reload. `admin.reviewGoneBody` tells the admin to
 * "refresh the list"; this is what they press.
 */
function ModerationHeader({ pending, shown }: { pending?: number; shown?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // The count next to the glyph is the PANEL's number (`['admin','stats']`), the list is `['admin','moderation']`:
  // the glyph reads both again, or the two disagree after it (review S-admin-moderation 1).
  const fetching = useIsFetching({ queryKey: ['admin', 'moderation'] }) + useIsFetching({ queryKey: ['admin', 'stats'] }) > 0;

  return (
    <SectionHeader
      rule={false}
      title={t('admin.moderation')}
      trailing={
        <span className="inline-flex items-center gap-1">
          {/* A count only when there IS one — never a grey zero. */}
          {pending ? (
            <span className="text-data text-text-2">
              {/* The queue route lists at most its first page: "50 / 55" says so instead of a count the list cannot show. */}
              {shown !== undefined && shown < pending
                ? inked((m) => t('admin.pendingShown', { replace: { shown: m.shown, total: m.total } }), { shown: String(shown), total: String(pending) })
                : inked((m) => t('admin.pendingCount', { count: pending, replace: { count: m.count } }), { count: String(pending) })}
            </span>
          ) : (
            // No count: an invisible one still gives the glyph the baseline the label aligns to, so the head stands where it does with a number (admin-moderation-v2-empty).
            <span aria-hidden className="text-data">
              {'​'}
            </span>
          )}
          <Pressable
            variant="link"
            shape="icon"
            aria-label={t('admin.refreshQueue')}
            busy={fetching}
            className="-me-3"
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ['admin', 'moderation'] });
              void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
            }}
          >
            <RefreshCw aria-hidden />
          </Pressable>
        </span>
      }
    />
  );
}

/**
 * Moderáció (`/admin`) — the admin view's landing tab.
 *
 * admin-moderation-v2 / -empty: the category header (eyebrow, the one door to the style studio, the
 * tab's name as the title); STATISZTIKA — the compact panel (six figures, the 30-day curve and the
 * doors "Részletek ›" / "Szabályok ›", `StatsPanel`); the moderation queue as a section of its own.
 * The user split and the liveness footer of admin-view-1 are gone: the split moved to the
 * Statistics page (`/admin/stats`), the sentence's figures are on its System block. Nothing is
 * enclosed. The waiting count is the only element on the screen that means "someone is waiting".
 *
 * Fiókok and Piactér are tabs of the admin bar (`AdminAccountsPage`, `AdminMarketplacePage`).
 */
export function AdminPage() {
  const { t } = useTranslation();
  const { data: user } = useSession();

  const stats = useAdminStats(hasRole(user, 'admin'));
  const qc = useQueryClient();
  const queue = useModerationQueue();

  // The server enforces this too — this is only so a non-admin sees an explanation instead of
  // a screen full of failed requests.
  if (user && !hasRole(user, 'admin')) return <AdminForbidden />;

  return (
    <Screen top="push" width="wide">
      <AdminHeader title={t('admin.section.moderation')} />

      <StatsPanel
        stats={stats}
        // One "Újra" for both reads: with the server down the queue stays quiet under the panel's line (review S-admin-moderation 10).
        onRetry={() => {
          void stats.refetch();
          void qc.invalidateQueries({ queryKey: ['admin', 'moderation'] });
        }}
      />

      {/* The queue as a section of its own: its head opens on the doors' closing rule, so it draws no
          second one. The queue AND the decision live here. See the header comment in ModerationQueue. */}
      <div className="flex flex-col gap-4">
        <ModerationHeader pending={stats.data?.panel.moderationPending} shown={queue.data?.queue.length} />
        <ModerationQueue quietError={stats.isError} pending={stats.data?.panel.moderationPending} />
      </div>
    </Screen>
  );
}

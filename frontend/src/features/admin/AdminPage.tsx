import { useTranslation } from 'react-i18next';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Screen } from '../../ui/shell/Screen';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { hasRole, useSession } from '../auth/useSession';
import { ModerationQueue } from './ModerationQueue';
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
function ModerationHeader({ pending }: { pending?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['admin', 'moderation'] }) > 0;

  return (
    <SectionHeader
      rule={false}
      title={t('admin.moderation')}
      trailing={
        <span className="inline-flex items-center gap-1">
          {/* A count only when there IS one — never a grey zero. */}
          {pending ? (
            <span className="text-data text-text-2">
              {inked((m) => t('admin.pendingCount', { count: pending, replace: { count: m.count } }), { count: String(pending) })}
            </span>
          ) : null}
          <Pressable
            variant="link"
            shape="icon"
            aria-label={t('admin.refreshQueue')}
            busy={fetching}
            className="-me-3"
            onClick={() => void qc.invalidateQueries({ queryKey: ['admin', 'moderation'] })}
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

  // The server enforces this too — this is only so a non-admin sees an explanation instead of
  // a screen full of failed requests.
  if (user && !hasRole(user, 'admin')) return <AdminForbidden />;

  return (
    <Screen top="push" width="wide">
      <AdminHeader title={t('admin.section.moderation')} />

      <StatsPanel stats={stats} />

      {/* The queue as a section of its own: its head opens on the doors' closing rule, so it draws no
          second one. The queue AND the decision live here. See the header comment in ModerationQueue. */}
      <div className="flex flex-col gap-4">
        <ModerationHeader pending={stats.data?.panel.moderationPending} />
        <ModerationQueue />
      </div>
    </Screen>
  );
}

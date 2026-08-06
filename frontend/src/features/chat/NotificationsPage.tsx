import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BellOff, Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useNotifications, useMarkNotificationsRead } from './useChat';

const ago = (unix: number, t: (k: string, o?: Record<string, unknown>) => string) => {
  const mins = Math.max(0, Math.floor((Date.now() / 1000 - unix) / 60));
  if (mins < 60) return t('notifications.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notifications.hoursAgo', { count: hours });
  return t('notifications.daysAgo', { count: Math.floor(hours / 24) });
};

/**
 * The notification inbox.
 *
 * MARKING READ HAPPENS ON A DELIBERATE ACT, not on arrival. An inbox that clears its own badge the
 * instant it mounts clears it for a mis-tap and for a background prefetch alike — and the badge is
 * the only thing that ever told the user there was something to see.
 *
 * So: opening the screen marks read ONCE, and only after the list has actually rendered something.
 * That is the honest reading of "the user has seen it".
 */
export function NotificationsPage() {
  const { t } = useTranslation();
  const { data, isPending } = useNotifications();
  const markRead = useMarkNotificationsRead();

  const notifications = data?.notifications ?? [];
  const unread = notifications.filter((n) => n.read_at == null);

  useEffect(() => {
    if (unread.length === 0 || markRead.isPending) return;
    markRead.mutate(undefined);
    // Intentionally keyed on the COUNT rather than the array: a poll that returns the same unread
    // set must not re-fire this, and a new arrival while the screen is open should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread.length]);

  if (isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-2 py-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-16 w-full rounded-card" />
        <Skeleton className="h-16 w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="col-mobile screen-x flex flex-col gap-4 py-6">
      <h1 className="text-title-2 font-display">{t('notifications.title')}</h1>

      {notifications.length === 0 ? (
        // No action suggested, because there is none. An empty state that invents a next step for
        // a screen with nothing to do is noise.
        <EmptyState icon={BellOff} title={t('notifications.emptyTitle')} body={t('notifications.emptyBody')} heading="h2" />
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => {
            const Row = (
              <div
                className={cn(
                  'flex min-h-[var(--target-min)] items-start gap-3 rounded-card border p-3',
                  n.read_at == null
                    ? 'border-[var(--accent)] bg-accent-subtle'
                    : 'border-[var(--surface-border)] bg-surface-1',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body truncate">{n.title}</p>
                  {n.body ? <p className="text-caption mt-0.5 truncate text-text-2">{n.body}</p> : null}
                </div>
                <span className="text-caption shrink-0 text-text-3">{ago(n.created_at, t)}</span>
                {n.read_at != null ? <Check className="size-icon-s shrink-0 text-text-3" aria-hidden /> : null}
              </div>
            );

            // `link_path` is validated server-side to start with a single `/` — an absolute URL in
            // a notification is an open redirect, and the CHECK constraint is what makes rendering
            // it as a router link safe rather than merely conventional.
            return (
              <li key={n.id}>
                {n.link_path ? (
                  <Link to={n.link_path} className="block">
                    {Row}
                  </Link>
                ) : (
                  Row
                )}
              </li>
            );
          })}
        </ul>
      )}

      {unread.length > 0 ? (
        <Pressable variant="secondary" busy={markRead.isPending} onClick={() => markRead.mutate(undefined)}>
          {t('notifications.markAllRead')}
        </Pressable>
      ) : null}
    </div>
  );
}

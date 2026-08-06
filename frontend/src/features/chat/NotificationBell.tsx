import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Bell } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useUnreadCount } from './useChat';

/**
 * The notification bell.
 *
 * IT IS NOT A NAV TAB, and that was the decision that unblocked Phase 3's layout. A notification
 * centre is a transient inbox rather than a destination, both platform idioms put it in a header,
 * and — measured — the bottom bar was already full: a coach fills all five slots, and an admin was
 * already losing their own tab to the clamp. See [[Messaging and Notifications]].
 *
 * The badge is CAPPED at 99+ by the server, which reports `capped` rather than a bigger number.
 * Unbounded digits break the bar's layout, and the difference between 100 and 342 unread changes
 * no decision anyone makes.
 *
 * The count is never rendered from a locally-adjusted number. Optimistic decrement is where badges
 * start lying, and the server's count is capped anyway, so local arithmetic would drift.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data } = useUnreadCount();
  const unread = data?.unread ?? 0;

  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? t('notifications.withUnread', { count: unread }) : t('notifications.title')}
      className={cn(
        'relative grid size-11 place-items-center rounded-field text-text-2',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        className,
      )}
    >
      <Bell className="size-icon-m" aria-hidden />
      {unread > 0 ? (
        <span
          // `aria-hidden` because the count is already in the link's label. A screen reader hearing
          // "3" floating beside "Notifications, 3 unread" is reading the same fact twice.
          aria-hidden
          className={cn(
            'text-micro absolute right-1 top-1 grid min-w-4 place-items-center rounded-full px-1',
            'bg-danger text-[var(--on-danger)] tabular-nums',
          )}
        >
          {data?.capped ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

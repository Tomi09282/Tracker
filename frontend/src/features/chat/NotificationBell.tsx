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
      // A RESTING HOLDER, not a bare glyph. The bell sits over the aurora on both screens that
      // draw it, and an unfilled 20px icon on a moving gradient has no edge of its own — the
      // mockups give it a translucent disc with a rim, which is also what makes the badge read as
      // riding something rather than floating. Circular here, unlike the section-head squircles:
      // this holder stands in for a person's inbox, and the image keeps that family round.
      className={cn(
        'relative grid size-11 place-items-center rounded-chip text-text-2',
        'border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-2',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        className,
      )}
    >
      <Bell className="size-icon-m" aria-hidden />
      {unread > 0 ? (
        <span
          // `aria-hidden` because the count is already in the link's label. A screen reader hearing
          // "3" floating beside "Notifications, 3 unread" is reading the same fact twice.
          //
          // OUTSIDE the holder's corner and ACCENT-filled, as both mockups draw it. Tucked inside
          // at `right-1 top-1` it sat on the glyph and obscured the thing it was counting, and
          // `--danger` is reserved for destructive and irreversible: unread news is neither.
          aria-hidden
          className={cn(
            'text-micro absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1',
            'bg-accent text-accent-fg tabular-nums',
          )}
        >
          {data?.capped ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

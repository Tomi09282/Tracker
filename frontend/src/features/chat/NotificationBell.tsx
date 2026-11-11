import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Bell } from 'lucide-react';
import { cn } from '../../lib/cn';
import { BadgeCount } from '../../ui/primitives/BadgeCount';
import { control } from '../../ui/primitives/control';
import { useUnreadCount } from './useChat';

/**
 * The notification bell — kit `iconBtn('bell', count)`, frames `home-1..3` and `coach-dashboard-1`.
 *
 * A bare 24 pt glyph in a 44 x 44 hit frame (the icon-button look of `control()`; it is a route,
 * so it is the router's link wearing the recipe), with the lime count on its top-right corner.
 * No disc, no rim: nothing is enclosed.
 *
 * IT IS NOT A NAV TAB. A notification centre is a transient inbox rather than a destination, both
 * platform idioms put it in a header, and the bottom bar has no room for it. See
 * [[Messaging and Notifications]].
 *
 * The badge is CAPPED at 99+ by the server, which reports `capped` rather than a bigger number. The
 * count is never rendered from a locally-adjusted number: optimistic decrement is where badges start
 * lying. Hidden at 0.
 *
 * The count is the kit's `BadgeCount` (lane F8): it places itself on the button's corner (left edge
 * at 26, top at 0 of the 44 frame, a wider "99+" growing to the right) and hides at 0.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data } = useUnreadCount();
  const unread = data?.unread ?? 0;

  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? t('notifications.withUnread', { count: unread }) : t('notifications.title')}
      data-kit="iconBtn"
      className={cn(control({ variant: 'link', shape: 'icon' }), 'relative', className)}
    >
      <Bell aria-hidden />
      <BadgeCount count={unread} capped={data?.capped} />
    </Link>
  );
}

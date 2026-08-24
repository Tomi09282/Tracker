import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronLeft,
  Dumbbell,
  History,
  MessageSquare,
  Salad,
  Trophy,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useNotifications, useMarkNotificationsRead, type AppNotification } from './useChat';

const ago = (unix: number, t: (k: string, o?: Record<string, unknown>) => string) => {
  const mins = Math.max(0, Math.floor((Date.now() / 1000 - unix) / 60));
  if (mins < 60) return t('notifications.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notifications.hoursAgo', { count: hours });
  return t('notifications.daysAgo', { count: Math.floor(hours / 24) });
};

type Glyph = ComponentType<{ className?: string; strokeWidth?: number }>;

/**
 * `type` → glyph.
 *
 * Rows carried no icon at all before, which is why four kinds of news read as one undifferentiated
 * list. The map is keyed on the DOTTED PREFIX rather than the full type, because the server writes
 * `chat.message` today and will write `chat.attachment` tomorrow, and a map keyed on exact strings
 * would silently drop the second one back to the fallback.
 *
 * The fallback is the bell — the same glyph as the anchor, which is the honest answer to "this is
 * a notification and we have nothing more specific to say about it".
 */
const TYPE_ICON: Record<string, Glyph> = {
  chat: MessageSquare,
  plan: Dumbbell,
  workout: Dumbbell,
  nutrition: Salad,
  record: Trophy,
  coach: MessageSquare,
};

const iconFor = (type: string): Glyph => TYPE_ICON[type.split('.')[0]] ?? Bell;

/**
 * Offline, in the only sense this screen can act on.
 *
 * `navigator.onLine` is a weak signal — it says ONLINE for a captive portal and for a backend that
 * is down — but marking read is a server write, and a button that is disabled while the interface
 * itself is gone is better than one that silently fails. The shell's `OfflineIndicator` owns the
 * stronger signal (a write that could not be delivered); this is the cheap half of it, and a
 * shared hook would be the right home for both.
 */
function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/**
 * The bell anchor: the badge the user just tapped, enlarged.
 *
 * A count is the only number this screen owns, so it gets the count and not a chart. `count` is
 * `null` for two different facts that must not be drawn the same way — loading, and a fetch that
 * failed. Nothing-to-show and could-not-load are different, and `0` is a claim.
 */
function BellAnchor({
  count,
  loading = false,
  label,
}: {
  count: number | null;
  loading?: boolean;
  label?: string;
}) {
  const silent = count === 0;
  return (
    <div
      className="flex flex-col items-center gap-tight"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <span
        className={cn(
          'relative grid size-28 place-items-center rounded-full',
          // A quiet, untinted bell while the count is unknown: an accent circle over a skeleton
          // numeral would announce news the screen cannot yet confirm.
          count == null ? 'bg-surface-2 text-text-3' : 'bg-accent-subtle text-accent',
        )}
      >
        {silent ? (
          <BellOff size={56} strokeWidth={1.5} aria-hidden />
        ) : (
          <Bell size={56} strokeWidth={1.5} aria-hidden />
        )}
        {count != null && count > 0 ? (
          <span
            aria-hidden
            className="absolute right-2 top-2 size-6 rounded-full bg-accent border-[length:var(--border-width)] border-[var(--surface-0)]"
          />
        ) : null}
      </span>

      {loading ? (
        <Skeleton className="mt-2 h-12 w-16" />
      ) : count != null ? (
        <span className="text-timer tabular-nums text-text-1">{count}</span>
      ) : null}
    </div>
  );
}

/** One row. Same shape unread and read; the surface, the border and the right-edge mark differ. */
function NotificationRow({
  n,
  t,
}: {
  n: AppNotification;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const Icon = iconFor(n.type);
  const unread = n.read_at == null;

  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-field',
          unread ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-accent',
        )}
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-tight">
        <span className="text-body-strong truncate text-text-1">{n.title}</span>
        {n.body ? <span className="text-caption truncate text-text-2">{n.body}</span> : null}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-tight">
        <span className="text-caption text-text-3">{ago(n.created_at, t)}</span>
        {/* The chevron is gone — at the far right of a row whose left side already says
            everything, it was carrying the has-a-destination distinction badly. What replaces
            it is the PRESS STATE: a row with `link_path` is a Link and moves under a finger, a
            row without one has no press state and no pointer. The dot and the check are the
            read state, which is a different fact and gets a different mark. */}
        {unread ? (
          <span aria-hidden className="size-2 rounded-full bg-accent" />
        ) : (
          <Check className="size-icon-s text-success" aria-hidden />
        )}
      </span>
    </>
  );

  const shape = cn(
    'flex min-h-[var(--target-min)] w-full items-center gap-group text-left',
    unread && 'border-[var(--accent-border)] bg-accent-subtle',
  );

  // `link_path` is validated server-side to start with a single `/` — an absolute URL in a
  // notification is an open redirect, and the CHECK constraint is what makes rendering it as a
  // router link safe rather than merely conventional.
  return n.link_path ? (
    <Surface as={Link} to={n.link_path} interactive className={shape}>
      {inner}
    </Surface>
  ) : (
    <Surface className={shape}>{inner}</Surface>
  );
}

/**
 * The notification inbox.
 *
 * MARKING READ HAPPENS ON A DELIBERATE ACT, not on arrival. An inbox that clears its own badge the
 * instant it mounts clears it for a mis-tap and for a background prefetch alike — and the badge is
 * the only thing that ever told the user there was something to see.
 *
 * So: opening the screen marks read ONCE, and only after the list has actually rendered something.
 * That is the honest reading of "the user has seen it".
 *
 * ═══ AND THAT IS WHY THE ANCHOR FREEZES ════════════════════════════════════════════════════════
 *
 * With the count promoted to the largest element on the screen, following the live unread query
 * would mean showing `3` for one frame and then dropping to `0` while the user is still reading
 * it — the redesign's own anchor destroying itself on paint. The anchor holds the ARRIVAL count
 * for the duration of the visit. The rows lose their unread tint as they are marked, which is
 * where that state change belongs and where it is legible.
 */
export function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const online = useOnline();

  const notifications = data?.notifications ?? [];
  const unread = notifications.filter((n) => n.read_at == null);
  const read = notifications.filter((n) => n.read_at != null);

  // Captured once, on the first payload, and never again — see the docblock. A ref rather than
  // state because nothing should re-render when it is set: it is set DURING the render that first
  // has data, which is the one render that already paints the right number.
  const arrival = useRef<number | null>(null);
  if (data && arrival.current === null) arrival.current = unread.length;

  useEffect(() => {
    if (unread.length === 0 || markRead.isPending || !online) return;
    markRead.mutate(undefined);
    // Intentionally keyed on the COUNT rather than the array: a poll that returns the same unread
    // set must not re-fire this, and a new arrival while the screen is open should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread.length, online]);

  const header = (
    <header className="flex items-center gap-tight">
      {/* The back TEXT link became the control. One icon, at the target floor, where a thumb
          reaches on a phone held in one hand. */}
      <Pressable
        shape="icon"
        variant="ghost"
        aria-label={t('common.back')}
        onClick={() => navigate(-1)}
      >
        <ChevronLeft className="size-icon-m" aria-hidden />
      </Pressable>
      <h1 className="text-title-1 font-display flex-1 text-center text-text-1">
        {t('notifications.title')}
      </h1>
      {/* Balances the control so the title is centred on the column rather than on what is left
          of it. */}
      <span aria-hidden className="size-11 shrink-0" />
    </header>
  );

  if (isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-section py-6">
        {header}
        <BellAnchor count={null} loading />
        {/* No mark-read button while there is no count to justify one. */}
        <div className="flex flex-col gap-group">
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      {header}

      {/* Error shows the bell with NO numeral rather than a `0`: could-not-load and
          nothing-to-show are different facts and must not be drawn the same. */}
      <BellAnchor
        count={isError ? null : (arrival.current ?? 0)}
        label={
          !isError && arrival.current
            ? // The one accessible name this screen has for the count. It is the bell link's
              // label elsewhere, which is exactly what this element is: the bell, enlarged.
              t('notifications.withUnread', { count: arrival.current })
            : undefined
        }
      />

      {/* The primary action, above the list rather than below an unbounded one, and only while
          something is unread. Disabled offline, because marking read is a server write. */}
      {unread.length > 0 ? (
        <Pressable
          variant="primary"
          className="w-full"
          busy={markRead.isPending}
          disabled={!online}
          onClick={() => markRead.mutate(undefined)}
          icon={<CheckCheck className="size-icon-m" aria-hidden />}
        >
          {t('notifications.markAllRead')}
        </Pressable>
      ) : null}

      {notifications.length === 0 ? (
        // No action suggested, because there is none. An empty state that invents a next step for
        // a screen with nothing to do is noise.
        <EmptyState
          icon={BellOff}
          title={t('notifications.emptyTitle')}
          body={t('notifications.emptyBody')}
          heading="h2"
        />
      ) : (
        <div className="flex flex-col gap-section">
          {unread.length > 0 ? (
            <ul className="flex flex-col gap-group">
              {unread.map((n) => (
                <li key={n.id}>
                  <NotificationRow n={n} t={t} />
                </li>
              ))}
            </ul>
          ) : null}

          {read.length > 0 ? (
            <div className="flex flex-col gap-group">
              {/* The `KORÁBBIAK` divider, minus its label: the string needs a key that does not
                  exist yet, and inventing one here would put an untranslated word on the screen
                  in three languages. The rule and the holder still carry the break. */}
              {unread.length > 0 ? (
                <div aria-hidden className="flex items-center gap-tight">
                  <span className="grid size-11 shrink-0 place-items-center rounded-field bg-surface-2 text-text-3">
                    <History className="size-icon-m" strokeWidth={2} />
                  </span>
                  <span className="h-px flex-1 bg-[var(--surface-border)]" />
                </div>
              ) : null}
              <ul className="flex flex-col gap-group">
                {read.map((n) => (
                  <li key={n.id}>
                    <NotificationRow n={n} t={t} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Bell, Dumbbell, MessageCircle, Salad, Trophy } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Numeral } from '../../ui/data/Numeral';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { Dot } from '../../ui/data/Dot';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
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
 * The fallback is the bell — the honest answer to "this is a notification and we have nothing more
 * specific to say about it". The message glyph is `message-circle`, the one the frames draw (the
 * kit's `icons.json` has no `message-square`).
 */
const TYPE_ICON: Record<string, Glyph> = {
  chat: MessageCircle,
  plan: Dumbbell,
  workout: Dumbbell,
  nutrition: Salad,
  record: Trophy,
  coach: MessageCircle,
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

type T = (k: string, o?: Record<string, unknown>) => string;

/**
 * One notification as a kit row (notifications-1 `listRow`): the type glyph as the bare lead, the
 * server's title, its body as the sub line when there is one, and the age at the end.
 *
 * Unread: the 6 pt lime dot, 8, then the age in mono `text-1` — the dot is the only unread mark.
 * Read: the age as the row's value (mono `text-2`), no mark. A row with `link_path` is one target
 * (the whole row navigates); a row without one is static, with no press state.
 *
 * `link_path` is validated server-side to start with a single `/` — an absolute URL in a
 * notification is an open redirect, and the CHECK constraint is what makes rendering it as a
 * router link safe rather than merely conventional. It is only ever a `to`, never an `href`.
 */
function NotificationItem({ n, t }: { n: AppNotification; t: T }) {
  const Icon = iconFor(n.type);
  const age = ago(n.created_at, t);
  const unread = n.read_at == null;
  const row = {
    lead: <Icon />,
    title: n.title,
    sub: n.body || undefined,
    value: unread ? undefined : age,
    trailing: unread ? (
      <span className="inline-flex items-center gap-2">
        <Dot />
        <span className="text-data whitespace-nowrap text-text-1">{age}</span>
      </span>
    ) : undefined,
  };
  return n.link_path ? <ListRow {...row} to={n.link_path} /> : <ListRow {...row} />;
}

/**
 * The notification inbox — notifications-1 (arrival, 2 unread) and notifications-2 (empty).
 *
 * ═══ THE COMPOSITION (figma-build/app/notifications-N.body.js) ═════════════════════════════════
 *
 *   Screen top="push"          the pushed header at y 64, blocks 32 apart, side 24
 *   ScreenHeader kind="push"   "‹ KEZDŐLAP" + ÉRTESÍTÉSEK; the way back stays the history (the bell
 *                              lives on Home and on the coach dashboard)
 *   the anchor                 the giant numeral in its 100 pt slot, 8, the caption; 20 under it the
 *                              ONE lime pill while something is unread
 *   the list                   unread rows under a strong rule, then the "Korábbiak" section of read
 *                              rows; one ruled list when only one group exists
 *   empty / error              the same strong rule, then the empty text (or the error line + Újra)
 *
 * MARKING READ HAPPENS ONCE, after the list has actually rendered something — the honest reading of
 * "the user has seen it". A badge cleared on mount would be cleared by a mis-tap and a prefetch.
 *
 * ═══ AND THAT IS WHY THE ANCHOR FREEZES ════════════════════════════════════════════════════════
 *
 * Following the live unread query would mean showing `2` for one frame and then dropping to `0`
 * while the user is still reading it. The anchor holds the ARRIVAL count for the visit; the rows
 * lose their dot as they are marked, which is where that state change belongs. The numeral is
 * therefore `static`: a roll would animate the freeze.
 */
export function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useNotifications();
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

  // The frame names the parent ("KEZDŐLAP"); the step stays the history, because the bell is also
  // on the coach dashboard and a fixed link would send a coach to the member's Home.
  const header = (
    <ScreenHeader kind="push" title={t('notifications.title')} back={{ onClick: () => navigate(-1), label: t('nav.home') }} />
  );

  if (isPending) {
    return (
      <Screen top="push">
        {header}
        {/* A placeholder at the numeral's size where the count goes: no caption and no pill while
            there is no count to justify them. */}
        <Skeleton className="h-25 w-14" />
        <RowStack as="div" open role="status" aria-label={t('common.loading')}>
          <ListRowSkeleton sub index={0} />
          <ListRowSkeleton sub index={1} />
        </RowStack>
      </Screen>
    );
  }

  const count = arrival.current ?? 0;

  return (
    <Screen top="push">
      {header}

      {/* Error shows NO numeral and no caption rather than a `0`: could-not-load and nothing-to-show
          are different facts. The pill is still offered while cached unread rows stand (a later
          poll that failed). */}
      {!isError || unread.length > 0 ? (
        <div className="flex flex-col gap-5">
          {isError ? null : (
            <div
              // The frame's `Stat/Olvasatlan` (numeral + body caption, no eyebrow): composed here
              // because the kit `StatBlock` requires an eyebrow and sets its caption at `cap`.
              // The block carries the display face as the kit's `statBlock` does; the caption names its own.
              data-kit="statBlock"
              className="flex w-fit flex-col items-start gap-2"
              style={{ fontFamily: 'var(--font-display)' }}
              // The one accessible name this screen has for the count — the bell link's label
              // elsewhere, which is exactly what this is: the bell's count, enlarged.
              {...(count > 0 ? { role: 'img', 'aria-label': t('notifications.withUnread', { count }) } : { 'aria-hidden': true })}
            >
              {/* The frame holds the figure in a 100 pt slot, so a round "0" (ink 101.7) puts the
                  caption exactly where the "2" puts it: nothing below moves between states. */}
              <div className="h-25">
                <Numeral size="giant" value={count} tone={count === 0 ? 'pending' : 'ink'} />
              </div>
              {/* No `{{count}}` and no plural suffix: the numeral is drawn above this line. */}
              <p className="font-body text-body text-text-2">{t('notifications.unreadLabel')}</p>
            </div>
          )}

          {/* The primary action, only while something is unread. Disabled offline, because marking
              read is a server write. */}
          {unread.length > 0 ? (
            <Pressable
              variant="primary"
              size="lg"
              className="w-full"
              busy={markRead.isPending}
              disabled={!online}
              onClick={() => markRead.mutate(undefined)}
            >
              {t('notifications.markAllRead')}
            </Pressable>
          ) : null}
        </div>
      ) : null}

      {isError ? (
        // A failed fetch leaves `notifications` empty, so without this branch the body said
        // "Nincs értesítés" under an anchor that had just refused to claim a count. Only this one
        // has an action that can fix it — a text link, not a second pill.
        <div className="flex flex-col gap-6">
          <Rule strong />
          <EmptyState
            title={t('auth.errors.generic')}
            action={
              // min-w-11: "Újra" is 30 pt of ink; the target still has to be 44 wide.
              <TextLink text="body" className="min-w-11" onClick={() => void refetch()}>
                {t('common.retry')}
              </TextLink>
            }
          />
        </div>
      ) : notifications.length === 0 ? (
        // No action suggested, because there is none.
        <div className="flex flex-col gap-6">
          <Rule strong />
          <EmptyState measure="narrow" title={t('notifications.emptyTitle')} body={t('notifications.emptyBody')} />
        </div>
      ) : unread.length > 0 && read.length > 0 ? (
        <>
          <RowStack open>
            {unread.map((n) => (
              <NotificationItem key={n.id} n={n} t={t} />
            ))}
          </RowStack>
          {/* "Korábbiak" only when both groups exist: it is the only thing that says the rows below
              are already-seen news. */}
          <Section title={t('notifications.earlier')}>
            <RowStack>
              {read.map((n) => (
                <NotificationItem key={n.id} n={n} t={t} />
              ))}
            </RowStack>
          </Section>
        </>
      ) : (
        <RowStack open>
          {notifications.map((n) => (
            <NotificationItem key={n.id} n={n} t={t} />
          ))}
        </RowStack>
      )}
    </Screen>
  );
}

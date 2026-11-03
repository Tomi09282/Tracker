import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '../../lib/cn';
import { apiWithRefresh } from '../../lib/api';
import { flushOutbox, subscribeOutbox, type OutboxEntry } from '../../lib/outbox';
import { useSession } from '../../features/auth/useSession';
import { isVerifiedSession } from '../../features/auth/sessionCache';
import { Rule } from '../data/Rule';
import { NoticeLine } from '../feedback/NoticeLine';

/**
 * Offline indicator, and the thing that drains the outbox.
 *
 * ═══ WHAT COUNTS AS OFFLINE ════════════════════════════════════════════════════════════════════
 *
 * `navigator.onLine` is honest about "no network interface" and dishonest about everything else. It
 * says ONLINE for a captive portal, a VPN that dropped, a backend that is down, and a phone showing
 * one bar that cannot complete a request — and the first version of this component listened to
 * nothing else, so the banner appeared for exactly the one case the user could already see.
 *
 * Measured: with the API server stopped and wifi up, `navigator.onLine` stayed `true` and no banner
 * appeared while every request in the app failed.
 *
 * So the honest signal is a write that could not be delivered. When the outbox is holding
 * something, the app knows it is offline in the only sense that matters — it tried, and it could
 * not — and the banner says so and says how much is waiting.
 *
 * ═══ AND WHAT COUNTS AS BACK ═══════════════════════════════════════════════════════════════════
 *
 * Not the `online` event either: that fires when the interface returns, which on mobile is before
 * anything can actually be reached. Coming back is confirmed by `/healthz` answering with its own
 * JSON body — a captive portal returns 200 with an HTML login page for every url, so a status check
 * alone passes on a network that goes nowhere.
 */
export function OfflineIndicator() {
  const qc = useQueryClient();
  const { data: user, dataUpdatedAt } = useSession();
  // The outbox is drained only under a session the SERVER has confirmed. An offline cold start draws
  // the shell from a remembered hint (`RequireAuth`), and a hint must not act: `flushOutbox` drops an
  // entry on any 4xx but 408/429, so draining under a stale or planted hint would send real writes
  // under whoever's cookies these are and lose them to a 401. The drain runs again as soon as the
  // re-check turns the hint into a verified session (`drain` changes, the effect below re-runs).
  const verifiedUser = isVerifiedSession(user, dataUpdatedAt) ? user : null;
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [queued, setQueued] = useState<OutboxEntry[]>([]);
  const [sending, setSending] = useState(false);

  const mine = user ? queued.filter((e) => e.userId === user.id) : [];

  useEffect(() => subscribeOutbox(setQueued), []);

  const drain = useCallback(async () => {
    if (!verifiedUser) return;
    setSending(true);
    try {
      const result = await flushOutbox(verifiedUser.id, (path, body) =>
        apiWithRefresh(path, { method: 'POST', body }),
      );
      if (result.sent > 0) {
        // The player is showing sets that the server has only just heard about.
        void qc.invalidateQueries({ queryKey: ['workout', 'current'] });
        void qc.invalidateQueries({ queryKey: ['records'] });
      }
    } finally {
      setSending(false);
    }
  }, [verifiedUser, qc]);

  useEffect(() => {
    let cancelled = false;

    const confirmOnline = async () => {
      try {
        // Cheap, unauthenticated, and never cached — a cached 200 would "prove" a connection that
        // does not exist. The service worker passes /healthz straight through for the same reason.
        const res = await fetch('/healthz', { cache: 'no-store' });
        // `res.ok` is not proof. A captive portal answers 200 with its login page for EVERY url —
        // and this component's whole purpose is to not be fooled by one. Measured without needing
        // a portal: /healthz was missing from the dev proxy and returned 200 text/html from the
        // SPA fallback, satisfying an `res.ok` check with the backend switched off entirely.
        const body = res.ok ? await res.json().catch(() => null) : null;
        if (cancelled) return;
        const up = body?.ok === true;
        setOffline(!up);
        if (up) void drain();
      } catch {
        if (!cancelled) setOffline(true);
      }
    };

    const goOffline = () => setOffline(true);
    // Coming back from a locked screen is the common case on a phone: the `online` event fired
    // while the tab was frozen, or never fired at all because the interface never technically went.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void confirmOnline();
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', confirmOnline);
    document.addEventListener('visibilitychange', onVisible);
    // On mount too, so a reload with things already queued does not sit there until the user
    // happens to switch tabs.
    void confirmOnline();

    return () => {
      cancelled = true;
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', confirmOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [drain]);

  /*
   * THE STRIP PUBLISHES ITS OWN HEIGHT.
   *
   * It is sticky and in the flow, so it takes space from every screen below it — and one of those
   * screens (`WorkoutPlayer`) is exactly one viewport tall by law, with the check button pinned at
   * the bottom. Without this the button leaves the screen the moment the network drops.
   *
   * MEASURED, not toggled between two constants. The strip is one line or two depending on the
   * queue, it carries a safe-area inset at the top, and it animates 0fr→1fr over `--duration-slow`
   * — so a value flipped at the `showing` boundary is wrong for the whole transition and wrong
   * again for anyone whose outbox has something in it. `ResizeObserver` reports every frame of the
   * open, which is what makes the player's own height follow it rather than jump at the end.
   */
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--offline-h', `${el.getBoundingClientRect().height}px`);
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    publish();
    return () => {
      ro.disconnect();
      // Back to the token's own 0px, so a screen that outlives this component does not keep
      // subtracting a strip that is no longer there.
      root.style.removeProperty('--offline-h');
    };
  }, []);

  const showing = offline || mine.length > 0;

  return (
    <div
      ref={stripRef}
      role="status"
      aria-live="polite"
      className={cn(
        // IN FLOW, NOT OVER IT. `fixed` laid this across the page header, so going offline on Home
        // replaced the greeting with a warning instead of sitting above it. Sticky inside the
        // layout column keeps it pinned while the page scrolls AND makes it occupy space, which is
        // what pushes the header down. The 0fr→1fr grid is what lets that space animate open from
        // nothing — a plain height transition needs a number to animate to.
        'sticky top-0 z-[var(--z-toast)] grid overflow-hidden',
        'transition-[grid-template-rows] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        showing ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="min-h-0">
        {/* Rendered only while showing: an `aria-live` region whose text changes as the strip
            collapses announces the message a second time, to nobody. */}
        <OfflineLine offline={offline} count={mine.length} sending={sending} showing={showing} />
      </div>
    </div>
  );
}

export interface OfflineLineProps {
  /** No connection (the probe failed or the interface is down). */
  offline: boolean;
  /** Writes of this user waiting in the outbox. */
  count: number;
  /** The outbox is being drained right now. */
  sending?: boolean;
  /** Whether the words are rendered (the strip is open). Default `true`. */
  showing?: boolean;
}

/**
 * The offline line — kit `noticeLine('Nincs internetkapcsolat · 3 művelet vár feltöltésre', 'warn')`
 * on the page's own black, closed by the strong rule: the same band a toast drops in, held in the
 * flow instead of over it.
 *
 *     ●  Nincs internetkapcsolat · 3 művelet vár feltöltésre
 *     ─────────────────────────────────────────────────────────
 *
 * BOTH FACTS ON ONE LINE, as the component board draws it: what happened and what it cost. Offline
 * with an empty outbox says only the first; back online with writes still going up says only the
 * count, with the ink dot instead of the warn one — saying "no connection" while uploading over
 * that connection is a lie the user can watch being told.
 *
 * No glyph, no tinted surface, no rail: Pulse puts the colour in the 6 pt dot (Pulse System 2.1).
 * The background is the canvas, opaque, because the page scrolls under the sticky strip.
 */
export function OfflineLine({ offline, count, sending = false, showing = true }: OfflineLineProps) {
  const { t } = useTranslation();
  const queued = t('offline.queued', { count });
  return (
    <div
      data-kit="offlineLine"
      data-sending={sending ? '' : undefined}
      className="screen-x bg-surface-0 pb-1.75 pt-[var(--band-pad-t)]"
    >
      <div className="mx-auto w-full max-w-[var(--screen-max)]">
        <NoticeLine tone={offline ? 'warn' : 'info'}>
          {showing ? (offline ? (count > 0 ? `${t('offline.title')} · ${queued}` : t('offline.title')) : queued) : null}
        </NoticeLine>
        <Rule strong />
      </div>
    </div>
  );
}

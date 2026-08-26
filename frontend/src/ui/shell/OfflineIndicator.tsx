import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, UploadCloud } from 'lucide-react';
import { cn } from '../../lib/cn';
import { apiWithRefresh } from '../../lib/api';
import { flushOutbox, subscribeOutbox, type OutboxEntry } from '../../lib/outbox';
import { useSession } from '../../features/auth/useSession';

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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: user } = useSession();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [queued, setQueued] = useState<OutboxEntry[]>([]);
  const [sending, setSending] = useState(false);

  const mine = user ? queued.filter((e) => e.userId === user.id) : [];

  useEffect(() => subscribeOutbox(setQueued), []);

  const drain = useCallback(async () => {
    if (!user) return;
    setSending(true);
    try {
      const result = await flushOutbox(user.id, (path, body) =>
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
  }, [user, qc]);

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
  const count = mine.length;

  // BOTH LINES AT ONCE, which is what the mockup draws and what the situation deserves.
  // `Nincs internetkapcsolat` says what happened; `3 művelet vár feltöltésre` says what it cost.
  // This used to be a ternary that picked one or the other, so an offline user WITH a queue was
  // told only the number and never told why, and an offline user WITHOUT one was left to guess
  // whether anything had been lost.
  //
  // When the connection is back and the outbox is draining, `offline` is false and the count
  // becomes the strong line on its own — saying "no connection" while uploading over that
  // connection is a lie the user can watch being told.
  const strong = offline ? t('offline.title') : t('offline.queued', { count });
  const detail = offline && count > 0 ? t('offline.queued', { count }) : null;

  return (
    <div
      ref={stripRef}
      role="status"
      aria-live="polite"
      className={cn(
        // IN FLOW, NOT OVER IT. `fixed` laid this across the page header, so going offline on Home
        // replaced the greeting with a warning instead of sitting above it. Sticky inside the
        // layout column keeps it pinned while the page scrolls AND makes it occupy space, which is
        // what pushes the header down the way the mockup shows. The 0fr→1fr grid is what lets that
        // space animate open from nothing — a plain height transition needs a number to animate to,
        // and the strip is one line tall or two depending on the queue.
        'sticky top-0 z-[var(--z-toast)] grid overflow-hidden',
        'transition-[grid-template-rows] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        showing ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="min-h-0 ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)]">
        <div
          className={cn(
            // AN ACCENT RAIL ON A NEUTRAL CARD, NOT AN AMBER-TINTED ONE.
            //
            // The strip used to be a warning surface end to end: amber fill, amber border, amber
            // glyph. 01b-home-empty.webp draws it the other way round — a dark neutral body with a
            // hairline border and one purple rail down the leading edge (sampled off the mockup:
            // rail rgb(144,155,234) ≈ --accent, body rgb(37,36,44), glyph rgb(224,223,228)).
            //
            // The difference is what the strip CLAIMS. An amber field is the same alarm colour a
            // macro tile uses for "you are over target" — a state the user has to weigh. Being
            // offline is not that: the writes are safe in the outbox and will go up on their own.
            // The rail marks the strip as system chrome speaking, which is what it is.
            'flex items-center gap-3 border-b border-[var(--surface-border)]',
            // The rail runs down the LEADING edge, so it follows the writing direction rather than
            // sitting on the left of a right-to-left layout.
            'border-s-4 border-s-accent',
            // The nav's surface pair, not the card's: this is `sticky`, so page content slides
            // UNDER it. --card-bg is a 62% fill with no blur (see the token's own note — blur is a
            // performance opt-in reserved for surfaces over MOVING content), and text scrolling
            // through the strip is exactly what that buys you here. --nav-bg/--nav-blur is the pair
            // already declared for a bar in this situation.
            'bg-[var(--nav-bg)] backdrop-blur-[var(--nav-blur)]',
            'px-4 pb-3 pt-[calc(env(safe-area-inset-top)+--spacing(3))]',
          )}
        >
          {/* The glyph goes neutral with the card. Amber on a neutral body would be the one loud
              thing in the strip and would re-assert the alarm the fill just gave up; the mockup
              draws it at text-1, the same weight as the strong line it sits beside. */}
          {sending ? (
            <UploadCloud size={20} strokeWidth={2} aria-hidden className="shrink-0 text-text-1" />
          ) : (
            <CloudOff size={20} strokeWidth={2} aria-hidden className="shrink-0 text-text-1" />
          )}
          {/* Rendered only while showing: an `aria-live` region whose text changes as the strip
              collapses announces the message a second time, to nobody. */}
          {showing ? (
            <span className="flex min-w-0 flex-col text-start">
              <span className="text-body-s font-medium text-text-1">{strong}</span>
              {detail ? <span className="text-caption text-text-2">{detail}</span> : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

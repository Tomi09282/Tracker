import { useCallback, useEffect, useState } from 'react';
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

  const showing = offline || mine.length > 0;
  const label = mine.length > 0 ? t('offline.queued', { count: mine.length }) : t('offline.title');

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-0 top-0 z-[var(--z-toast)] flex justify-center',
        'pointer-events-none px-4 pt-[calc(env(safe-area-inset-top)+--spacing(2))]',
        'transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        showing ? 'translate-y-0' : '-translate-y-full',
      )}
    >
      <span className="text-body-s inline-flex items-center gap-2 rounded-chip border border-[var(--warning-border)] bg-[var(--warning-subtle)] px-3 py-2 text-text-1">
        {sending ? (
          <UploadCloud size={20} strokeWidth={2} aria-hidden className="text-warning" />
        ) : (
          <CloudOff size={20} strokeWidth={2} aria-hidden className="text-warning" />
        )}
        {/* Rendered only while showing: an `aria-live` region whose text changes as the banner
            slides away announces the message a second time, to nobody. */}
        {showing ? label : null}
      </span>
    </div>
  );
}

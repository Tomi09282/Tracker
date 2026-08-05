import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudOff } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Offline indicator.
 *
 * `navigator.onLine` is honest about "no network interface" and dishonest about everything else —
 * a captive portal or a dead uplink both report online. So the banner appears on the `offline`
 * event, but disappearing is confirmed by an actual request reaching the server: telling someone
 * they are back when they are not is worse than leaving the banner up a second longer.
 */
export function OfflineIndicator() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);

    const confirmOnline = async () => {
      try {
        // Cheap, unauthenticated, and never cached — a cached 200 would "prove" a connection
        // that does not exist.
        const res = await fetch('/healthz', { cache: 'no-store' });
        if (res.ok) setOffline(false);
      } catch {
        setOffline(true);
      }
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', confirmOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', confirmOnline);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-0 top-0 z-[var(--z-toast)] flex justify-center',
        'pointer-events-none px-4 pt-[calc(env(safe-area-inset-top)+--spacing(2))]',
        'transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        offline ? 'translate-y-0' : '-translate-y-full',
      )}
    >
      <span className="text-body-s inline-flex items-center gap-2 rounded-chip border border-[var(--warning-border)] bg-[var(--warning-subtle)] px-3 py-2 text-text-1">
        <CloudOff size={20} strokeWidth={2} aria-hidden className="text-warning" />
        {offline ? t('offline.title') : null}
      </span>
    </div>
  );
}

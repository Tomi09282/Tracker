import { useEffect, useState } from 'react';

/**
 * Online, in the only sense a disabled control cares about.
 *
 * Deliberately the CHEAP signal. The shell's `OfflineIndicator` owns the honest one — a write that
 * could not be delivered — and says so at the top of every screen; all this has to do is stop a
 * coach starting an edit the server will never hear about. There is no queued-write store behind
 * the plan endpoints, so a mutation fired offline is simply lost, and a control that looks live
 * and silently drops the work is worse than one that looks disabled.
 */
export function useOnline() {
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

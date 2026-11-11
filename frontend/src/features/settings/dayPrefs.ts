import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../lib/api';
import type { DayStartHour, UserPrefs, UserPrefsPatch } from '../../lib/lifeos-api';

/**
 * The user's day: time zone and day start — `GET / PATCH /me/prefs` (LifeOS core, backend
 * package B-core; contract `docs/pipeline/pulse/pkg/B-core/api.md`).
 *
 * Read by three places: the "Nap és időzóna" page (`DaySettingsPage`), the Profil row that opens
 * it ("Budapest · 04:00") and the silent first-time zone write on app start
 * (`useTimezoneBootstrap`). One query key, so the three share one cache entry and one request.
 *
 * NOT QUEUED OFFLINE (plan L9): every LifeOS day depends on these two values, so a change that
 * landed late would move days that already settled. A write that fails is reported, never kept.
 */

export const DAY_PREFS_KEY = ['me', 'prefs'] as const;

/** The four day starts the server accepts (`dayStartHour`: 0 | 2 | 4 | 6). */
export const DAY_START_HOURS: readonly DayStartHour[] = [0, 2, 4, 6];

/**
 * How long after the day start yesterday settles (plan L4: day D settles at start(D+1) + 6 h;
 * api.md "A day settles at the start of the next day + 6 h"). Display only — the server settles.
 */
const SETTLE_DELAY_HOURS = 6;

export function useDayPrefs() {
  return useQuery({
    queryKey: DAY_PREFS_KEY,
    queryFn: async () => (await apiWithRefresh<{ prefs: UserPrefs }>('/me/prefs')).prefs,
    // The zone and the day start change only through this module; nothing else moves them.
    staleTime: 5 * 60_000,
  });
}

/**
 * `PATCH /me/prefs`. The answer is the new prefs, written straight into the cache, so every reader
 * (the page, the Profil row) shows the saved value without a second request.
 */
export function useSaveDayPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UserPrefsPatch) =>
      (await apiWithRefresh<{ prefs: UserPrefs }>('/me/prefs', { method: 'PATCH', body: patch })).prefs,
    onSuccess: (prefs) => {
      qc.setQueryData(DAY_PREFS_KEY, prefs);
      // A new zone or day start moves the logical today (and the first one starts LifeOS): every
      // LifeOS read (Ma, Feladatok, Szokások) answers for the new day.
      void qc.invalidateQueries({ queryKey: ['lifeos'] });
    },
  });
}

/** `409 TIMEZONE_TOO_SOON`: the zone changed less than 24 hours ago. */
export const isZoneTooSoon = (err: unknown) => err instanceof ApiError && err.code === 'TIMEZONE_TOO_SOON';

/** The zone may not change yet (the server's `timezoneChangeableAt` is still ahead). */
export const zoneLocked = (prefs: UserPrefs, now = Date.now()) =>
  prefs.timezoneChangeableAt !== null && prefs.timezoneChangeableAt > now;

/** "04:00" — a whole hour on the 24-hour clock, as the frame and the Profil row print it. */
export const hourLabel = (hour: number) => `${String(((hour % 24) + 24) % 24).padStart(2, '0')}:00`;

/** The wall-clock hour at which yesterday settles, for a day that starts at `start`. */
export const settleLabel = (start: number) => hourLabel(start + SETTLE_DELAY_HOURS);

/**
 * The place name of an IANA zone: its last segment, underscores as spaces — "Europe/Budapest" ->
 * "Budapest", "America/Argentina/Buenos_Aires" -> "Buenos Aires". The zone database's own English
 * name: there is no localized city name to read from the platform, and none is invented here.
 */
export const zoneCity = (zone: string) => (zone.split('/').pop() ?? zone).replace(/_/g, ' ');

/**
 * "GMT+2", "GMT+5:30", "GMT−3", "GMT" — an offset from UTC in minutes, east positive (the server's
 * `utcOffsetMinutes`). The form `Intl` prints as `shortOffset` in English, with a TRUE minus
 * (U+2212), as the approved frames print signed figures ("−5,3", round B open question 7).
 */
export function offsetLabel(minutes: number) {
  if (minutes === 0) return 'GMT';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${minutes < 0 ? '−' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** The offset of `zone` right now, in minutes east of UTC — for the rows of the zone picker. */
export function zoneOffsetMinutes(zone: string, at = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(at);
    const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
    const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
    return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
  } catch {
    return null;
  }
}

/** Every zone the browser knows (the picker's list); the browser's own zone when it lists none. */
export function knownZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  try {
    const all = intl.supportedValuesOf?.('timeZone');
    if (all?.length) return all;
  } catch {
    /* an engine without the list: fall through */
  }
  const own = browserZone();
  return own ? [own] : [];
}

/** The browser's IANA zone, or null when the platform does not say (or says something unusable). */
export function browserZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // The server bounds the zone with a regex AND its ICU data; "UTC" alone is not a place.
    return typeof zone === 'string' && /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){1,2}$/.test(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Once per page load: the first-time write is attempted at most once, whatever re-renders. */
let bootstrapTried = false;

/**
 * THE SILENT FIRST-TIME ZONE WRITE. Mounted once on the signed-in shell (`AppLayout`).
 *
 * LifeOS starts the first time the server knows the user's zone (api.md "The day"), and until
 * then every logical day is the UTC date. So when the stored zone is EMPTY, the browser's zone is
 * sent once — no question, no toast, nothing on screen (the plan: "the client silently sends the
 * browser IANA zone").
 *
 * ONLY WHEN EMPTY. A zone the user chose on "Nap és időzóna" is never overwritten by the device's:
 * re-sending a different zone would spend the one change a day allows, or silently undo the
 * choice a day later. A failure is left alone — the next app start tries again.
 */
export function useTimezoneBootstrap() {
  const prefs = useDayPrefs();
  const save = useSaveDayPrefs();
  const empty = prefs.data !== undefined && prefs.data.timezone === null;
  const { mutate } = save;

  useEffect(() => {
    if (!empty || bootstrapTried) return;
    const zone = browserZone();
    if (!zone) return;
    bootstrapTried = true;
    mutate({ timezone: zone });
  }, [empty, mutate]);
}

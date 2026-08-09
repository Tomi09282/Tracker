import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { BlockNode } from './DocRenderer';

/**
 * The public reads. THESE ARE THE ONLY QUERIES IN THE PRODUCT THAT NEED NO SESSION.
 *
 * They go through plain `fetch` rather than `apiWithRefresh` on purpose: that helper attaches the
 * CSRF header and, on a 401, tries a refresh and retries. Both are wrong here. A visitor with no
 * account has nothing to refresh, and a refresh attempt on a public page would fire a pointless
 * request on every cold load — and worse, a 401 from somewhere else could send an anonymous
 * reader into an auth flow they never asked for.
 *
 * `credentials: 'omit'`, not `'include'`. THE SERVER IGNORES THE COOKIE ANYWAY — the public router
 * is gated from reading `req.user` — so sending one buys nothing and costs the guarantee: with no
 * credentials on the wire, these responses are cacheable by any layer without a `Vary` question.
 */
const publicGet = async <T>(path: string): Promise<T> => {
  const res = await fetch(`/api/v1${path}`, { credentials: 'omit' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
};

export interface PublicPost {
  id: string;
  kind: string;
  title: string;
  doc: BlockNode[] | null;
  excerpt: string;
  docVersion: number;
  city: string | null;
  eventAt: number | null;
  eventTz: string | null;
  capacity: number | null;
  priceMinor: number | null;
  priceCurrency: string | null;
  publishedAt: number;
  coachHandle: string;
  coachName: string;
  coachHeadline: string | null;
  coachVerified: 0 | 1;
}

export interface PublicCoach {
  handle: string;
  displayName: string;
  headline: string | null;
  doc: BlockNode[] | null;
  city: string | null;
  verified: 0 | 1;
  publishedAt: number;
}

export interface Taxonomy {
  cities: { key: string; country: string; name: string }[];
  kinds: { key: string; requiresEventAt: 0 | 1; allowsCapacity: 0 | 1; allowsPrice: 0 | 1 }[];
  specialties: { key: string; i18nKey: string }[];
  /** How many decimal places a currency actually has. HUF is 0; EUR, GBP and USD are 2. */
  currencies: { code: string; minorUnits: number }[];
}

export function useTaxonomy() {
  return useQuery({
    queryKey: ['public-taxonomy'],
    queryFn: () => publicGet<Taxonomy>('/public/taxonomy'),
    // The cities and kinds change by INSERT, not by deploy, but not often. An hour is long enough
    // that a filter bar costs one request per session and short enough that a new city appears the
    // same day it is added.
    staleTime: 60 * 60 * 1000,
  });
}

export function useFeed(filters: { kind?: string; city?: string; sort?: 'recent' | 'soonest' }) {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.city) params.set('city', filters.city);
  if (filters.sort) params.set('sort', filters.sort);
  const qs = params.toString();

  return useQuery({
    // EVERY FILTER IS IN THE KEY. A cache keyed on less than the request is a cache that serves
    // Budapest's events to somebody who asked for Debrecen — the same class as the language-in-
    // the-key rule this project already learned once.
    queryKey: ['public-feed', filters.kind ?? '', filters.city ?? '', filters.sort ?? 'recent'],
    queryFn: () =>
      publicGet<{ posts: PublicPost[]; nextCursor: number | null }>(
        `/public/posts${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: ['public-post', id],
    queryFn: () =>
      publicGet<{
        post: PublicPost;
        media: { role: string; storageKey: string; thumbKey: string; width: number; height: number; alt: string | null }[];
      }>(`/public/posts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCoach(handle: string | undefined) {
  return useQuery({
    queryKey: ['public-coach', handle],
    queryFn: () =>
      publicGet<{
        coach: PublicCoach;
        specialties: { key: string; i18nKey: string }[];
        posts: PublicPost[];
      }>(`/public/coaches/${handle}`),
    enabled: Boolean(handle),
  });
}

export function useCoachDirectory(city?: string) {
  return useQuery({
    queryKey: ['public-coaches', city ?? ''],
    queryFn: () =>
      publicGet<{ coaches: PublicCoach[]; nextCursor: number | null }>(
        `/public/coaches${city ? `?city=${encodeURIComponent(city)}` : ''}`,
      ),
  });
}

export function useSearch(q: string, city?: string) {
  const params = new URLSearchParams({ q });
  if (city) params.set('city', city);

  return useQuery({
    queryKey: ['public-search', q, city ?? ''],
    queryFn: () => publicGet<{ posts: PublicPost[] }>(`/public/search?${params}`),
    // The server refuses a one-character query with a 400; not asking is better than asking and
    // handling the refusal.
    enabled: q.trim().length >= 2,
  });
}

/** Display only. The server stores integer minor units and no float ever crosses the boundary. */
/**
 * Render a price from its MINOR UNITS, which is not always hundredths.
 *
 * This divided by a hardcoded 100 and forced `maximumFractionDigits: 0`. Measured against the
 * database, which is the only thing that actually knows: `public_currencies.minor_units` is 0 for
 * HUF and 2 for EUR, GBP and USD. So every Hungarian price on the public marketplace was rendered
 * at ONE HUNDREDTH of its value, and the forced zero digits turned EUR 0.01 into "0 EUR".
 *
 * `minorUnits` comes from `GET /public/taxonomy`. Passing it in rather than keeping a table here is
 * the point: a second copy of the currency list is a second thing to update when one is added, and
 * this file has just finished paying for exactly that mistake.
 */
export const formatPrice = (
  minor: number | null,
  currency: string | null,
  locale: string,
  minorUnits: number | undefined,
) => {
  if (minor == null || !currency) return null;
  // Undefined means the taxonomy has not loaded. Guessing a scale is how the original bug read to
  // everyone who looked at it, so this renders nothing until it knows.
  if (minorUnits === undefined) return null;
  const value = minor / 10 ** minorUnits;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
};

/**
 * The price formatter, bound to the currency table and the reader's locale.
 *
 * A hook rather than two call sites each doing their own `currencies.find(...)`: that lookup is
 * the thing that was wrong, and writing it twice is how it goes wrong again in one place and not
 * the other. Callers ask for a formatter and pass it a number.
 */
export function usePriceFormatter() {
  const { i18n } = useTranslation();
  const { data } = useTaxonomy();
  return (minor: number | null, currency: string | null) =>
    formatPrice(
      minor,
      currency,
      i18n.language,
      data?.currencies.find((c) => c.code === currency)?.minorUnits,
    );
}

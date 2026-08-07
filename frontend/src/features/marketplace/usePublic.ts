import { useQuery } from '@tanstack/react-query';
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
export const formatPrice = (minor: number | null, currency: string | null, locale: string) => {
  if (minor == null || !currency) return null;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
      .format(minor / 100);
  } catch {
    return `${Math.round(minor / 100)} ${currency}`;
  }
};

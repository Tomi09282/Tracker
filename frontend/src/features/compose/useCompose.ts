import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import type { BlockNode } from '../marketplace/DocRenderer';

/**
 * The coach's side of the marketplace.
 *
 * ═══ EVERY BOUND COMES FROM THE SERVER ═════════════════════════════════════════════════════════
 *
 * `limits` arrives in the context payload and the editor reads its counters from there. Typing
 * `140` into a character counter would be a second copy of a number the validator also holds, and
 * the two would part company the first time either moved — a form that says "12 characters left"
 * and then refuses to save.
 *
 * ═══ AND SO DOES THE PREVIEW ═══════════════════════════════════════════════════════════════════
 *
 * There is no markdown renderer on this side. The preview endpoint runs the same `buildBody` the
 * save runs, and the tree it returns goes through the same `DocRenderer` the public page uses. A
 * client-side renderer would be a second grammar, and the day it diverged would be a coach
 * publishing something they never saw.
 */

export interface ComposeLimits {
  titleMax: number;
  headlineMax: number;
  displayNameMax: number;
  displayNameMin: number;
  bodyMax: number;
  bioMax: number;
  specialtyMax: number;
}

export interface ComposeContext {
  profile: { handle: string; displayName: string; headline: string | null; publishedAt: number | null } | null;
  profileRemoved: boolean;
  standing: {
    enabled: boolean;
    roleOk: boolean;
    oldEnough: boolean;
    eligibleAt: number;
    guidelinesAcceptedAt: number | null;
    activeGuidelinesVersion: string;
    activeGuidelinesI18nKey: string;
  };
  quotas: {
    postPublishDailyMax: number;
    publishedToday: number;
    oldestPublishedAt: number | null;
    mediaDailyMax: number;
    mediaToday: number;
  };
  limits: ComposeLimits;
  now: number;
}

export interface ComposePost {
  id: string;
  kind: string;
  title: string;
  bodySrc: string;
  doc: BlockNode[] | null;
  excerpt: string;
  docVersion: number;
  city: string | null;
  eventAt: number | null;
  eventTz: string | null;
  capacity: number | null;
  priceMinor: number | null;
  priceCurrency: string | null;
  publishedAt: number | null;
  deletedAt: number | null;
  removedAt: number | null;
  rowVersion: number;
  createdAt: number;
  updatedAt: number;
}

export type PostState = 'all' | 'draft' | 'live' | 'withdrawn' | 'removed';

/**
 * A refusal the coach can act on.
 *
 * The server answers 409 with a snake_case `reason` and the facts that go with it — which version
 * to accept, when the account becomes eligible, how many slots are left. This type is what makes
 * those facts survive the fetch layer instead of collapsing into "request failed".
 */
export interface ComposeConflict {
  reason: string;
  activeVersion?: string;
  activeI18nKey?: string;
  eligibleAt?: number;
  used?: number;
  max?: number;
  nextSlotAt?: number;
  key?: string;
  field?: string;
  post?: ComposePost;
}

export function useComposeContext() {
  return useQuery({
    queryKey: ['compose-context'],
    queryFn: () => apiWithRefresh<ComposeContext>('/compose/context'),
    staleTime: 30_000,
  });
}

export function useComposeProfile() {
  return useQuery({
    queryKey: ['compose-profile'],
    queryFn: () =>
      apiWithRefresh<{
        profile:
          | (ComposeContext['profile'] & {
              bioSrc: string | null;
              doc: BlockNode[] | null;
              city: string | null;
              listedAt: number | null;
              removedAt: number | null;
              verified: 0 | 1;
            })
          | null;
        specialties: string[];
      }>('/compose/profile'),
  });
}

export interface ProfileDraft {
  display_name: string;
  headline: string | null;
  bio_src: string | null;
  city_key: string | null;
  specialties: string[];
}

/** Invalidate everything the composer renders from. Cheap, and it cannot go stale by omission. */
function useComposeInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['compose-context'] });
    qc.invalidateQueries({ queryKey: ['compose-profile'] });
    qc.invalidateQueries({ queryKey: ['compose-posts'] });
    // The public reads change too — a publish is the point of this whole surface.
    qc.invalidateQueries({ queryKey: ['public-feed'] });
    qc.invalidateQueries({ queryKey: ['public-coach'] });
  };
}

export function useCreateProfile() {
  const invalidate = useComposeInvalidate();
  return useMutation({
    mutationFn: (body: ProfileDraft & { handle: string }) =>
      apiWithRefresh<{ profile: unknown }>('/compose/profile', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useSaveProfile() {
  const invalidate = useComposeInvalidate();
  return useMutation({
    mutationFn: (body: ProfileDraft) =>
      apiWithRefresh<{ profile: unknown }>('/compose/profile', { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useSetProfilePublished() {
  const invalidate = useComposeInvalidate();
  return useMutation({
    // Two ROUTES, not one endpoint with a flag — publish carries a standing gate that unpublish
    // deliberately does not, and only unpublish reports how many posts went dark.
    mutationFn: (live: boolean) =>
      apiWithRefresh<{ postsWentDark?: number }>(
        live ? '/compose/profile/publish' : '/compose/profile/unpublish',
        { method: 'POST', body: {} },
      ),
    onSuccess: invalidate,
  });
}

export function useAcceptGuidelines() {
  const invalidate = useComposeInvalidate();
  return useMutation({
    mutationFn: (version: string) =>
      apiWithRefresh<{ acceptedAt: number }>('/compose/guidelines/accept', { method: 'POST', body: { version } }),
    onSuccess: invalidate,
  });
}

export function useComposePosts(state: PostState) {
  return useQuery({
    queryKey: ['compose-posts', state],
    queryFn: () =>
      apiWithRefresh<{ posts: ComposePost[]; nextCursor: string | null }>(
        `/compose/posts?state=${encodeURIComponent(state)}`,
      ),
  });
}

export function useComposePost(publicId: string | undefined) {
  return useQuery({
    queryKey: ['compose-post', publicId],
    queryFn: () => apiWithRefresh<{ post: ComposePost }>(`/compose/posts/${publicId}`),
    enabled: !!publicId,
  });
}

export interface PostDraft {
  kind_key: string;
  title: string;
  body_src: string;
  city_key: string | null;
  event_at: number | null;
  event_tz: string | null;
  capacity: number | null;
  price_minor: number | null;
  price_currency: string | null;
}

export function useCreatePost() {
  const invalidate = useComposeInvalidate();
  return useMutation({
    // The key is generated ONCE per attempt by the caller and reused across retries — that is the
    // only thing that makes a retry a retry rather than a second post.
    mutationFn: (body: PostDraft & { idempotency_key: string }) =>
      apiWithRefresh<{ post: ComposePost }>('/compose/posts', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useSavePost(publicId: string) {
  const invalidate = useComposeInvalidate();
  return useMutation({
    // `expected_row_version` is what the server compares against. A save that lands while another
    // tab was editing comes back 409 carrying the current row, not silently overwritten.
    mutationFn: (body: Omit<PostDraft, 'kind_key'> & { expected_row_version: number }) =>
      apiWithRefresh<{ post: ComposePost }>(`/compose/posts/${publicId}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function usePostLifecycle(publicId: string) {
  const invalidate = useComposeInvalidate();
  return useMutation({
    mutationFn: (action: 'publish' | 'withdraw' | 'restore') =>
      apiWithRefresh<{ post: ComposePost; replayed: boolean }>(`/compose/posts/${publicId}/${action}`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: invalidate,
  });
}

export function usePreview() {
  return useMutation({
    mutationFn: (body: { surface: 'post' | 'bio'; body_src: string }) =>
      apiWithRefresh<{ doc: BlockNode[]; excerpt: string; version: number; chars: number }>(
        '/compose/preview',
        { method: 'POST', body },
      ),
  });
}

/**
 * Pull the conflict facts off a failed mutation.
 *
 * `ApiError` carries the parsed body, and the 409s on this surface put everything the coach needs
 * to act into it. Reading `error.message` instead would throw all of it away and leave the screen
 * saying "something went wrong" about a problem with a specific fix.
 */
export function conflictOf(error: unknown): ComposeConflict | null {
  const body = (error as { body?: Record<string, unknown> } | null)?.body;
  if (!body || typeof body.reason !== 'string') return null;
  return body as unknown as ComposeConflict;
}

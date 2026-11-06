import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../../lib/api';
import { groupCases, type ReportRow } from './reportCases';

/*
 * The admin's side of marketplace posts — the answers of docs/pipeline/pulse/pkg/B-admin-posts/api.md,
 * typed once. Times are epoch SECONDS. The server decides everything here (state, visibility, who may
 * take a post down); the screens only draw what it says and send the two acts it accepts.
 */

export type AdminPostState = 'draft' | 'live' | 'withdrawn' | 'removed';
export type AdminPostStateFilter = 'all' | AdminPostState;
export const POST_STATE_FILTERS: readonly AdminPostStateFilter[] = ['all', 'draft', 'live', 'withdrawn', 'removed'];

export interface AdminPostRow {
  id: string;
  title: string;
  kind: string;
  state: AdminPostState;
  createdAt: number;
  publishedAt: number | null;
  withdrawnAt: number | null;
  removedAt: number | null;
  openReports: number;
  authorId: number;
  authorHandle: string | null;
  authorName: string | null;
  authorRole: 'user' | 'coach' | 'admin';
  authorDisabled: boolean;
  visible: boolean;
}

export interface AdminPostList {
  posts: AdminPostRow[];
  total: number;
  nextCursor: string | null;
  query: { q: string | null; state: AdminPostStateFilter; kind: string | null; sort: string };
}

export interface AdminPerson {
  id: number;
  email: string;
  displayName: string | null;
}

export type HiddenBy =
  | 'draft'
  | 'withdrawn'
  | 'removed'
  | 'author_disabled'
  | 'author_not_coach'
  | 'profile_unpublished'
  | 'profile_removed';

export interface AdminPostMedia {
  role: 'cover' | 'gallery';
  key: string;
  thumbKey: string;
  width: number;
  height: number;
  alt: string | null;
  url: string;
  thumbUrl: string;
}

export interface AdminPostReport {
  id: number;
  reason: string;
  severity: number;
  note: string | null;
  snapshot: string | null;
  snapshotTruncated: boolean;
  status: 'open' | 'triaged' | 'upheld' | 'rejected' | 'duplicate';
  closed: boolean;
  createdAt: number;
  resolvedAt: number | null;
  resolutionNote: string | null;
}

export interface AdminPostDetail {
  post: {
    id: string;
    title: string;
    kind: string;
    state: AdminPostState;
    city: { key: string; name: string } | null;
    eventAt: number | null;
    eventTz: string | null;
    capacity: number | null;
    price: { minor: number; currency: string; minorUnits: number } | null;
    createdAt: number;
    publishedAt: number | null;
    withdrawnAt: number | null;
    removedAt: number | null;
    removal: { at: number; by: AdminPerson | null; reason: string | null } | null;
    updatedAt: number;
    rowVersion: number;
    bodyWithheld: boolean;
    body: { excerpt: string; docVersion: number; doc: unknown | null } | null;
    mediaWithheld: boolean;
    media: AdminPostMedia[];
    publicVisibility: { visible: boolean; hiddenBy: HiddenBy[] };
  };
  author: {
    id: number;
    handle: string | null;
    displayName: string | null;
    role: 'user' | 'coach' | 'admin';
    disabled: boolean;
    disabledAt: number | null;
    profile: { published: boolean; removed: boolean; verified: boolean } | null;
  };
  timeline: Array<
    | { kind: 'created' | 'published' | 'withdrawn'; at: number }
    | { kind: 'removed'; at: number; by: AdminPerson | null; reason: string | null }
  >;
  moderationLog: Array<{
    action: 'remove' | 'restore' | 'resolve';
    at: number;
    by: AdminPerson | null;
    reason: string | null;
    note: string | null;
    reportId: number | null;
    reportStatus: string | null;
    removed: boolean;
  }>;
  reports: { total: number; open: number; distinctReporters: number; items: AdminPostReport[] };
}

export interface AdminPostRestoreResult {
  restored: true;
  replayed: false;
  post: { id: string; state: AdminPostState; rowVersion: number; visible: boolean };
}

export interface AdminRemoveResult {
  removed: true;
  replayed: boolean;
  target: { kind: 'post' | 'profile'; id: string };
  state: 'removed';
}

/** Every cache entry of the admin's marketplace posts: a take-down or a restore changes all of them. */
export const POSTS_KEY = ['admin-marketplace-posts'] as const;
export const POST_KEY = ['admin-marketplace-post'] as const;
const REPORTS_KEY = ['admin-marketplace-reports'] as const;

/** The post list: `q` and `state` are the address's, a page is 20 rows, 'Továbbiak' asks for the next. */
export function useAdminPosts(f: { q: string; state: AdminPostStateFilter }) {
  return useInfiniteQuery({
    queryKey: [...POSTS_KEY, f.q, f.state],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ state: f.state, limit: '20' });
      if (f.q) p.set('q', f.q);
      if (pageParam) p.set('cursor', pageParam);
      return apiWithRefresh<AdminPostList>(`/admin/marketplace/posts?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // A dimmed previous list while the next answer is on its way, never a flash of skeleton per keystroke.
    placeholderData: (prev) => prev,
  });
}

/** The count in the switch: the open CASES (reports of one reason on one subject), as many as the Jelentések view has rows. */
export function useOpenReportCount(enabled = true) {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'open'],
    queryFn: () => apiWithRefresh<{ reports: ReportRow[] }>('/admin/marketplace/reports?status=open'),
    enabled,
    select: (d) => groupCases(d.reports).length,
  });
}

/** Whether an error is the server saying "no such post" (a bad id and an unknown one are the same 404). */
export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;

/** One post, the whole inspect page in one read. `full` also asks for the rendered document tree. */
export function useAdminPost(id: string | undefined, full = false) {
  return useQuery({
    queryKey: [...POST_KEY, id, full ? 'full' : 'excerpt'],
    queryFn: () => apiWithRefresh<AdminPostDetail>(`/admin/marketplace/posts/${id}${full ? '?body=full' : ''}`),
    enabled: Boolean(id),
    retry: (count, e) => !isNotFound(e) && count < 2,
  });
}

/** After any act: the list, the page and the report queue are all stale. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: POSTS_KEY }),
      qc.invalidateQueries({ queryKey: POST_KEY }),
      qc.invalidateQueries({ queryKey: REPORTS_KEY }),
    ]);
}

/** Take a post down (`post_id`) or an author's profile (`handle`): ONE reason, required, in the audit log. */
export function useTakeDown() {
  const refresh = useRefreshAll();
  return useMutation({
    networkMode: 'always', // a take-down is made now or fails and says so; it is never queued for a reconnect
    mutationFn: (v: { postId: string; reason: string } | { handle: string; reason: string }) =>
      apiWithRefresh<AdminRemoveResult>('/admin/marketplace/remove', {
        method: 'POST',
        body: {
          post_id: 'postId' in v ? v.postId : null,
          handle: 'handle' in v ? v.handle : null,
          removal_reason: v.reason.trim(),
        },
      }),
    onSuccess: () => refresh(),
  });
}

export function useRestore() {
  const refresh = useRefreshAll();
  return useMutation({
    networkMode: 'always', // see useTakeDown
    mutationFn: (postId: string) =>
      apiWithRefresh<AdminPostRestoreResult>(`/admin/marketplace/posts/${postId}/restore`, { method: 'POST', body: {} }),
    // 409 not_removed: somebody restored it already. The page reloads into the live state; nothing to say.
    onSettled: () => refresh(),
  });
}

/** `409 not_removed` on a restore: the post is already live, the page only needs a reload. */
export const isNotRemoved = (e: unknown) => e instanceof ApiError && e.status === 409 && e.body.reason === 'not_removed';

/**
 * Decide the reports of one reason on one post as ONE act of the admin: each report is its own row on
 * the server (one reporter, one row), so the group is resolved row by row. A row somebody else has
 * closed in the meantime (`already_resolved`) is not a failure of this act; the take-down that comes
 * with an upheld one is idempotent (the first remover and reason stay), so running it again is safe.
 */
export async function decideReports(
  ids: number[],
  status: 'upheld' | 'rejected',
  removalReason: string | null,
  note: string | null = null,
): Promise<void> {
  for (const id of ids) {
    try {
      await apiWithRefresh(`/admin/marketplace/reports/${id}/resolve`, {
        method: 'POST',
        body: {
          status,
          note,
          remove: status === 'upheld',
          removal_reason: status === 'upheld' ? (removalReason ?? '').trim() : null,
        },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) continue;
      throw e;
    }
  }
}

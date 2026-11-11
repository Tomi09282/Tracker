import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../../lib/api';

/*
 * The admin's account endpoints, as `docs/pipeline/pulse/pkg/B-admin-accounts/api.md` states them.
 *
 * Everything here is a READ of what the server decided: the screens hide what the server would
 * refuse anyway (your own role, your own coins), and the server refuses it regardless. Timestamps
 * are epoch seconds, coin amounts integer minor units (1 coin = 100).
 */

export type AdminRole = 'user' | 'coach' | 'admin';
export type AdminUserSort = 'name' | 'created' | 'email' | 'role' | 'clients';
export type SortDir = 'asc' | 'desc';
export type StateFilter = 'all' | 'active' | 'disabled';

export interface AdminUserRow {
  id: number;
  email: string;
  displayName: string | null;
  role: AdminRole;
  createdAt: number;
  disabledAt: number | null;
  mustChange: 0 | 1;
  hasProfile: 0 | 1;
  clientCount: number;
}

export interface AdminUserList {
  users: AdminUserRow[];
  nextCursor: string | null;
  sort: { key: AdminUserSort; direction: SortDir };
  total: number;
}

export interface AdminAccountBrief {
  id: number;
  email: string;
  displayName: string | null;
  role: AdminRole;
  disabledAt: number | null;
  mustChange: boolean;
}

export interface LinkCounts {
  active: number;
  invited: number;
  archived: number;
}

export interface AdminAccountDetail {
  account: {
    id: number;
    email: string;
    displayName: string | null;
    role: AdminRole;
    createdAt: number;
    mustChange: boolean;
    createdBy: { id: number; displayName: string | null; email: string } | null;
    isSelf: boolean;
    disabledAt: number | null;
    disabled: {
      at: number;
      reason: string | null;
      by: { id: number; email: string; displayName: string | null } | null;
    } | null;
  };
  sessions: { open: number; lastStartedAt: number | null };
  lockout: { failedLogins: number; lockedUntil: number | null };
  coaching: {
    asCoach: {
      activeClients: number;
      clientCap: number | null;
      capExempt: boolean;
      tierKey: string | null;
      links: LinkCounts;
    };
    asClient: { links: LinkCounts };
    subscription: {
      tierKey: string;
      tierName: string;
      status: 'trialing' | 'active' | 'past_due' | 'canceled';
      currentPeriodEnd: number | null;
    } | null;
  };
  marketplace: {
    handle: string;
    published: boolean;
    verified: boolean;
    removed: boolean;
    posts: { draft: number; live: number; withdrawn: number; removed: number };
    openReports: number;
  } | null;
  coins: {
    balanceMinor: number;
    entries: { id: number; amountMinor: number; reasonKey: string; note: string | null; createdAt: number }[];
    totalEntries: number;
  };
  activity: { workouts: number; nutritionLogs: number; measurements: number; photos: number };
  audit: {
    id: number;
    action: string;
    createdAt: number;
    requestId: string | null;
    actorId: number | null;
    actorEmail: string | null;
  }[];
}

export interface AdminLedgerEntry {
  id: number;
  userId: number;
  amountMinor: number;
  reasonKey: string;
  refType: string | null;
  refId: number | null;
  actorUserId: number | null;
  requestId: string | null;
  note: string | null;
  createdAt: number;
}

/** What the list page asks: all of it lives in the address, so list -> account -> back restores it. */
export interface AccountFilters {
  q: string;
  role: AdminRole | 'all';
  state: StateFilter;
  sort: AdminUserSort;
  dir: SortDir;
}

export const ROLE_FILTERS = ['all', 'user', 'coach', 'admin'] as const;
export const STATE_FILTERS = ['all', 'active', 'disabled'] as const;
/** The three keys the frame draws; the server also sorts by e-mail and by client count. */
export const SORT_KEYS = ['name', 'role', 'created'] as const;

export const DEFAULT_FILTERS: AccountFilters = { q: '', role: 'all', state: 'all', sort: 'created', dir: 'desc' };

/** The first direction of a key the server uses when none is given (api.md `dir`). */
export const defaultDir = (sort: AdminUserSort): SortDir => (sort === 'created' || sort === 'clients' ? 'desc' : 'asc');

/** The id from the address: digits only, bounded - anything else is no account. */
export const accountIdOf = (raw: string | undefined): number | null =>
  raw && /^[1-9]\d{0,9}$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null;

export const accountKeys = {
  list: ['admin', 'accounts', 'list'] as const,
  one: (id: number) => ['admin', 'accounts', 'one', id] as const,
  ledger: (id: number) => ['admin', 'accounts', 'ledger', id] as const,
};

/** One walk of the list: `Tovabbiak` asks the next page with the server's own cursor. */
export function useAccountList(filters: AccountFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...accountKeys.list, filters],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ sort: filters.sort, dir: filters.dir });
      if (filters.q) params.set('q', filters.q);
      if (filters.role !== 'all') params.set('role', filters.role);
      if (filters.state !== 'all') params.set('state', filters.state);
      if (pageParam) params.set('cursor', pageParam);
      return apiWithRefresh<AdminUserList>(`/admin/users?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // A new filter keeps the old rows on screen (dimmed) until its own answer arrives.
    placeholderData: keepPreviousData,
  });
}

/** The account page: ONE read. */
export function useAccountDetail(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: accountKeys.one(id ?? 0),
    enabled: enabled && id !== null,
    queryFn: () => apiWithRefresh<AdminAccountDetail>(`/admin/users/${id}`),
  });
}

/** The account's coin ledger, newest first, with the server's cursor. */
export function useAccountLedger(id: number | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: accountKeys.ledger(id ?? 0),
    enabled: enabled && id !== null,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ user_id: String(id), limit: '25' });
      if (pageParam !== null) params.set('cursor', String(pageParam));
      return apiWithRefresh<{ entries: AdminLedgerEntry[]; nextCursor: number | null }>(`/admin/coins/ledger?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

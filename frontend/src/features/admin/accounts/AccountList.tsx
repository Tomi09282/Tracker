import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ChevronDown, UserCog } from 'lucide-react';
import { Monogram } from '../../../ui/data/Monogram';
import { ListRow, ListRowSkeleton } from '../../../ui/data/ListRow';
import { RowStack } from '../../../ui/data/RowStack';
import { EmptyState } from '../../../ui/feedback/EmptyState';
import { Pressable } from '../../../ui/primitives/Pressable';
import { SearchField } from '../../../ui/primitives/SearchField';
import { cn } from '../../../lib/cn';
import { useOnline } from '../../plans/useOnline';
import {
  DEFAULT_FILTERS,
  ROLE_FILTERS,
  SORT_KEYS,
  STATE_FILTERS,
  defaultDir,
  useAccountList,
  type AccountFilters,
  type AdminRole,
  type AdminUserRow,
  type AdminUserSort,
} from './accountsApi';
import { FilterLine } from './FilterLine';
import { useAccountFormat } from './format';

/* ── the address is the state ─────────────────────────────────────────────────────────────────── */

const SERVER_SORTS: readonly AdminUserSort[] = ['name', 'created', 'email', 'role', 'clients'];

/** The list's filters from the address: anything unknown falls back to the default, never to the server. */
export function filtersOf(params: URLSearchParams): AccountFilters {
  const q = (params.get('q') ?? '').trim().slice(0, 80);
  const role = params.get('role');
  const state = params.get('state');
  const sort = params.get('sort');
  const dir = params.get('dir');
  const sortKey = SERVER_SORTS.find((s) => s === sort) ?? DEFAULT_FILTERS.sort;
  return {
    q,
    role: ROLE_FILTERS.find((r) => r === role) ?? 'all',
    state: STATE_FILTERS.find((s) => s === state) ?? 'all',
    sort: sortKey,
    dir: dir === 'asc' || dir === 'desc' ? dir : defaultDir(sortKey),
  };
}

/** The address of a set of filters: a default is not written, so a clean list has a clean address. */
export function searchOf(f: AccountFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.role !== 'all') p.set('role', f.role);
  if (f.state !== 'all') p.set('state', f.state);
  if (f.sort !== DEFAULT_FILTERS.sort || f.dir !== DEFAULT_FILTERS.dir) {
    p.set('sort', f.sort);
    p.set('dir', f.dir);
  }
  return p;
}

/** The name a row prints: the display name, else the local part of the address. */
export const rowName = (u: Pick<AdminUserRow, 'displayName' | 'email'>) => u.displayName?.trim() || u.email.split('@')[0];

/**
 * Fiókok (frame `admin-accounts-v2`): the search line, three quiet filter lines, the count, the
 * rows and "Továbbiak".
 *
 * ═══ THE ADDRESS HOLDS THE LIST ════════════════════════════════════════════════════════════════
 *
 * Search, role, state and sort live in the URL's search parameters. A filter changes the subject,
 * not the place, so it REPLACES the address instead of pushing; the account page is pushed from a
 * row, and its back control steps back in the history, which restores exactly this list.
 *
 * ═══ THE WALK ══════════════════════════════════════════════════════════════════════════════════
 *
 * The server pages by an opaque cursor, 24 rows at a time, and answers the size of the whole filtered
 * set. "Továbbiak 8 / 19" is `rows loaded / total`. Changing the search, a filter or the sort starts
 * a new walk; the old rows stay (dimmed) until the new answer arrives.
 */
export function AccountList({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filters = filtersOf(params);
  const online = useOnline();
  const fmt = useAccountFormat();

  // The search box is debounced and the filters are not: typing writes the address once the word is
  // settled; a tap on a filter is one deliberate act and answers at once.
  const [typed, setTyped] = useState(filters.q);
  const lastWritten = useRef(filters.q);
  useEffect(() => {
    // The address changed from outside (back, a link): the box follows it.
    if (filters.q !== lastWritten.current) {
      lastWritten.current = filters.q;
      setTyped(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    const id = setTimeout(() => {
      const next = typed.trim().slice(0, 80);
      if (next === lastWritten.current) return;
      lastWritten.current = next;
      setParams(searchOf({ ...filtersOf(params), q: next }), { replace: true });
    }, 300);
    return () => clearTimeout(id);
    // `params` is read fresh inside; only a new word schedules a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const change = (patch: Partial<AccountFilters>) => setParams(searchOf({ ...filters, ...patch }), { replace: true });

  const list = useAccountList(filters, enabled);
  const rows = list.data?.pages.flatMap((p) => p.users) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const stale = list.isPlaceholderData;

  const SortArrow = filters.dir === 'asc' ? ArrowUp : ArrowDown;
  const roleName = (r: AdminRole) => t(`adminUsers.role.${r}`);

  return (
    <section className="flex flex-col" aria-label={t('adminUsers.title')}>
      {/* The frame sets the search line 8 closer under the title than the screen's own gap (review S-admin-accounts 2). */}
      <div className="-mt-2">
        <SearchField
          label={t('adminUsers.searchPlaceholder')}
          placeholder={t('adminUsers.searchPlaceholder')}
          value={typed}
          maxLength={80}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Three quiet lines between hairlines: the frame draws no box and no chip. */}
      <div className="mt-4 grid grid-cols-[minmax(4.75rem,max-content)_minmax(0,1fr)] divide-y divide-hair border-y border-hair">
        <FilterLine
          label={t('adminUsers.filter.role')}
          value={filters.role}
          onChange={(role) => change({ role })}
          options={[
            { value: 'all', label: t('adminUsers.filter.all') },
            { value: 'user', label: roleName('user') },
            { value: 'coach', label: roleName('coach') },
            { value: 'admin', label: roleName('admin') },
          ]}
        />
        <FilterLine
          label={t('adminUsers.filter.state')}
          value={filters.state}
          onChange={(state) => change({ state })}
          options={[
            { value: 'all', label: t('adminUsers.filter.all') },
            { value: 'active', label: t('adminUsers.filter.active') },
            { value: 'disabled', label: t('adminUsers.filter.disabled') },
          ]}
        />
        <FilterLine
          label={t('adminUsers.filter.sort')}
          value={filters.sort}
          onChange={(sort) =>
            // A tap on the chosen key flips its direction; another key starts at its own default.
            change(sort === filters.sort ? { dir: filters.dir === 'asc' ? 'desc' : 'asc' } : { sort, dir: defaultDir(sort) })
          }
          options={SORT_KEYS.map((key) => ({
            value: key as AdminUserSort,
            label: t(`adminUsers.col.${key}`),
            trailing: <SortArrow aria-hidden className="size-3" strokeWidth={1.75} />,
          }))}
        />
      </div>

      {list.isPending ? (
        <div role="status" className="mt-4">
          <span className="sr-only">{t('common.loading')}</span>
          <RowStack as="div" open aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <ListRowSkeleton key={i} sub index={i % 3} />
            ))}
          </RowStack>
        </div>
      ) : list.isError && rows.length === 0 ? (
        // A failed first read: the words of the statistics frames' error state, one way forward.
        <EmptyState
          className="mt-8"
          title={online ? t('adminUsers.failedTitle') : t('offline.title')}
          body={t('adminUsers.failedBody')}
          action={
            <Pressable variant="primary" size="lg" busy={list.isFetching} onClick={() => void list.refetch()}>
              {t('common.retry')}
            </Pressable>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState className="mt-8" title={t('adminUsers.noneTitle')} body={t('adminUsers.noneBody')} />
      ) : (
        <>
          <p className="mt-6 pb-1 text-data text-text-1" aria-live="polite">
            {t(total === 1 ? 'adminUsers.countOne' : 'adminUsers.count', { count: total })}
          </p>
          <RowStack open close aria-label={t('adminUsers.title')} className={cn(stale && 'opacity-[var(--pressed-opacity)]')}>
            {rows.map((u) => (
              <ListRow
                key={u.id}
                to={`/admin/accounts/${u.id}`}
                lead={<Monogram person={{ email: u.email, display_name: u.displayName }} size={28} />}
                leadSlot
                title={rowName(u)}
                subLines={2}
                sub={
                  <>
                    <span className="block truncate">{u.email}</span>
                    {/* The date never breaks; a flag that does not fit beside it takes the next line (review S-admin-accounts 8, en / de). */}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        {u.role === 'admin' ? <UserCog aria-hidden className="size-4 shrink-0" strokeWidth={1.75} /> : null}
                        <span className="text-data">
                          {roleName(u.role)} · {fmt.date(u.createdAt)}
                        </span>
                      </span>
                      {/* A disabled account is the single most important fact about a row. */}
                      {u.disabledAt !== null ? <span className="text-micro uppercase text-danger">{t('adminUsers.disabled')}</span> : null}
                      {u.mustChange === 1 ? <span className="text-micro uppercase text-warning">{t('adminUsers.mustChange')}</span> : null}
                    </span>
                  </>
                }
                chevron
              />
            ))}
            {list.hasNextPage ? (
              <ListRow
                title={t('adminUsers.more')}
                value={`${rows.length} / ${total}`}
                trailing={<ChevronDown aria-hidden className="size-4 text-text-3" strokeWidth={1.75} />}
                busy={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              />
            ) : null}
          </RowStack>
          {list.isError ? (
            // A failed "Továbbiak": the rows already on screen stay, and the next try is the same row.
            <p role="alert" className="mt-3 text-cap text-danger">
              {t('adminUsers.failedBody')}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

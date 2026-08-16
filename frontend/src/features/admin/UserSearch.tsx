import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldOff, UserCog } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { Field } from '../../ui/primitives/Field';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { DataTable, nextSort, type SortDirection } from '../../ui/data/DataTable';

interface AdminUser {
  id: number;
  email: string;
  role: 'user' | 'coach' | 'admin';
  createdAt: number;
  disabledAt: number | null;
  mustChange: 0 | 1;
  hasProfile: 0 | 1;
  clientCount: number;
}

/**
 * Find an account.
 *
 * ═══ THE SEARCH BOX IS DEBOUNCED AND THE SORT IS NOT ═══════════════════════════════════════════
 *
 * Typing produces a request per settled word; clicking a column header is one deliberate act and
 * should answer immediately. Debouncing a click would make the table feel broken.
 *
 * ═══ AND THE TABLE SHOWS STANDING, NOT A PROFILE ═══════════════════════════════════════════════
 *
 * Every column here answers "who is this and what is their standing" — the questions an admin has
 * when somebody writes in. It cannot reach a person's measurements, food log, photos or messages,
 * because the endpoint does not return them: the projection is the boundary, not the screen.
 */
export function UserSearch({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({
    key: 'created',
    direction: 'desc',
  });

  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(id);
  }, [typed]);

  const params = new URLSearchParams({ sort: sort.key, dir: sort.direction });
  if (q) params.set('q', q);

  const users = useQuery({
    queryKey: ['admin', 'users', q, sort.key, sort.direction],
    queryFn: () => apiWithRefresh<{ users: AdminUser[]; nextCursor: string | null }>(`/admin/users?${params}`),
    enabled,
  });

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-title-3 text-text-1">{t('adminUsers.title')}</h2>
        <Field
          label={t('adminUsers.search')}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-64"
          type="search"
          autoComplete="off"
        />
      </div>

      {users.isPending ? (
        <Skeleton className="mt-4 h-64 rounded-card" />
      ) : (
        <div className="mt-4">
          <DataTable
            caption={t('adminUsers.title')}
            rows={users.data?.users ?? []}
            rowKey={(u) => u.id}
            sort={sort}
            onSort={(key) => setSort((cur) => nextSort(cur, key))}
            empty={
              <div className="rounded-card border border-[var(--surface-border)] bg-surface-1">
                <EmptyState icon={Search} title={t('adminUsers.noneTitle')} body={t('adminUsers.noneBody')} />
              </div>
            }
            columns={[
              {
                key: 'email',
                header: t('adminUsers.col.email'),
                sortable: true,
                render: (u) => (
                  <span className="flex items-center gap-2">
                    {u.email}
                    {/* A disabled account is the single most important fact about a row, so it is a
                        chip beside the identity rather than a column somebody has to scroll to. */}
                    {u.disabledAt !== null ? (
                      <span className="text-micro uppercase rounded-chip bg-danger-subtle px-1.5 text-danger">
                        <ShieldOff className="mr-1 inline size-icon-s" aria-hidden />
                        {t('adminUsers.disabled')}
                      </span>
                    ) : null}
                    {u.mustChange === 1 ? (
                      <span className="text-micro uppercase rounded-chip bg-warning-subtle px-1.5 text-text-1">
                        {t('adminUsers.mustChange')}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'role',
                header: t('adminUsers.col.role'),
                sortable: true,
                render: (u) => (
                  <span className="inline-flex items-center gap-1">
                    {u.role === 'admin' ? <UserCog className="size-icon-s text-accent" aria-hidden /> : null}
                    {t(`adminUsers.role.${u.role}`)}
                  </span>
                ),
              },
              {
                key: 'clients',
                header: t('adminUsers.col.clients'),
                numeric: true,
                // Only meaningful for a coach. An em dash beats a 0 that reads as "this coach has
                // lost all their clients".
                render: (u) => (u.role === 'user' ? '—' : u.clientCount),
              },
              {
                key: 'created',
                header: t('adminUsers.col.created'),
                sortable: true,
                numeric: true,
                render: (u) => new Date(u.createdAt * 1000).toLocaleDateString(),
              },
            ]}
          />
          {/*
            The page cap is the SERVER's, and it is stated rather than hidden. A table that silently
            shows the first two dozen of a thousand matches is a table somebody makes a decision
            from — "there are only three of those" — while looking at a slice.
          */}
          {users.data?.nextCursor ? (
            <p className="text-caption mt-2 text-text-3">{t('adminUsers.moreMatches')}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

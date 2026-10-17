import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, UserCog } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { cn } from '../../lib/cn';
import { SearchField } from '../../ui/primitives/SearchField';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';

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

type SortDirection = 'asc' | 'desc';

/** A tap on a sort label: a new column starts ascending, the current one flips. */
function nextSort(current: { key: string; direction: SortDirection } | undefined, key: string) {
  if (current?.key !== key) return { key, direction: 'asc' as SortDirection };
  return { key, direction: current.direction === 'asc' ? ('desc' as SortDirection) : ('asc' as SortDirection) };
}

/** The three columns the server sorts by (`admin/routes.js` USER_SORTS); "Kliensek" is not one. */
const SORT_KEYS = ['email', 'role', 'created'] as const;

/**
 * Find an account.
 *
 * ═══ THE SEARCH BOX IS DEBOUNCED AND THE SORT IS NOT ═══════════════════════════════════════════
 *
 * Typing produces a request per settled word; tapping a sort key is one deliberate act and should
 * answer immediately.
 *
 * ═══ A READ-ONLY LIST OF TWO-LINE ROWS (admin-3) ═══════════════════════════════════════════════
 *
 * The four-column table that scrolled sideways inside its own box on a phone became rows: the e-mail,
 * then "role · registered" in mono with the flags after it, and the active-client count at the end
 * (a dash for a member — a 0 there would read as "this coach lost all their clients"). The sort keys
 * stand above the rows as mono labels; the chosen one is in ink with its direction arrow. Every row
 * answers "who is this and what is their standing"; it opens nothing, because the endpoint returns
 * nothing more: the projection is the boundary, not the screen.
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

  const list = users.data?.users ?? [];

  return (
    <section className="flex flex-col" aria-label={t('adminUsers.title')}>
      <SectionHeader rule={false} title={t('adminUsers.title')} />
      <SearchField
        className="mt-4"
        label={t('adminUsers.search')}
        placeholder={t('adminUsers.search')}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
      />

      {/* The sort keys: mono labels, 20 apart, each a 44 pt target; "Kliensek" names the last column only. */}
      <div className="mt-8 flex h-11 items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          {SORT_KEYS.map((key) => {
            const on = sort.key === key;
            const Arrow = sort.direction === 'asc' ? ArrowUp : ArrowDown;
            return (
              <Pressable
                key={key}
                variant="link"
                tone={on ? 'default' : 'quiet'}
                aria-pressed={on}
                onClick={() => setSort((cur) => nextSort(cur, key))}
              >
                <span className="inline-flex items-center gap-1 text-micro uppercase">
                  {t(`adminUsers.col.${key}`)}
                  {on ? <Arrow aria-hidden className="size-3" strokeWidth={1.75} /> : null}
                </span>
              </Pressable>
            );
          })}
        </div>
        <span className="text-micro uppercase text-text-3">{t('adminUsers.col.clients')}</span>
      </div>

      {users.isPending ? (
        <div role="status">
          <span className="sr-only">{t('common.loading')}</span>
          <RowStack as="div" open aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <ListRowSkeleton key={i} sub index={i % 3} />
            ))}
          </RowStack>
        </div>
      ) : list.length === 0 ? (
        // No match, a refused character and a failed read all land here (as before).
        <EmptyState className="mt-4" title={t('adminUsers.noneTitle')} body={t('adminUsers.noneBody')} />
      ) : (
        <>
          <RowStack open aria-label={t('adminUsers.title')}>
            {list.map((u) => (
              <ListRow
                key={u.id}
                title={u.email}
                sub={
                  <span className="inline-flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      {u.role === 'admin' ? <UserCog aria-hidden className="size-4 shrink-0" strokeWidth={1.75} /> : null}
                      <span className="text-data">
                        {t(`adminUsers.role.${u.role}`)} · {new Date(u.createdAt * 1000).toLocaleDateString()}
                      </span>
                    </span>
                    {/* A disabled account is the single most important fact about a row. */}
                    {u.disabledAt !== null ? <span className="text-micro uppercase text-danger">{t('adminUsers.disabled')}</span> : null}
                    {u.mustChange === 1 ? <span className="text-micro uppercase text-warning">{t('adminUsers.mustChange')}</span> : null}
                  </span>
                }
                trailing={
                  // Only meaningful for a coach (and an admin who coaches): a dash for a member.
                  <span className={cn('text-data-l', u.role === 'user' ? 'text-text-3' : 'text-text-1')}>
                    {u.role === 'user' ? '—' : u.clientCount}
                  </span>
                }
              />
            ))}
          </RowStack>
          {/*
            The page cap is the SERVER's, and it is stated rather than hidden: a list that silently
            shows the first two dozen of a thousand matches is one somebody decides from.
          */}
          {users.data?.nextCursor ? <p className="text-cap mt-4 text-text-3">{t('adminUsers.moreMatches')}</p> : null}
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { SearchField } from '../../../ui/primitives/SearchField';
import { Chip, ChipRow } from '../../../ui/primitives/ChipRow';
import { TextLink } from '../../../ui/primitives/TextLink';
import { EmptyState } from '../../../ui/feedback/EmptyState';
import { RowStack } from '../../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../../ui/data/ListRow';
import { POST_STATE_FILTERS, useAdminPosts, type AdminPostRow, type AdminPostStateFilter } from './adminPostsApi';
import { PostStateTag, useKindLabel, useStamp } from './postParts';

/** The `?state=` of the page: one of the five words, `all` when absent or anything else. */
export function postStateOf(raw: string | null): AdminPostStateFilter {
  return (POST_STATE_FILTERS as readonly string[]).includes(raw ?? '') ? (raw as AdminPostStateFilter) : 'all';
}

/** The `?q=` of the page: trimmed and cut where the server stops (80), so an old address never makes a 400. */
export const postQueryOf = (raw: string | null) => (raw ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 80);

/**
 * Piactér, the Posztok view (admin-market-v2): the search line, the state words, the posts as
 * one-line-per-fact rows, "Továbbiak" and "7 / 31 poszt".
 *
 * The search and the state live in the address (`?q=`, `?state=`), so a post opened from the list
 * and the way back return to the same list. The server does the finding: this never filters a page
 * it has, it asks again. The author's handle is public, the e-mail never travels here.
 */
export function PostsList({
  q,
  state,
  onQuery,
  onState,
}: {
  q: string;
  state: AdminPostStateFilter;
  onQuery: (q: string) => void;
  onState: (s: AdminPostStateFilter) => void;
}) {
  const { t } = useTranslation();
  const posts = useAdminPosts({ q, state });

  // The search box types at once; the address (and the server) follow when the typing settles.
  const [typed, setTyped] = useState(q);
  const lastQ = useRef(q);
  useEffect(() => {
    // The address changed from outside (back button): the box follows it.
    if (q !== lastQ.current) {
      lastQ.current = q;
      setTyped(q);
    }
  }, [q]);
  useEffect(() => {
    const next = postQueryOf(typed);
    if (next === lastQ.current) return;
    const id = setTimeout(() => {
      lastQ.current = next;
      onQuery(next);
    }, 300);
    return () => clearTimeout(id);
  }, [typed, onQuery]);

  const rows = posts.data?.pages.flatMap((p) => p.posts) ?? [];
  const total = posts.data?.pages[0]?.total ?? 0;
  const filtered = q !== '' || state !== 'all';

  return (
    <section className="flex flex-col gap-6" aria-label={t('adminPosts.view.posts')}>
      <SearchField
        label={t('adminPosts.search')}
        placeholder={t('adminPosts.search')}
        value={typed}
        maxLength={80}
        autoComplete="off"
        onChange={(e) => setTyped(e.target.value)}
      />
      <ChipRow label={t('adminPosts.stateLabel')} scroll="bleed" className="gap-x-4">
        {POST_STATE_FILTERS.map((s) => (
          <Chip key={s} selected={state === s} onClick={() => onState(s)}>
            {t(`adminPosts.state.${s}`)}
          </Chip>
        ))}
      </ChipRow>

      {posts.isPending ? (
        <div role="status">
          <span className="sr-only">{t('common.loading')}</span>
          <RowStack as="div" aria-hidden open>
            {[0, 1, 2, 3].map((i) => (
              <ListRowSkeleton key={i} sub index={i} />
            ))}
          </RowStack>
        </div>
      ) : posts.isError && rows.length === 0 ? (
        <EmptyState
          title={t('adminPosts.errorTitle')}
          body={t('adminPosts.errorBody')}
          action={
            <TextLink text="body" onClick={() => void posts.refetch()}>
              {t('common.retry')}
            </TextLink>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? t('marketplace.noResultsTitle') : t('adminPosts.emptyTitle')}
          body={filtered ? t('adminPosts.noMatchBody') : t('adminPosts.emptyBody')}
        />
      ) : (
        <>
          {/* A new query keeps the old rows, dimmed, until its answer lands (no skeleton per keystroke). */}
          <div aria-busy={posts.isPlaceholderData || undefined} className={posts.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <RowStack open close aria-label={t('adminPosts.view.posts')}>
              {rows.map((p) => (
                <PostRow key={p.id} post={p} />
              ))}
            </RowStack>
          </div>
          {/* The paging block is 8 closer to the stack and its count 4 closer to "Továbbiak" than the first cut (review S-admin-posts 7). */}
          <div className="flex flex-col items-center">
            {posts.hasNextPage ? (
              <TextLink text="body" trail={<ChevronDown />} busy={posts.isFetchingNextPage} onClick={() => void posts.fetchNextPage()}>
                {t('adminPosts.more')}
              </TextLink>
            ) : null}
            {posts.isError ? (
              // A page that failed to load keeps the rows already there; the same link asks again.
              <p role="alert" className="text-cap text-text-2">
                {t('adminPosts.errorBody')}
              </p>
            ) : null}
            <p className="text-data text-text-3">{t('adminPosts.countOf', { shown: rows.length, total })}</p>
          </div>
        </>
      )}
    </section>
  );
}

function PostRow({ post }: { post: AdminPostRow }) {
  const { t } = useTranslation();
  const { date } = useStamp();
  const kind = useKindLabel();
  const byline = [post.authorHandle ? `@${post.authorHandle}` : post.authorName, kind(post.kind)].filter(Boolean).join(' · ');
  return (
    <ListRow
      to={`/admin/marketplace/posts/${post.id}`}
      title={post.title}
      lines={2}
      sub={
        <>
          <span className="block truncate">{byline}</span>
          <span className="mt-1 flex w-full items-center gap-3">
            <PostStateTag state={post.state} />
            <span className="text-data text-text-3">{date(post.publishedAt ?? post.createdAt)}</span>
            {post.openReports > 0 ? (
              <span className="ms-auto text-data text-warning">{t('adminPosts.reportCount', { count: post.openReports })}</span>
            ) : null}
          </span>
        </>
      }
      subLines={2}
      pad="loose"
      chevron
    />
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { Challenge } from '../../lib/lifeos-api';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Rule } from '../../ui/data/Rule';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { useToast } from '../../ui/feedback/ToastHost';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { plusCoins, poolSub } from './challengeFormat';
import { refusalOf, useArchiveChallenge, useChallenges } from './challengesApi';
import { ChallengeSheet } from './ChallengeSheet';
import { WeightBar } from './WeightBar';

/**
 * KIHÍVÁSOK, pushed from MAI DOBÁS ("Kihívások ›") — frame `lifeos/challenges-2` (design round B,
 * Figma 190:440): the pool the daily draw chooses from.
 *
 * Composition, as `challenges-2.part.js` on the kit:
 *
 *   header      pushed: "‹ MAI DOBÁS" (app/routeMeta.ts), the title "Kihívások", the header plus (a new challenge)
 *   rule        ONE body line in text-2: "A nagyobb súly gyakrabban kerül elő."
 *   AKTÍV       "8 / 50" (live / the pool cap) in mono; rows: title, "Kategória · súly N", the weight as five
 *               6 × 4 segments (text-1 on, track off) and the "+N" coins in mono, 28 wide, right-aligned
 *   ARCHIVÁLT   the count; rows in text-2 with "Visszaállítás" (cap text link)
 *   no pill
 *
 * A row opens the challenge sheet (edit: name, category, coins, weight; "Archiválás"; "Törlés"). The
 * frame draws one row mid-swipe with "Archiválás" revealed; the kit has no swipe (ListRow: "no swipe"),
 * so archiving is the sheet's action — the same words, one tap further (pkg deviations).
 *
 * Undrawn states, in the same language: loading (rows), a failed read (danger line with "Újra"), an
 * empty pool (the empty state with "+ Új kihívás"), no archived challenge (the section is left out),
 * a refused restore (the cap of 50 reached: a toast says so).
 */
export function ChallengePoolPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const pool = useChallenges();
  const archive = useArchiveChallenge();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<{ open: boolean; challenge?: Challenge }>({ open: false });

  // `?new=1` (MAI DOBÁS's empty state): open the sheet for a new challenge once, then drop the flag.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setSheet({ open: true });
    params.delete('new');
    setParams(params, { replace: true });
  }, [params, setParams]);

  const data = pool.data;
  const newChallenge = () => setSheet({ open: true });

  const restore = (c: Challenge) =>
    archive.mutate(
      { id: c.id, archive: false },
      { onError: (err) => toast(refusalOf(err) === 'LIMIT_REACHED' ? t('challenges.limit', { count: data?.limits.pool ?? 50 }) : t('challenges.failed'), 'error') },
    );

  return (
    <Screen top="push">
      <ScreenHeader
        kind="push"
        title={t('challenges.pool')}
        trailing={
          <Pressable variant="link" shape="icon" aria-label={t('challenges.new')} aria-haspopup="dialog" className="[&_svg]:size-6" onClick={newChallenge}>
            <Plus aria-hidden />
          </Pressable>
        }
      />
      <p className="text-body text-text-2">{t('challenges.poolRule')}</p>

      {pool.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void pool.refetch()} busy={pool.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('challenges.failed')}
        </NoticeLine>
      ) : !data ? (
        <PoolSkeleton />
      ) : data.active.length === 0 && data.archived.length === 0 ? (
        <EmptyState
          title={t('challenges.emptyTitle')}
          body={t('challenges.emptyBody')}
          action={
            <TextLink text="body" lead={<Plus aria-hidden />} onClick={newChallenge} aria-haspopup="dialog">
              {t('challenges.new')}
            </TextLink>
          }
        />
      ) : (
        <>
          <PoolSection title={t('challenges.active')} count={`${data.active.length} / ${data.limits.pool}`}>
            <RowStack>
              {data.active.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.name}
                  sub={poolSub(t, c)}
                  aria-haspopup="dialog"
                  onClick={() => setSheet({ open: true, challenge: c })}
                  trailing={
                    <span className="flex items-center gap-4">
                      <WeightBar weight={c.weight} />
                      <span className="w-7 text-right text-data text-text-2">{plusCoins(c.points, i18n.language)}</span>
                    </span>
                  }
                />
              ))}
            </RowStack>
          </PoolSection>

          {data.archived.length > 0 ? (
            <PoolSection title={t('challenges.archived')} count={String(data.archived.length)}>
              <RowStack>
                {data.archived.map((c) => (
                  <ListRow
                    key={c.id}
                    title={c.name}
                    sub={poolSub(t, c)}
                    tone="muted"
                    aria-haspopup="dialog"
                    onClick={() => setSheet({ open: true, challenge: c })}
                    control={
                      <TextLink busy={archive.isPending && archive.variables?.id === c.id} onClick={() => restore(c)}>
                        {t('challenges.restore')}
                      </TextLink>
                    }
                  />
                ))}
              </RowStack>
            </PoolSection>
          ) : null}
        </>
      )}

      <ChallengeSheet open={sheet.open} challenge={sheet.challenge} onClose={() => setSheet({ open: false, challenge: sheet.challenge })} />
    </Screen>
  );
}

/** The kit `sect` with gap 8 (challenges-2): the strong rule, the eyebrow with its mono count, the rows. */
function PoolSection({ title, count, children }: { title: string; count: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex w-full flex-col gap-2">
      <Rule strong />
      <SectionHeader rule={false} title={title} trailing={<span className="text-data text-text-2">{count}</span>} />
      {children}
    </section>
  );
}

function PoolSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="flex w-full flex-col gap-2">
      <Rule strong />
      <RowStack as="div">
        {[0, 1, 2, 3].map((i) => (
          <ListRowSkeleton key={i} sub index={i} />
        ))}
      </RowStack>
    </div>
  );
}

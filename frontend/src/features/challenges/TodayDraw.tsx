import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Repeat } from 'lucide-react';
import type { ChallengeDraw, LifeosToday } from '../../lib/lifeos-api';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Section } from '../../ui/data/SectionHeader';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { useToast } from '../../ui/feedback/ToastHost';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { TextLink } from '../../ui/primitives/TextLink';
import { categoryLabel, plusCoins } from './challengeFormat';
import { DRAW_KEY, newClientKey, refusalOf, useChallengeTask, useDraw, useReroll } from './challengesApi';

/** The draw is still on the table (drawn / due / an empty pool): NAPI DOBÁS stands above MAI EDZÉS (ma-4). */
export function drawIsOpen(draw: ChallengeDraw | null | undefined) {
  return !!draw && draw.state !== 'picked';
}

export interface TodayDrawProps {
  /** `GET /lifeos/today` — its `challenge` and, for the picked task, its `tasks`. */
  day: LifeosToday;
  /**
   * Where Ma mounts this block: `open` above MAI EDZÉS (the pending draw, frame ma-4), `settled`
   * after FELADATOK (the picked teaser, frame ma-1). Each mount draws only its own state, so the
   * page writes both and the block moves when the pick is made.
   */
  place: 'open' | 'settled';
}

/**
 * NAPI DOBÁS on Ma — frames `lifeos/ma-4` (the draw pending) and `lifeos/ma-1` (picked, "elvállalva").
 * Exported for package S-ma's TodayPage (request R-S-challenges-02); nothing else mounts it.
 *
 *   ma-4   the section (rule, eyebrow, "⇄ Újradobás · 1" in the head while the reroll is left), one body
 *          line "Koppints egyre: ma ez a küldetésed.", three option rows: the ring, title, category,
 *          the "+N" coins in mono text-1. A tap opens MAI DOBÁS (/challenges) with that option chosen,
 *          where "Ezt vállalom" makes the pick — challenges-1 is that very state (an option chosen, the
 *          pill); the pick is the day's one irreversible choice, so it is never a single stray tap.
 *   ma-1   the section with "ELVÁLLALVA" (or "TELJESÍTVE") as its micro meta and one row: the ring /
 *          the lime tick, the challenge, "Mai kihívás · +15 érme". A tap completes the task the pick
 *          became (or reopens it: the award is reversed exactly) — the same write as any task row.
 *
 * `due` (nothing drawn yet today): the block draws once (idempotent per day) and shows three row
 * skeletons meanwhile. `empty_pool`: the eyebrow with "Kihívások ›" and one line, the door to the pool.
 * No zone yet (`challenge` null): nothing is drawn — the draw needs the user's day.
 */
export function TodayDraw({ day, place }: TodayDrawProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const draw = useDraw();
  const reroll = useReroll();
  const taskWrite = useChallengeTask();
  const drewFor = useRef<string | null>(null);
  const rerollKey = useRef(newClientKey('r'));
  const c = day.challenge;
  const optionIds = c?.options.map((o) => o.id).join(',') ?? '';

  useEffect(() => {
    if (place !== 'open' || !c || c.state !== 'due' || drewFor.current === c.date) return;
    drewFor.current = c.date;
    draw.mutate(undefined, { onError: () => void qc.invalidateQueries({ queryKey: ['lifeos', 'today'] }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, c?.state, c?.date]);

  useEffect(() => {
    rerollKey.current = newClientKey('r');
  }, [optionIds]);

  if (!c) return null;
  if ((place === 'open') !== drawIsOpen(c)) return null;
  const lang = i18n.language;
  const title = t('challenges.today.title');

  if (c.state === 'due' && draw.isError) {
    // The first draw of the day failed and the read still says `due`: say so, with the way to try again.
    return (
      <Section title={title}>
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11 justify-end" onClick={() => draw.mutate(undefined, { onError: () => void qc.invalidateQueries({ queryKey: ['lifeos', 'today'] }) })} busy={draw.isPending}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('challenges.failed')}
        </NoticeLine>
      </Section>
    );
  }

  if (c.state === 'picked') {
    const chosen = c.options.find((o) => o.chosen);
    if (!chosen || !c.picked) return null;
    const done = c.picked.done;
    const sub = t('challenges.today.picked', { coins: plusCoins(chosen.points, lang) });
    const toggle = () =>
      taskWrite.mutate(
        { taskId: c.picked!.taskId, done: !done },
        { onError: () => toast(t('challenges.failed'), 'error') },
      );
    return (
      <Section
        title={title}
        trailing={<span className="text-micro uppercase text-text-2">{done ? t('challenges.state.done') : t('challenges.state.accepted')}</span>}
      >
        <RowStack>
          {c.picked.taskDeleted ? (
            <ListRow lead={<CheckMark done={done} className="-mr-1" />} title={chosen.name} sub={sub} />
          ) : (
            <ListRow
              lead={<CheckMark done={done} className="-mr-1" />}
              title={chosen.name}
              sub={sub}
              role="checkbox"
              aria-checked={done}
              busy={taskWrite.isPending}
              onClick={toggle}
            />
          )}
        </RowStack>
      </Section>
    );
  }

  if (c.state === 'empty_pool') {
    return (
      <Section
        title={title}
        trailing={
          <TextLink to="/challenges/pool" trail={<ChevronRight aria-hidden />} className="min-w-11 justify-end">
            {t('challenges.pool')}
          </TextLink>
        }
      >
        <p className="text-body text-text-2">{t('challenges.emptyBody')}</p>
      </Section>
    );
  }

  const onReroll = () =>
    reroll.mutate(rerollKey.current, {
      onError: (err) => {
        if (refusalOf(err)) void qc.invalidateQueries({ queryKey: ['lifeos', 'today'] });
        void qc.invalidateQueries({ queryKey: DRAW_KEY });
        toast(t('challenges.failed'), 'error');
      },
    });

  return (
    <Section
      title={title}
      trailing={
        c.state === 'drawn' && c.rerollsLeft > 0 ? (
          <TextLink lead={<Repeat aria-hidden />} busy={reroll.isPending} onClick={onReroll}>
            {t('challenges.today.reroll', { count: c.rerollsLeft })}
          </TextLink>
        ) : undefined
      }
    >
      <p className="text-body text-text-2">{t('challenges.today.hint')}</p>
      {c.state === 'due' ? (
        <RowStack as="div">
          {[0, 1, 2].map((i) => (
            <ListRowSkeleton key={i} sub leadSlot index={i} />
          ))}
        </RowStack>
      ) : (
        <RowStack>
          {c.options.map((o) => (
            <ListRow
              key={o.id}
              lead={<CheckMark done={false} className="-mr-1" />}
              title={o.name}
              sub={categoryLabel(t, o.category) ?? undefined}
              to={`/challenges?option=${o.id}`}
              trailing={<span className="text-data text-text-1">{plusCoins(o.points, lang)}</span>}
            />
          ))}
        </RowStack>
      )}
    </Section>
  );
}

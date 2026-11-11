import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Plus } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRowSkeleton } from '../../ui/data/ListRow';
import { StatBlock } from '../../ui/data/StatBlock';
import { Fraction } from '../../ui/data/Numeral';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { TextLink } from '../../ui/primitives/TextLink';
import type { Habit } from '../../lib/lifeos-api';
import { useHabits } from './habitsApi';
import { countsToday } from './habitFormat';
import { FigUnit, HabitRow } from './HabitRow';
import { HabitSheet } from './HabitSheet';

/**
 * Szokások, pushed from Ma ("Összes ›") — frame `lifeos/habits-1` (design round B, Figma 190:1138).
 *
 * Composition, as `habits-1.part.js` on the kit:
 *
 *   header      pushed: "‹ MA" (app/routeMeta.ts), the title "Szokások"
 *   summary     two stat blocks on one bottom line: MA a/b (good habits due today that are not
 *               times-per-week: done / all — README-ma fix round 1) and LEGHOSSZABB ÉLŐ SOROZAT
 *               (the longest live streak, "31 NAP")
 *   JÓ SZOKÁSOK the head's one action "Új szokás +" (opens the HabitSheet); the good habits
 *   ROSSZ SZOKÁSOK  the bad habits, the list closed by a strong rule
 *   footer      the freeze rule in one line (from the server's rules) and "Archivált szokások · N ›"
 *
 * No lime pill on this screen (the round's rule: at most one; habits-1 has none). The habit rows
 * are `HabitRow` (the lead is the day's tap, the rest opens the habit).
 *
 * Undrawn states, in the same language: loading (summary and row skeletons), a failed read (the
 * danger line with "Újra"), no habit yet (ma-3's empty state: MÉG NINCS SZOKÁSOD, one line, "+ Első
 * szokás"), no bad habit (the section is left out), the archived habits (the footer link opens
 * them in place, dimmed, each opening its page where it can be restored).
 */
export function HabitsPage() {
  const { t } = useTranslation();
  const habits = useHabits();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const data = habits.data;
  const live = data?.habits.filter((h) => !h.archived) ?? [];
  const archived = data?.habits.filter((h) => h.archived) ?? [];
  const good = live.filter((h) => h.kind === 'good');
  const bad = live.filter((h) => h.kind === 'bad');
  const counted = live.filter(countsToday);
  const doneToday = counted.filter((h) => h.log?.status === 'done').length;
  const longest = live.reduce((m, h) => Math.max(m, h.streak.current), 0);

  const newHabit = (
    <TextLink onClick={() => setSheetOpen(true)} trail={<Plus aria-hidden />} aria-haspopup="dialog">
      {t('habits.new')}
    </TextLink>
  );

  return (
    <Screen top="push">
      <ScreenHeader kind="push" title={t('habits.title')} />

      {habits.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void habits.refetch()} busy={habits.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('habits.failed')}
        </NoticeLine>
      ) : !data ? (
        <HabitsSkeleton />
      ) : live.length === 0 && archived.length === 0 ? (
        <EmptyState
          title={t('habits.emptyTitle')}
          body={t('habits.emptyBody')}
          action={
            <TextLink text="body" lead={<Plus aria-hidden />} onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
              {t('habits.first')}
            </TextLink>
          }
        />
      ) : (
        <>
          <div className="flex w-full items-end justify-between gap-6">
            <StatBlock label={t('habits.today')}>
              <Fraction value={doneToday} of={counted.length} srText={t('habits.todaySr', { done: doneToday, count: counted.length })} />
            </StatBlock>
            <StatBlock label={t('habits.longestLive')}>
              <FigUnit value={longest} unit={t('habits.unitDay')} size="num" />
            </StatBlock>
          </div>

          <Section title={t('habits.good')} trailing={newHabit}>
            {good.length > 0 ? (
              <HabitList habits={good} />
            ) : (
              <p className="text-cap text-text-2">{t('habits.emptyBody')}</p>
            )}
          </Section>

          {bad.length > 0 ? (
            <Section title={t('habits.bad')}>
              <HabitList habits={bad} close />
            </Section>
          ) : null}

          <div className="flex w-full flex-col gap-1">
            {data.rules ? (
              <p className="text-cap text-text-2">{t('habits.freezeRule', { every: data.rules.freezeEvery, max: data.rules.maxFreezes })}</p>
            ) : null}
            {archived.length > 0 ? (
              <TextLink
                text="body"
                className="self-start"
                trail={<ChevronRight aria-hidden className={showArchived ? 'rotate-90' : undefined} />}
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
              >
                {t('habits.archivedCount', { count: archived.length })}
              </TextLink>
            ) : null}
            {showArchived && archived.length > 0 ? <HabitList habits={archived} dim /> : null}
          </div>
        </>
      )}

      <HabitSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </Screen>
  );
}

function HabitList({ habits, close = false, dim = false }: { habits: Habit[]; close?: boolean; dim?: boolean }) {
  return (
    <RowStack close={close}>
      {habits.map((h) => (
        <HabitRow key={h.id} habit={h} to={`/habits/${h.id}`} dim={dim} />
      ))}
    </RowStack>
  );
}

/** Loading: the summary's two figures and three rows, where the text will be — never a spinner. */
function HabitsSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="flex w-full flex-col gap-section">
      <div aria-hidden className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-10 w-20" />
        </div>
        <div className="flex flex-col items-start gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>
      <RowStack as="div">
        {[0, 1, 2].map((i) => (
          <ListRowSkeleton key={i} sub index={i} />
        ))}
      </RowStack>
    </div>
  );
}

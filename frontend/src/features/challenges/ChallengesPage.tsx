import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { ChallengeDraw, ChallengeOption } from '../../lib/lifeos-api';
import { cn } from '../../lib/cn';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Rule } from '../../ui/data/Rule';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Dock } from '../../ui/shell/Dock';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { categoryLabel, plusCoins, shortDay } from './challengeFormat';
import { newClientKey, refusalOf, useChallengeToday, useDraw, usePick, useReroll } from './challengesApi';

/**
 * MAI DOBÁS, pushed from Ma — frame `lifeos/challenges-1` (design round B, Figma 190:2): the day's
 * draw of up to three challenges, one reroll, and the pick, which is mandatory.
 *
 * Composition, as `challenges-1.part.js` on the kit:
 *
 *   header        pushed: "‹ MA" (app/routeMeta.ts), the title "Mai dobás", the head link "Kihívások ›" (the pool)
 *   rule          ONE body line in text-2: "Naponta egyszer kötelező: válassz egyet."
 *   section       HÁROM LEHETŐSÉG with the day ("okt. 21.", words, cap) — the kit `sect` with gap 8:
 *                 the strong rule, the eyebrow, the options, the reroll line and the consequence line
 *                 stand 8 apart (not the section's usual 16)
 *   options       a single-choice list (radio rows, closed by a strong rule): title, category, "+N" in
 *                 mono, the set check (ring / lime tick). Once one is chosen its "+N" turns text-1 and
 *                 the others step back to text-3
 *   reroll        "↺ Újradobás" (body-m text link) + "még 1 maradt ma" (cap, text-3)
 *   consequence   "Választás nélkül minden megnyitáskor visszajön." (cap, text-2) — f_app: no penalty
 *   dock          THE lime pill "Ezt vállalom", off until an option is chosen. No skip control.
 *
 * The server's day (B-rewards-challenges api.md): `due` = nothing drawn yet — the page draws (the read
 * never does, and the draw is idempotent per day); `drawn` = the frame; `picked` = the chosen option
 * ticked and "elvállalva" / "teljesítve" on its line, the others in text-3, no reroll and no pill
 * (a second pick is refused); `empty_pool` = nothing to draw from: the empty state leads to the pool.
 *
 * Undrawn states, in the same language: loading (rows where the options will be), a failed read (the
 * danger line with "Újra"), no time zone yet (the draw needs the user's day: the line leads to "Nap
 * és időzóna"), a refused write (a toast; a 409 that says the day moved on reloads the draw).
 */
export function ChallengesPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const today = useChallengeToday();
  const draw = useDraw();
  const reroll = useReroll();
  const pick = usePick();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<number | null>(null);
  // One key per hand on the table: a retried reroll / pick replays instead of acting twice.
  const rerollKey = useRef(newClientKey('r'));
  const pickKey = useRef(newClientKey('p'));
  const drewFor = useRef<string | null>(null);

  const day = today.data?.draw ?? null;
  const optionIds = day?.options.map((o) => o.id).join(',') ?? '';

  // `due`: the client draws (once per day and page; a second call would only answer the same draw).
  useEffect(() => {
    if (!day || day.state !== 'due' || drewFor.current === day.date) return;
    drewFor.current = day.date;
    draw.mutate(undefined, { onError: (err) => (refusalOf(err) ? void today.refetch() : toast(t('challenges.failed'), 'error')) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.state, day?.date]);

  // A new hand (reroll, a new day) clears the choice and takes new keys. Opened from Ma's NAPI DOBÁS
  // (`?option=<id>`, a tap on one of ma-4's options), that option starts chosen — challenges-1's state.
  useEffect(() => {
    const asked = Number(params.get('option'));
    setSelected(day?.state === 'drawn' && day.options.some((o) => o.id === asked) ? asked : null);
    rerollKey.current = newClientKey('r');
    pickKey.current = newClientKey('p');
    // Only a new hand resets the choice; the URL is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionIds]);

  const refused = (err: unknown) => {
    // NO_DRAW / REROLL_USED / ALREADY_PICKED / NOT_OFFERED: the day is not what this page shows any more.
    if (refusalOf(err)) void today.refetch();
    toast(t('challenges.failed'), 'error');
  };

  const onReroll = () => reroll.mutate(rerollKey.current, { onError: refused });
  const onPick = () => {
    if (selected === null) return;
    pick.mutate({ challengeId: selected, clientKey: pickKey.current }, { onError: refused });
  };

  const poolLink = (
    <TextLink to="/challenges/pool" trail={<ChevronRight aria-hidden />}>
      {t('challenges.pool')}
    </TextLink>
  );

  let body: ReactNode;
  if (today.isError && !today.data) {
    body = (
      <NoticeLine
        tone="danger"
        role="alert"
        action={
          <TextLink className="min-w-11" onClick={() => void today.refetch()} busy={today.isFetching}>
            {t('common.retry')}
          </TextLink>
        }
      >
        {t('challenges.failed')}
      </NoticeLine>
    );
  } else if (!today.data || (day && day.state === 'due')) {
    body = <DrawSkeleton />;
  } else if (!day) {
    body = (
      <NoticeLine
        role="status"
        action={
          <TextLink to="/settings/day" trail={<ChevronRight aria-hidden />}>
            {t('settings.day.title')}
          </TextLink>
        }
      >
        {t('challenges.noZone')}
      </NoticeLine>
    );
  } else if (day.state === 'empty_pool' || day.options.length === 0) {
    body = (
      <EmptyState
        title={t('challenges.emptyTitle')}
        body={t('challenges.emptyBody')}
        action={
          <TextLink text="body" to="/challenges/pool" trail={<ChevronRight aria-hidden />}>
            {t('challenges.pool')}
          </TextLink>
        }
      />
    );
  } else {
    body = (
      <DrawSection
        day={day}
        selected={selected}
        onSelect={setSelected}
        dayLabel={shortDay(day.date, i18n.language)}
        rerollBusy={reroll.isPending}
        onReroll={onReroll}
        locked={pick.isPending}
      />
    );
  }

  const open = day?.state === 'drawn' && day.options.length > 0;

  return (
    <Screen top="push">
      <ScreenHeader kind="push" title={t('challenges.title')} trailing={poolLink} />
      <p className="text-body text-text-2">{t('challenges.rule')}</p>
      {body}
      {open ? (
        <Dock>
          <Pressable variant="primary" size="lg" className="w-full" disabled={selected === null} busy={pick.isPending} onClick={onPick}>
            {t('challenges.take')}
          </Pressable>
        </Dock>
      ) : null}
    </Screen>
  );
}

interface DrawSectionProps {
  day: ChallengeDraw;
  selected: number | null;
  onSelect: (id: number) => void;
  dayLabel: string;
  rerollBusy: boolean;
  onReroll: () => void;
  locked: boolean;
}

/** HÁROM LEHETŐSÉG — the kit `sect` with gap 8 (challenges-1): rule, eyebrow, options, reroll, consequence. */
function DrawSection({ day, selected, onSelect, dayLabel, rerollBusy, onReroll, locked }: DrawSectionProps) {
  const { t } = useTranslation();
  const picked = day.state === 'picked';
  const chosenId = picked ? (day.options.find((o) => o.chosen)?.id ?? null) : selected;

  return (
    <section aria-labelledby="draw-head" className="flex w-full flex-col gap-2">
      <Rule strong />
      <SectionHeader rule={false} title={t('challenges.options')} titleId="draw-head" trailing={<span className="text-cap-m text-text-2">{dayLabel}</span>} />
      <RowStack as="div" role="radiogroup" aria-labelledby="draw-head" close>
        {day.options.map((o) => (
          <OptionRow
            key={o.id}
            option={o}
            chosen={o.id === chosenId}
            anyChosen={chosenId !== null}
            status={picked && o.chosen ? (day.picked?.done ? t('challenges.state.done') : t('challenges.state.accepted')) : null}
            onSelect={picked || locked ? undefined : () => onSelect(o.id)}
          />
        ))}
      </RowStack>
      {picked ? null : (
        <>
          <div className="flex items-center gap-3">
            <TextLink text="body" lead={<RotateCcw aria-hidden />} disabled={day.rerollsLeft === 0 || locked} busy={rerollBusy} onClick={onReroll}>
              {t('challenges.reroll')}
            </TextLink>
            <span className="text-cap text-text-3">{t('challenges.rerollsLeft', { count: day.rerollsLeft })}</span>
          </div>
          <p className="text-cap text-text-2">{t('challenges.noPick')}</p>
        </>
      )}
    </section>
  );
}

interface OptionRowProps {
  option: ChallengeOption;
  chosen: boolean;
  anyChosen: boolean;
  /** "elvállalva" / "teljesítve" once the pick is made. */
  status: string | null;
  /** Undefined once the pick is made: the list is then read only. */
  onSelect?: () => void;
}

function OptionRow({ option: o, chosen, anyChosen, status, onSelect }: OptionRowProps) {
  const { t, i18n } = useTranslation();
  const category = categoryLabel(t, o.category);
  const sub = [category, status].filter(Boolean).join(' · ') || undefined;
  // challenges-1: nothing chosen = text-2 (the kit value); once chosen, the chosen "+N" is text-1 and the others text-3.
  const ink = !anyChosen ? 'text-text-2' : chosen ? 'text-text-1' : 'text-text-3';
  const trailing = (
    <span className="flex items-center gap-4">
      <span className={cn('text-data', ink)}>{plusCoins(o.points, i18n.language)}</span>
      <CheckMark done={chosen} />
    </span>
  );
  return onSelect ? (
    <ListRow title={o.name} sub={sub} trailing={trailing} role="radio" aria-checked={chosen} onClick={onSelect} />
  ) : (
    <ListRow title={o.name} sub={sub} trailing={trailing} />
  );
}

/** Loading (and the moment of the day's first draw): the section head and three rows where the options will be. */
function DrawSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="flex w-full flex-col gap-2">
      <Rule strong />
      <Skeleton className="h-5 w-32" />
      <RowStack as="div">
        {[0, 1, 2].map((i) => (
          <ListRowSkeleton key={i} sub index={i} />
        ))}
      </RowStack>
    </div>
  );
}

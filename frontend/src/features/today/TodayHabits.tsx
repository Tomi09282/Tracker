import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, X } from 'lucide-react';
import type { Habit } from '../../lib/lifeos-api';
import { Dot } from '../../ui/data/Dot';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { RowStack } from '../../ui/data/RowStack';
import { Section } from '../../ui/data/SectionHeader';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { useToast } from '../../ui/feedback/ToastHost';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { TextLink } from '../../ui/primitives/TextLink';
import { clockOf, coins, habitDone, multiplier, relapsedToday, signed } from './model';
import { TodayEmpty } from './TodayEmpty';
import { useLogHabit, useRelapse } from './useTodayActions';

/**
 * SZOKÁSOK — frames ma-1, ma-2, ma-4 (rows) and ma-3 (empty), `habitRow` / `streakCol` /
 * `leadMark` / `countSub` of `figma-build/lifeos/ma.common.js`:
 *
 *   [lead 44]  12  Olvasás 20 perc                       14 NAP     streak: ink-tight dataL + micro unit
 *                  Kész · 07:40 · +13 érme              ▬ ×1,25     multiplier: 12 × 4 lime + mono
 *                                                  1 FAGYASZTÁS     freezes: micro
 *
 * Lead (README-ma "Habit lead slot"): done = the lime tick · to do = the ring · counted and started
 * = the ring with an ink arc · a bad habit clean so far = the 8 pt lime dot · relapsed today = the
 * danger ×. A row hugs its content with a floor of 64 (the kit's row), 10 above and below.
 *
 * TAP TO LOG (f_app's HabitRow, B-habits-tasks api.md): a one-step good habit toggles done / not
 * done (`count` 1 / 0); a counted habit adds one and wraps to 0 at full; a skipped habit is logged
 * again. A bad habit's tap asks first (a relapse costs coins and ends the streak, f_app confirms
 * it too), and the toast that confirms the relapse carries "Visszavonás" (count − 1). Every count
 * is absolute, so a retried tap lands on the same state. Habits pay when the day settles, so the
 * coins on the row are the server's preview. A failed write keeps the row as it was and says so.
 */
export function TodayHabits({ habits, timeZone }: { habits: Habit[] | null; timeZone: string | null }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const log = useLogHabit();
  const relapse = useRelapse();
  const [asking, setAsking] = useState<Habit | null>(null);

  const failed = () => toast(t('today.failed'), 'error');

  const tap = (h: Habit) => {
    if (h.kind === 'bad') {
      setAsking(h);
      return;
    }
    const count = h.log?.status === 'skipped' ? 0 : (h.log?.count ?? 0);
    const next = h.targetCount > 1 ? (count >= h.targetCount ? 0 : count + 1) : habitDone(h) ? 0 : 1;
    log.mutate({ id: h.id, count: next }, { onError: failed });
  };

  const confirmRelapse = () => {
    const h = asking;
    if (!h) return;
    const before = h.log?.count ?? 0;
    relapse.mutate(
      { id: h.id, count: before + 1 },
      {
        onSuccess: () => {
          setAsking(null);
          toast(t('today.habit.relapseLogged'), 'info', {
            onUndo: () => relapse.mutate({ id: h.id, count: before }, { onError: failed }),
          });
        },
        onError: () => {
          setAsking(null);
          failed();
        },
      },
    );
  };

  const busyId = (log.isPending ? log.variables?.id : undefined) ?? (relapse.isPending ? relapse.variables?.id : undefined);

  if (habits === null) return null;

  return (
    <>
      {habits.length === 0 ? (
        <Section title={t('today.habits.title')}>
          <TodayEmpty
            title={t('today.habits.emptyTitle')}
            body={t('today.habits.emptyBody')}
            action={t('today.habits.first')}
            to="/habits"
          />
        </Section>
      ) : (
        <Section
          title={t('today.habits.title')}
          trailing={
            <TextLink to="/habits" trail={<ChevronRight />} className="min-w-11 justify-end">
              {t('today.habits.all')}
            </TextLink>
          }
        >
          <RowStack>
            {habits.map((h) => (
              <HabitRow key={h.id} habit={h} timeZone={timeZone} busy={busyId === h.id} onTap={() => tap(h)} />
            ))}
          </RowStack>
        </Section>
      )}
      <ConfirmSheet
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking?.name ?? ''}
        message={t('today.habit.relapseAsk')}
        confirmLabel={t('today.habit.relapseConfirm')}
        onConfirm={confirmRelapse}
        busy={relapse.isPending}
      />
    </>
  );
}

/** The rows' loading stand-in: three rows with the lead slot kept empty. */
export function TodayHabitsSkeleton() {
  return (
    <RowStack as="div">
      {[0, 1, 2].map((i) => (
        <ListRowSkeleton key={i} sub leadSlot index={i} />
      ))}
    </RowStack>
  );
}

function HabitRow({ habit: h, timeZone, busy, onTap }: { habit: Habit; timeZone: string | null; busy: boolean; onTap: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const good = h.kind === 'good';
  const done = habitDone(h);
  const count = h.log?.count ?? 0;
  const relapsed = relapsedToday(h);
  const weekly = h.scheduleType === 'times_per_week';

  let sub: ReactNode;
  if (!good) {
    sub = relapsed ? (
      <span className="text-danger">
        {t('today.habit.relapsed', { count })} · {t('today.coins', { value: signed(coins(h.previewMinor), lang) })}
      </span>
    ) : (
      t('today.habit.clean', { count: h.streak.current })
    );
  } else if (h.log?.status === 'skipped') {
    sub = t('today.habit.skipped');
  } else if (h.targetCount > 1) {
    sub = (
      <span className="inline-flex items-center gap-2 align-middle">
        <span className="inline-flex items-baseline gap-1">
          <span className="text-data text-text-1">
            {Math.min(count, h.targetCount)}/{h.targetCount}
          </span>
          {h.unit ? <span>{h.unit}</span> : null}
        </span>
        <ProgressBar className="w-14" value={Math.min(count, h.targetCount)} max={h.targetCount} label={h.name} />
      </span>
    );
  } else if (done && h.log?.doneAt) {
    sub = [
      t('today.habit.done'),
      clockOf(h.log.doneAt, lang, timeZone),
      t('today.coins', { value: signed(coins(h.previewMinor), lang) }),
    ].join(' · ');
  } else if (weekly) {
    sub = t('today.habit.weekly', { count: h.timesPerWeek ?? 0, done: h.weekDone ?? 0 });
  } else if (h.reminderTime) {
    sub = t('today.habit.reminder', { time: h.reminderTime });
  } else {
    sub = t('today.habit.pending');
  }

  // The streak column: days (weeks for a times-per-week habit), then the live multiplier, then the
  // freezes held. A relapse today ends the streak: the figure is 0 at once (ma-1 "Esti nassolás").
  const streak = relapsed ? 0 : weekly ? (h.streak.weekStreak ?? 0) : h.streak.current;
  const ink = streak > 0 ? 'text-text-1' : 'text-text-3';
  const trailing = (
    <span className="flex flex-col items-end gap-1.5">
      <span className="inline-flex items-baseline gap-1">
        <span className={`text-data-l [text-box:trim-both_cap_alphabetic] ${ink}`}>{streak.toLocaleString(lang)}</span>
        <span className={`text-micro uppercase [text-box:trim-both_cap_alphabetic] ${streak > 0 ? 'text-text-2' : 'text-text-3'}`}>
          {weekly ? t('today.habit.weeks') : t('today.habit.days')}
        </span>
      </span>
      {good && !relapsed && h.streak.multiplierBp > 10000 ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1 w-3 rounded-bar bg-accent" />
          <span className="text-data text-text-1">{multiplier(h.streak.multiplierBp, lang)}</span>
        </span>
      ) : null}
      {h.streak.freezes > 0 ? (
        <span className="text-micro uppercase text-text-2">{t('today.habit.freezes', { count: h.streak.freezes })}</span>
      ) : null}
    </span>
  );

  const lead = !good ? (
    <span className="-mr-1 flex size-11 shrink-0 items-center justify-center">
      {relapsed ? <X aria-hidden className="size-5 text-danger" strokeWidth={2} /> : <Dot size={8} />}
    </span>
  ) : h.targetCount > 1 && !done && count > 0 ? (
    <PartialRing fraction={count / h.targetCount} />
  ) : (
    <CheckMark done={done} className="-mr-1" />
  );

  const checkable = good && h.targetCount === 1;
  return (
    <ListRow
      lead={lead}
      title={h.name}
      sub={sub}
      trailing={trailing}
      onClick={onTap}
      busy={busy}
      role={checkable ? 'checkbox' : undefined}
      aria-checked={checkable ? done : undefined}
      aria-label={
        good && h.targetCount > 1
          ? t('today.habit.addOne', { name: h.name, count: Math.min(count, h.targetCount), target: h.targetCount })
          : undefined
      }
    />
  );
}

/**
 * The counted habit's lead (`leadMark('part', frac)`): the 24 pt ring in `edge` with an ink arc from
 * twelve o'clock, as far round as the count has come. A picture: the row carries the state.
 */
function PartialRing({ fraction }: { fraction: number }) {
  const a = 2 * Math.PI * Math.min(Math.max(fraction, 0), 0.999);
  const x = 12 + 11 * Math.sin(a);
  const y = 12 - 11 * Math.cos(a);
  return (
    <span aria-hidden className="-mr-1 flex size-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 24 24" fill="none" className="size-6">
        <circle cx="12" cy="12" r="11" className="stroke-edge" strokeWidth="1.5" />
        <path
          d={`M12 1A11 11 0 ${fraction > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`}
          className="stroke-text-1"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

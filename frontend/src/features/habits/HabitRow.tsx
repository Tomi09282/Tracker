import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { Numeral, type NumeralSize } from '../../ui/data/Numeral';
import { useToast } from '../../ui/feedback/ToastHost';
import { cn } from '../../lib/cn';
import type { Habit } from '../../lib/lifeos-api';
import { useHabitLog } from './habitsApi';
import { clockOf, isCounted, maskDays, multiplierLabel, signedCoins, streakOf, todayOf } from './habitFormat';

/*
 * The habit row and its gamification parts — the local compositions of design round B
 * (`figma-build/lifeos/ma.common.js`: habitRow, leadMark, streakCol, multLine, freezeLine, figUnit,
 * countSub). They are not kit components: the Figma file builds them per page from kit parts
 * (setCheck, progressBar, the mono roles), and so do these. Ma (S-today) can import `HabitRow`.
 *
 *   habitRow    44 lead · 12 · title (body-m) over one sub line (cap, or the count) · 12 · streak
 *               column; 10 above and below, at least 64 tall; a hairline between two (RowStack).
 *   lead        done = the lime tick · to do = the ring · counted = the ring with a text-1 arc ·
 *               bad habit clean so far = an 8 pt lime dot · relapsed today = the danger ×.
 *   streak      the figure (data-l) + its unit (micro) on one baseline, 4 apart; under it, 6 apart,
 *               the multiplier (a 12 × 4 lime segment + the mono figure) and the freezes (micro).
 *
 * The lead of a good habit is its own button (44 pt): a tap is the f_app counted-habit tap — the
 * count + 1, back to 0 from full (a plain habit toggles). Everything else in the row is the link to
 * the habit's page. A bad habit's lead is a picture: a relapse is recorded on the habit's page,
 * behind a confirmation, because it costs coins.
 */

/** A figure with its unit on one baseline: "14 NAP" (data-l + micro) or "31 NAP" at num / giant. */
export function FigUnit({
  value,
  unit,
  size = 'dataL',
  unitClass = 'text-micro',
  quiet = false,
}: {
  value: number | string;
  unit: string;
  size?: 'dataL' | NumeralSize;
  unitClass?: 'text-micro' | 'text-eyebrow';
  quiet?: boolean;
}) {
  const unitInk = quiet ? 'text-text-3' : 'text-text-2';
  if (size === 'dataL') {
    return (
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
        <span className={cn('text-data-l', quiet ? 'text-text-3' : 'text-text-1')}>{value}</span>
        <span className={cn(unitClass, unitInk)}>{unit}</span>
      </span>
    );
  }
  // A big figure is ink-tight (its box ends on the baseline); the unit is trimmed to cap and
  // baseline the same way, so the two bottoms are one baseline.
  return (
    <span className={cn('inline-flex items-end whitespace-nowrap', size === 'giant' ? 'gap-3' : 'gap-1')}>
      <Numeral value={value} size={size} tone={quiet ? 'pending' : 'ink'} />
      <span className={cn(unitClass, unitInk, '[text-box:trim-both_cap_alphabetic]')}>{unit}</span>
    </span>
  );
}

/** The multiplier: a 12 × 4 lime segment (lime = live) and the mono figure, 6 apart. */
export function MultiplierLine({ bp }: { bp: number }) {
  const { i18n } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-1 w-3 rounded-bar bg-accent" />
      <span className="text-data text-text-1">{multiplierLabel(bp, i18n.language)}</span>
    </span>
  );
}

export function FreezeLine({ count }: { count: number }) {
  const { t } = useTranslation();
  return <span className="text-micro text-text-2">{t('habits.freezes', { count })}</span>;
}

/** The right column of a row: streak figure, then the multiplier (above ×1) and the freezes (when held). */
export function StreakColumn({ habit }: { habit: Habit }) {
  const { t } = useTranslation();
  const s = streakOf(habit);
  return (
    <span className="flex shrink-0 flex-col items-end gap-1.5">
      <FigUnit value={s.value} unit={s.weeks ? t('habits.unitWeek') : t('habits.unitDay')} quiet={s.value === 0} />
      {habit.streak.multiplierBp > 10000 ? <MultiplierLine bp={habit.streak.multiplierBp} /> : null}
      {habit.streak.freezes > 0 ? <FreezeLine count={habit.streak.freezes} /> : null}
    </span>
  );
}

/** The ring with a text-1 arc from 12 o'clock: a counted habit part-way to its target. */
function PartialRing({ fraction }: { fraction: number }) {
  const f = Math.min(0.999, Math.max(0.001, fraction));
  const a = 2 * Math.PI * f;
  const x = 12 + 11 * Math.sin(a);
  const y = 12 - 11 * Math.cos(a);
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="11" className="stroke-edge" strokeWidth="1.5" />
      <path d={`M12 1A11 11 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`} className="stroke-text-1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The 44 pt lead picture of a habit's state today (aria-hidden: the button or the row names the state). */
export function LeadMark({ habit, count }: { habit: Habit; count: number }) {
  if (habit.kind === 'bad') {
    return (
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center">
        {count > 0 ? <X className="size-5 text-danger" strokeWidth={2} /> : <span className="size-2 rounded-full bg-accent" />}
      </span>
    );
  }
  const done = count >= habit.targetCount;
  if (isCounted(habit) && count > 0 && !done) {
    return (
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center">
        <PartialRing fraction={count / habit.targetCount} />
      </span>
    );
  }
  return <CheckMark done={done} />;
}

/** The sub line under a habit's name. */
function SubLine({ habit, count }: { habit: Habit; count: number }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  if (habit.kind === 'bad') {
    return count > 0 ? (
      <span className="truncate text-cap text-danger">
        {t('habits.relapseToday', { count, coins: signedCoins(habit.previewMinor, locale) })}
      </span>
    ) : (
      <span className="truncate text-cap text-text-2">{t('habits.cleanFor', { count: habit.streak.current })}</span>
    );
  }
  if (isCounted(habit)) {
    return (
      <span className="flex items-center gap-2">
        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span className="text-data text-text-1">
            {count}/{habit.targetCount}
          </span>
          {habit.unit ? <span className="text-cap text-text-2">{habit.unit}</span> : null}
        </span>
        <ProgressBar value={Math.min(count, habit.targetCount)} max={habit.targetCount} className="w-14" />
      </span>
    );
  }
  const parts: string[] = [scheduleWord(habit, t, locale)];
  if (habit.log?.status === 'skipped') parts.push(t('habits.skipped'));
  else if (habit.log?.status === 'done' && habit.log.doneAt) parts.push(t('habits.doneAt', { time: clockOf(habit.log.doneAt, locale) }));
  else if (habit.scheduleType === 'times_per_week') parts.push(t('habits.weekDone', { done: habit.weekDone ?? 0, target: habit.timesPerWeek ?? 0 }));
  else if (habit.reminderTime && habit.scheduledToday) parts.push(t('habits.reminderAt', { time: habit.reminderTime }));
  return <span className="truncate text-cap text-text-2">{parts.join(' · ')}</span>;
}

/** "Naponta", "Heti 3×", "H K Sze Cs P". */
export function scheduleWord(habit: Habit, t: (k: string, o?: Record<string, unknown>) => string, locale: string) {
  if (habit.scheduleType === 'times_per_week') return t('habits.perWeek', { count: habit.timesPerWeek ?? 0 });
  if (habit.scheduleType === 'weekdays') return maskDays(habit.weekdayMask, locale);
  return t('habits.scheduleDaily');
}

/**
 * One habit: the lead (a button for a good habit that can be logged today), the name and its sub
 * line, the streak column. `to` is the habit's page; `dim` draws an archived habit (title text-2,
 * no lead action).
 */
export function HabitRow({ habit, to, dim = false }: { habit: Habit; to: string; dim?: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const log = useHabitLog();
  const today = todayOf(habit);
  // While a tap is on its way the row already shows the count it asked for.
  const pendingCount = log.isPending && log.variables && log.variables.kind !== 'skip' ? log.variables.count : null;
  const count = pendingCount ?? (habit.kind === 'bad' ? today.relapses : today.count);

  const canLog = habit.kind === 'good' && !habit.archived && habit.scheduledToday && !dim;
  const tap = () => {
    if (!canLog || log.isPending) return;
    const next = count >= habit.targetCount ? 0 : count + 1;
    log.mutate({ kind: 'log', habitId: habit.id, count: next }, { onError: () => toast(t('habits.failed'), 'error') });
  };

  let lead: ReactNode = <LeadMark habit={habit} count={count} />;
  if (habit.kind === 'good' && !dim) {
    lead = (
      <button // token-lint-disable — a checkbox around the kit's setCheck picture (44 pt, the lead slot); Pressable's icon shape restyles every svg inside it (size 24, stroke 1.75), which would thin the lime tick the frame draws at 2.5
        type="button"
        role="checkbox"
        aria-checked={count >= habit.targetCount ? true : count > 0 ? 'mixed' : false}
        aria-label={habit.name}
        aria-busy={log.isPending || undefined}
        aria-disabled={!canLog || undefined}
        onClick={tap}
        className={cn(
          'shrink-0 cursor-pointer rounded-full transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
          'active:opacity-[var(--pressed-opacity)] aria-busy:opacity-[var(--pressed-opacity)]',
          'aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:active:opacity-40',
        )}
      >
        <LeadMark habit={habit} count={count} />
      </button>
    );
  } else if (dim) {
    lead = <span className="opacity-40">{lead}</span>;
  }

  return (
    <div data-habit-row className="flex min-h-16 w-full items-center gap-3 py-2.5">
      {lead}
      <Link
        to={to}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 self-stretch',
          'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)] active:opacity-[var(--pressed-opacity)]',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn('truncate text-body-m', dim ? 'text-text-2' : 'text-text-1')}>{habit.name}</span>
          <SubLine habit={habit} count={count} />
        </span>
        <StreakColumn habit={habit} />
      </Link>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Numeral } from '../../ui/data/Numeral';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import type { IntervalBlock } from './intervalPlan';
import type { IntervalPhase } from './useIntervalTimer';

export interface IntervalStageProps {
  block: IntervalBlock;
  phase: IntervalPhase;
  remaining: number;
  progress: number;
  round: number;
  totalRounds: number;
  running: boolean;
  interrupted: boolean;
  pendingCount: number;
  failedRounds: number[];
  screenMaySleep: boolean;
  nextName: string | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
  onConfirmCrossed: () => void;
  onDiscardCrossed: () => void;
}

/**
 * The interval stage — no frame draws it (both player frames are straight sets), so it is composed
 * from the kit in the frames' language and lives where the figure lives: in the hero, under the
 * exercise title, in the 95 pt the figure, the side switch and the legend leave when the timer is
 * shown. It costs the set list nothing, so the check controls never move.
 *
 * Running: one line of 48 pt — the countdown (`Numeral num`, ticking in fixed digit cells), the
 * phase word after it in the phase's TEXT colour (never a strip), the three bare icon buttons at
 * the right end — then the 4 pt line draining (lime only while working), then the round / next line.
 * Idle, done and the interruption prompt carry the screen's ONE lime pill; while they show it the
 * active set row draws its ring instead of its pill (the player passes `lampElsewhere`).
 */
const PHASE_TEXT: Record<string, string> = {
  prepare: 'text-warning',
  work: 'text-accent',
  rest: 'text-success',
  setBreak: 'text-text-1',
  paused: 'text-text-2',
  done: 'text-text-1',
  idle: 'text-text-2',
};

const mmss = (total: number) => {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function IntervalStage(props: IntervalStageProps) {
  const { t } = useTranslation();
  const { block, phase, remaining, progress, round, totalRounds, running, interrupted } = props;
  const label = t('workout.interval.stageLabel');

  // A block whose durations the coach never wrote: saying so is the only honest option.
  if (!block.runnable) {
    return (
      <section aria-label={label} className="flex flex-col">
        <p className="text-cap text-text-2">{t('workout.interval.notConfigured')}</p>
      </section>
    );
  }

  // The interruption prompt REPLACES the stage: the lifter answers before the block continues.
  if (interrupted) {
    return (
      <section aria-label={label} className="flex flex-col">
        <p className="text-body-m text-text-1">{t('workout.interval.interrupted')}</p>
        <p className="text-cap text-text-2">{t('workout.interval.interruptedBody', { count: props.pendingCount })}</p>
        <div className="flex items-center gap-6">
          <Pressable variant="primary" size="sm" onClick={props.onConfirmCrossed}>
            {t('workout.interval.confirmRounds')}
          </Pressable>
          <TextLink text="body" onClick={props.onDiscardCrossed}>
            {t('workout.interval.discardRounds')}
          </TextLink>
        </div>
      </section>
    );
  }

  if (phase === 'idle' || phase === 'done') {
    return (
      <section aria-label={label} className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <p className="text-eyebrow uppercase text-text-1">
            {phase === 'done' ? t('workout.interval.done') : t('workout.interval.title')}
          </p>
          <p className="text-cap text-text-2">{t('workout.interval.round', { round: block.rounds, total: block.rounds })}</p>
        </div>
        <Pressable variant="primary" size="sm" icon={<Play aria-hidden />} onClick={props.onStart}>
          {t('workout.interval.start')}
        </Pressable>
      </section>
    );
  }

  const paused = phase === 'paused';
  const phaseWord = t(`workout.interval.${paused ? 'pause' : phase}`);
  const info = [
    t('workout.interval.round', { round, total: totalRounds }),
    props.nextName ? t('workout.interval.nextExercise', { name: props.nextName }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // A warning outranks the round line in the 18 pt it has (prep: the info line yields).
  const warning = props.screenMaySleep
    ? t('workout.interval.wakeLockLost')
    : props.failedRounds.length
      ? t('workout.interval.unsent', { count: props.failedRounds.length })
      : null;

  return (
    <section aria-label={label} className="flex flex-col">
      <div className="flex h-12 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          {/* `aria-live` stays off: a countdown that announces every second is unusable with a
              screen reader. One announcement per PHASE goes out through the status line below. */}
          <Numeral value={mmss(remaining)} size="num" mode="tick" />
          <span className={cn('truncate text-eyebrow uppercase', PHASE_TEXT[phase] ?? 'text-text-1')}>{phaseWord}</span>
        </div>
        <div className="-mr-2.5 flex shrink-0">
          <Pressable
            variant="link"
            shape="icon"
            aria-label={t(paused ? 'workout.interval.resume' : 'workout.interval.pause')}
            onClick={paused ? props.onResume : props.onPause}
          >
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          </Pressable>
          <Pressable
            variant="link"
            shape="icon"
            aria-label={t('workout.interval.skip')}
            // Skipping while paused would advance a clock that is not running.
            disabled={paused}
            onClick={props.onSkip}
          >
            <SkipForward aria-hidden />
          </Pressable>
          <Pressable variant="link" shape="icon" aria-label={t('workout.interval.stop')} onClick={props.onStop}>
            <Square aria-hidden />
          </Pressable>
        </div>
      </div>
      <ProgressBar
        tone={phase === 'work' ? 'accent' : 'ink'}
        value={Math.min(1, Math.max(0, progress))}
        label={phaseWord}
        valueText={mmss(remaining)}
        className="mt-3"
      />
      {warning ? (
        <NoticeLine tone="warn" compact className="mt-2">
          {warning}
        </NoticeLine>
      ) : (
        <p className="mt-2 truncate text-cap text-text-2">{info}</p>
      )}
      <p role="status" className="sr-only">
        {running ? t(`workout.interval.${phase}`) : ''}
      </p>
    </section>
  );
}

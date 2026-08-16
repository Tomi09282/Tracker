import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
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
 * E27 — the interval stage.
 *
 * IT LIVES INSIDE THE PLAYER'S EXISTING HERO BOX, as a third branch beside the muscle map and the
 * dumbbell placeholder. That box is already reserved, already 16:9, already conditional — so the
 * stage costs ZERO vertical budget, all four grid rows survive, the set list keeps its full
 * `minmax(0,1fr)` height, the check buttons never move, and the no-scroll law is untouched.
 *
 * A full-screen overlay was rejected: it would force dismiss → check → re-enter on every round, it
 * would sit exactly where the rest timer already lives, and the z ladder has nothing between
 * `--z-nav` and `--z-sheet` to put it on.
 *
 * THE HEIGHT BUDGET IS MEASURED, NOT ESTIMATED. At 375 px the content column is 343 px, so the
 * 16:9 hero is 193 px — not the ~250 px the first draft assumed. `overflow-hidden` on the hero
 * would have hidden the overflow rather than reporting it. Everything below fits 154 px:
 * phase word 24 + countdown 48 + bar 6 + info line 16 + gaps 12 + controls 48.
 *
 * The ring is a full-width BAR for the same reason: a 56 px ring does not fit, and a bar is more
 * legible from the floor anyway — which is where the phone is.
 */
const PHASE_COLOR: Record<string, string> = {
  prepare: 'var(--warning)',
  work: 'var(--accent)',
  rest: 'var(--success)',
  setBreak: 'var(--info)',
  paused: 'var(--text-2)',
  done: 'var(--success)',
  idle: 'var(--text-2)',
};

const mmss = (total: number) => {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function IntervalStage(props: IntervalStageProps) {
  const { t } = useTranslation();
  const { block, phase, remaining, progress, round, totalRounds, running, interrupted } = props;

  // A block whose durations the coach never wrote. Saying so is the only honest option: guessing
  // 60 seconds would have the lifter training to a prescription that does not exist.
  if (!block.runnable) {
    return (
      <section
        aria-label={t('workout.interval.stageLabel')}
        className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <p className="text-body-s text-text-2">{t('workout.interval.notConfigured')}</p>
      </section>
    );
  }

  // The interruption prompt REPLACES the stage rather than floating over it. The lifter has to
  // answer before the block continues, and the conservative action is the one on the right.
  if (interrupted) {
    return (
      <section
        aria-label={t('workout.interval.stageLabel')}
        className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <p className="text-title-3">{t('workout.interval.interrupted')}</p>
        <p className="text-caption text-text-2">
          {t('workout.interval.interruptedBody', { count: props.pendingCount })}
        </p>
        <div className="flex gap-2">
          <Pressable shape="chip" density="compact" variant="primary" onClick={props.onConfirmCrossed}>
            {t('workout.interval.confirmRounds')}
          </Pressable>
          <Pressable shape="chip" density="compact" variant="secondary" onClick={props.onDiscardCrossed}>
            {t('workout.interval.discardRounds')}
          </Pressable>
        </div>
      </section>
    );
  }

  if (phase === 'idle' || phase === 'done') {
    return (
      <section
        aria-label={t('workout.interval.stageLabel')}
        className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <p className="text-title-3">
          {phase === 'done' ? t('workout.interval.done') : t('workout.interval.title')}
        </p>
        <p className="text-caption text-text-2">
          {t('workout.interval.round', { round: block.rounds, total: block.rounds })}
        </p>
        <Pressable shape="chip" variant="primary" onClick={props.onStart}>
          <Play className="size-icon-s" aria-hidden />
          {t('workout.interval.start')}
        </Pressable>
      </section>
    );
  }

  const paused = phase === 'paused';
  const colour = PHASE_COLOR[phase] ?? 'var(--text-1)';
  const info = [
    t('workout.interval.round', { round, total: totalRounds }),
    props.nextName ? t('workout.interval.nextExercise', { name: props.nextName }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      aria-label={t('workout.interval.stageLabel')}
      className="flex h-full flex-col justify-center gap-1 px-2 py-1"
    >
      <p className="text-title-3 text-center" style={{ color: colour }}>
        {t(`workout.interval.${paused ? 'pause' : phase}`)}
      </p>

      {/* `aria-live="off"` deliberately: a countdown that announces every second is unusable with
          a screen reader. One announcement per PHASE goes out through the status line below. */}
      <p className="text-timer text-center font-display tabular-nums" aria-live="off">
        {mmss(remaining)}
      </p>

      <div className="h-1.5 w-full rounded-chip bg-surface-3">
        <div
          className="h-full rounded-chip"
          style={{
            width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
            backgroundColor: colour,
            transition: 'width var(--duration-base) linear',
          }}
        />
      </div>

      <p className="text-caption truncate text-center text-text-2">{info}</p>

      <div className="flex justify-center gap-2">
        <Pressable
          shape="icon"
          density="compact"
          variant="secondary"
          aria-label={t(paused ? 'workout.interval.resume' : 'workout.interval.pause')}
          onClick={paused ? props.onResume : props.onPause}
        >
          {paused ? <Play className="size-icon-s" aria-hidden /> : <Pause className="size-icon-s" aria-hidden />}
        </Pressable>
        <Pressable
          shape="icon"
          density="compact"
          variant="secondary"
          aria-label={t('workout.interval.skip')}
          // Skipping while paused would advance a clock that is not running — the anchor maths
          // assumes a live `elapsed()`.
          disabled={paused}
          onClick={props.onSkip}
        >
          <SkipForward className="size-icon-s" aria-hidden />
        </Pressable>
        <Pressable
          shape="icon"
          density="compact"
          variant="secondary"
          aria-label={t('workout.interval.stop')}
          onClick={props.onStop}
        >
          <Square className="size-icon-s" aria-hidden />
        </Pressable>
      </div>

      {/* The screen can sleep, so SAY so. The lifter can move the phone; being told after the
          block, by a prompt asking whether they kept going, helps nobody. */}
      {props.screenMaySleep ? (
        <p className="text-caption text-center text-warning">{t('workout.interval.wakeLockLost')}</p>
      ) : null}

      {props.failedRounds.length ? (
        <p className={cn('text-caption text-center', 'text-warning')}>
          {t('workout.interval.unsent', { count: props.failedRounds.length })}
        </p>
      ) : null}

      <p role="status" className="sr-only">
        {running ? t(`workout.interval.${phase}`) : ''}
      </p>
    </section>
  );
}

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Numeral } from '../../ui/data/Numeral';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { TextLink } from '../../ui/primitives/TextLink';

export interface RestTimerProps {
  remaining: number;
  /** 0 → 1 as the rest elapses. */
  progress: number;
  running: boolean;
  nextUp?: string | null;
  onSkip: () => void;
}

/**
 * The rest between two sets — frame `workout-2`, the band under the set list.
 *
 * It rises IN FLOW, as the page's own black, into the cell the exercise switcher holds (the player
 * stacks the two; the switcher goes inert underneath): nothing floats, nothing is fixed above the
 * tab bar, and nothing the lifter can reach is covered — the switcher is one rest away, as it
 * always was under the old card. The first 20 pt fade in, so the active pill's glow is never cut.
 *
 * Inside: the clock is the screen's ONE giant numeral, ticking in fixed digit cells so it never
 * jitters sideways (DEV-003); its draining lime line runs under it, numeral then bar, as on Home.
 * The skip link stands level with the clock's top, "Következik:" and the next exercise on the
 * clock's baseline, in a column on the right.
 *
 * THE SECONDS ARE THE INFORMATION. The number is derived from a wall-clock deadline in
 * `useRestTimer`, never counted down, so a backgrounded tab or a locked screen still shows the
 * right one. A countdown that announces every second is unusable with a screen reader: the clock
 * speaks through its `srText` only when focused into, and "rest over" is spoken by the player.
 *
 * ONE LOOK (E22 = A, as the database serves it). The chip and top-bar looks were admin variants
 * of the old floating card; Pulse has one look (`variants.json`, R11).
 */
export function RestTimer({ remaining, progress, running, nextUp, onSkip }: RestTimerProps) {
  const { t } = useTranslation();
  if (!running) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const clock = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="relative z-[2] flex flex-col gap-4 bg-linear-to-b from-surface-0/0 from-0% to-surface-0 to-15% pr-6 pt-4 max-[23.5rem]:pr-4">
      <div className="relative h-[102px]">
        <Numeral value={clock} size="giant" mode="tick" className="relative -top-px" srText={t('workout.restRemaining', { time: clock })} />
        <TextLink lead={<X aria-hidden />} onClick={onSkip} className="absolute right-2.5 -top-[18px]">
          {t('workout.skipRest')}
        </TextLink>
        {nextUp ? (
          <p className="absolute -bottom-[5px] right-0 flex w-[126px] flex-col gap-0.5">
            <span className="text-cap text-text-2">{t('workout.nextUp')}:</span>
            <span className="text-body-m text-text-1">{nextUp}</span>
          </p>
        ) : null}
      </div>
      <ProgressBar tone="accent" value={1 - progress} max={1} label={t('workout.restRemaining', { time: clock })} />
    </div>
  );
}

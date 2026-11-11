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

const BAND = 'relative z-[var(--z-dock)] flex flex-col gap-4 bg-linear-to-b from-surface-0/0 from-0% to-surface-0 to-15% pr-6 pt-[15px] max-[23.5rem]:pr-4'; // token-lint-disable — the frame's 15 above the clock row (617 -> 632), which makes the band its 137; not a layout gap

/**
 * The rest between two sets — frame `workout-2`, the band under the set list.
 *
 * It rises IN FLOW, as the page's own black, into the cell the exercise switcher holds (the player
 * stacks the two; the switcher goes inert underneath): nothing floats, nothing is fixed above the
 * tab bar, and nothing the lifter can reach is covered — the switcher is one rest away, as it
 * always was under the old card. The first 20 pt fade in, so the active pill's glow is never cut.
 *
 * Its height is the frame's, to the point: 15 + the 102 clock row + 16 + the 4 pt line = 137
 * (`BUDGET.rest` in the player). One point more and the table above gives that point up, so the
 * closing rule rises onto the active row and the row's two field edges vanish under it.
 *
 * It is painted AFTER the chrome, as the frame paints it: the line runs 750-754, inside the tab
 * bar's fade (744 down), and under that translucent fade the flat accent read as a dull olive. So
 * the band takes the docked layer (`--z-dock`: over the bar's fade, under every sheet and toast),
 * as `Dock` does for a docked action. It ends 28 above the tab cells, so it covers no tab.
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
    <div className={BAND}>
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

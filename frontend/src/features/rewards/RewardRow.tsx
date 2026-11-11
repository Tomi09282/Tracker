import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Dot } from '../../ui/data/Dot';
import { Numeral } from '../../ui/data/Numeral';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { Pic } from '../../ui/media/Pic';
import { TextLink } from '../../ui/primitives/TextLink';
import { cn } from '../../lib/cn';
import type { Reward } from '../../lib/lifeos-api';

/*
 * The reward row and the reward words — the local compositions of design round B
 * (`figma-build/lifeos/c.common.js`: rewardRow, figUnit). They are not kit components: the Figma
 * file builds them per page from kit parts (the coin picture, the mono roles, progressBar, the
 * 6 pt dot, textLink), and so do these.
 *
 *   rewardRow   14 above, 8 below, 10 between its three lines:
 *                 name (body-m, one line) · 16 · the 18 pt coin, 6, the cost (data-l)
 *                 the 4 pt bar to the cost, full width
 *                 the status line, 28 tall: [6 pt lime dot, 8] status · extra (cap) and, on a
 *                 redeemable row, the quiet text link "Beváltás" on the right edge
 *   bar         ink, never lime (it is not the screen's live datum): full = enough, full at 50 %
 *               = resting (pihenő), empty = a one-time reward that was redeemed, partial = saving up
 *
 * The name is the link to the reward (a stretched link: the whole row is its target), and
 * "Beváltás" stands above it as a control of its own — one interactive element never sits inside
 * another.
 */

/** Whole coins of an integer minor amount (display only; never sent back). */
export const coinsOf = (minor: number) => Math.round(minor / 100);

/** The status word of a reward and the redeemed count after it: "beváltható · 4× beváltva". */
export function useRewardStatus(reward: Reward) {
  const { t } = useTranslation();
  const a = reward.availability;
  let status: string | null;
  if (a.ok) status = t('rewards.status.ok');
  else if (a.reason === 'COOLDOWN') status = t('rewards.status.cooldown', { count: a.daysLeft });
  else if (a.reason === 'ALREADY_REDEEMED') status = t('rewards.status.redeemed');
  else if (a.reason === 'INSUFFICIENT') status = t('rewards.status.short', { count: coinsOf(a.missingMinor) });
  else status = null;
  // A one-time reward that was redeemed says "egyszeri"; everything else counts its redemptions.
  const extra = !a.ok && a.reason === 'ALREADY_REDEEMED' ? t('rewards.once') : reward.redeemedCount > 0 ? t('rewards.redeemedCount', { count: reward.redeemedCount }) : null;
  return { ok: a.ok, status, extra };
}

/** A figure with its unit on one baseline: the giant "190" + "érme" (cap), 12 apart, as figUnit. */
export function FigUnit({ value, unit }: { value: number | string; unit: string }) {
  return (
    <span className="inline-flex items-end gap-3 whitespace-nowrap">
      <Numeral value={value} size="giant" />
      <span className="font-body text-cap normal-case text-text-2 [text-box:trim-both_cap_alphabetic]">{unit}</span>
    </span>
  );
}

/** The coin picture (18 pt) and the mono cost: the trailing figure of a reward row. */
export function CostFigure({ minor, quiet = false }: { minor: number; quiet?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <Pic slot="coin" width={18} />
      <span className={cn('text-data-l', quiet ? 'text-text-2' : 'text-text-1')}>{coinsOf(minor)}</span>
    </span>
  );
}

export function RewardRow({ reward, onRedeem, dim = false }: { reward: Reward; onRedeem?: (reward: Reward) => void; dim?: boolean }) {
  const { t } = useTranslation();
  const { ok, status, extra } = useRewardStatus(reward);
  const once = !reward.availability.ok && reward.availability.reason === 'ALREADY_REDEEMED';
  const resting = !reward.availability.ok && reward.availability.reason === 'COOLDOWN';
  const quiet = once || dim;
  const live = ok && !dim;

  let words: ReactNode = null;
  if (status) {
    words = (
      <>
        <span className={live ? 'text-text-1' : undefined}>{status}</span>
        {extra ? ` · ${extra}` : null}
      </>
    );
  } else if (extra) words = extra;

  const redeemable = live && onRedeem !== undefined;
  const spoken = [reward.name, t('rewards.costLine', { count: coinsOf(reward.costMinor) }), status, extra].filter(Boolean).join(', ');

  // The whole row is the link to the reward (a 97 pt target); "Beváltás" is a control of its own,
  // a SIBLING laid over the status line's right end — one interactive element never sits inside
  // another.
  return (
    <div className={cn('relative w-full', dim && 'opacity-60')}>
      <Link
        to={`/rewards/${reward.id}`}
        aria-label={spoken}
        className="flex w-full flex-col gap-2.5 pb-2 pt-3.5 outline-none focus-visible:rounded-2 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] active:opacity-60"
      >
        <span className="flex w-full items-center gap-4">
          <span className={cn('min-w-0 flex-1 truncate text-body-m', quiet ? 'text-text-2' : 'text-text-1')}>{reward.name}</span>
          <CostFigure minor={reward.costMinor} quiet={quiet} />
        </span>
        <span aria-hidden className={cn('block', resting && 'opacity-50')}>
          <ProgressBar value={once ? 0 : reward.progressBp} max={10000} label={t('rewards.progressSr', { name: reward.name })} />
        </span>
        <span aria-hidden className={cn('flex h-7 w-full items-center gap-2', redeemable && 'pe-20')}>
          {live ? <Dot tone="live" /> : null}
          <span className="min-w-0 flex-1 truncate text-cap text-text-2">{words}</span>
        </span>
      </Link>
      {redeemable ? (
        <span className="absolute bottom-2 right-0 flex h-7 items-center">
          <TextLink className="-my-2" aria-haspopup="dialog" onClick={() => onRedeem?.(reward)}>
            {t('rewards.redeem')}
          </TextLink>
        </span>
      ) : null}
    </div>
  );
}

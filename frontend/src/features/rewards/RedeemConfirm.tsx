import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { useToast } from '../../ui/feedback/ToastHost';
import { ApiError } from '../../lib/api';
import type { Reward } from '../../lib/lifeos-api';
import { coinsOf } from './RewardRow';
import { newClientKey, useRedeemReward } from './rewardsApi';

/**
 * The redemption's confirmation — the confirm sheet that rewards-1's "Beváltás" and
 * reward-detail's pill open (README-jutalmak-ermek-admin: "opens the confirm sheet"; the frames do
 * not draw it). f_app's copy, one currency: the reward's name, "Beváltod 80 érméért?", "Beváltom".
 *
 * ONE idempotency key per opened sheet: a retry after a lost answer is the same redemption, never
 * a second debit. A refusal (ALREADY_REDEEMED / COOLDOWN / INSUFFICIENT: the shown state was
 * stale) closes the sheet and says so once; the refreshed reads then show why.
 */
export function RedeemConfirm({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const redeem = useRedeemReward();
  const key = useRef(newClientKey('r'));
  const open = reward !== null;
  // The last reward stays the sheet's content while it closes.
  const shown = useRef(reward);
  if (reward) shown.current = reward;
  const last = shown.current;

  useEffect(() => {
    if (!open) return;
    key.current = newClientKey('r');
    redeem.reset();
    // A new key only when a sheet opens, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reward?.id]);

  const fire = () => {
    if (!reward) return;
    redeem.mutate(
      { id: reward.id, clientKey: key.current },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          // A refusal is final for this key: close and say so. A lost answer keeps the sheet
          // open with its danger state, and the retry sends the SAME key.
          if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
            onClose();
            toast(t('rewards.failed'), 'error');
          }
        },
      },
    );
  };

  return (
    <ConfirmSheet
      open={open}
      onClose={onClose}
      title={last?.name ?? ''}
      message={last ? t('rewards.confirmBody', { count: coinsOf(last.costMinor) }) : undefined}
      confirmLabel={t('rewards.confirmYes')}
      tone="default"
      busy={redeem.isPending}
      status={redeem.isError ? 'error' : 'idle'}
      onConfirm={fire}
      onRetry={redeem.isError ? fire : undefined}
    />
  );
}

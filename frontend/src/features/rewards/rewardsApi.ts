import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../lib/api';
import type {
  Reward,
  RewardCreate,
  RewardDetailResponse,
  RewardPatch,
  RewardRedeemResponse,
  RewardRedemption,
  RewardResponse,
  RewardsResponse,
} from '../../lib/lifeos-api';

/**
 * The reward shop — the B-rewards-challenges routes (contract:
 * docs/pipeline/pulse/pkg/B-rewards-challenges/api.md, types: lib/lifeos-api.ts Phase 4). The hooks
 * live under a non-`use*` file name, as `habits/habitsApi.ts` does, so the frozen
 * `features/**\/use*.ts` glob needs no exception.
 *
 * NOT QUEUED OFFLINE (plan L9): a redemption is a spend of today's spendable balance, and every
 * other write here changes what a later redemption costs or allows. A failed write is reported and
 * never kept for later.
 *
 * The client computes nothing that the server decides: availability, the progress to the cost, the
 * balance after a redemption and Profil's "N elérhető" are all read from the answers.
 */

export const REWARDS_KEY = ['rewards'] as const;
export const rewardKey = (id: number) => ['rewards', id] as const;

/** A missing reward and another account's reward are the same 404; a server without 033 is a 404 too. */
const noRetryOn404 = (count: number, err: unknown) => !(err instanceof ApiError && err.status === 404) && count < 2;

export function useRewards() {
  return useQuery({
    queryKey: REWARDS_KEY,
    queryFn: () => apiWithRefresh<RewardsResponse>('/rewards'),
    retry: noRetryOn404,
  });
}

export function useRewardDetail(id: number | null) {
  return useQuery({
    queryKey: rewardKey(id ?? 0),
    queryFn: () => apiWithRefresh<RewardDetailResponse>(`/rewards/${id}`),
    enabled: id !== null,
    retry: noRetryOn404,
  });
}

/**
 * A write changed what the shop shows: the reward itself goes straight into the detail cache, and
 * every read that derives from rewards or the balance is refetched (the list's availability and
 * order, the wallet, the statement, Profil's count).
 */
function refreshAfter(qc: QueryClient, reward?: Reward) {
  if (reward) qc.setQueryData<RewardDetailResponse>(rewardKey(reward.id), (old) => (old ? { ...old, reward } : old));
  void qc.invalidateQueries({ queryKey: REWARDS_KEY });
  void qc.invalidateQueries({ queryKey: ['coin-wallet'] });
  void qc.invalidateQueries({ queryKey: ['coin-ledger'] });
}

/** A fresh idempotency key for one create or one redemption (8..64 of [A-Za-z0-9_-]). */
export function newClientKey(prefix: string) {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${raw.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
}

export function useCreateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RewardCreate) => apiWithRefresh<RewardResponse>('/rewards', { method: 'POST', body }),
    onSuccess: ({ reward }) => refreshAfter(qc, reward),
  });
}

export function usePatchReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: RewardPatch }) =>
      apiWithRefresh<RewardResponse>(`/rewards/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: ({ reward }) => refreshAfter(qc, reward),
  });
}

/** Archive (out of the shop, the redemptions kept) or restore (counts against the live cap). */
export function useArchiveReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: number; archive: boolean }) =>
      apiWithRefresh<RewardResponse>(`/rewards/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST', body: {} }),
    onSuccess: ({ reward }) => refreshAfter(qc, reward),
  });
}

/**
 * One redemption. The body is the idempotency key and nothing else: the cost is the stored
 * reward's, so a forged price cannot reach the server. The same key again is a replay (no second
 * debit). The caller makes ONE key per opened confirmation.
 */
export function useRedeemReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, clientKey }: { id: number; clientKey: string }) =>
      apiWithRefresh<RewardRedeemResponse>(`/rewards/${id}/redeem`, { method: 'POST', body: { clientKey } }),
    // Every refusal (ALREADY_REDEEMED / COOLDOWN / INSUFFICIENT) means the shown state was stale.
    onSettled: () => refreshAfter(qc),
  });
}

/** The "Teljesítve" tick: bookkeeping only, it moves no coins. */
export function useFulfilRedemption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fulfilled }: { id: number; rewardId: number; fulfilled: boolean }) =>
      apiWithRefresh<{ redemption: RewardRedemption }>(`/rewards/redemptions/${id}/fulfilled`, { method: 'POST', body: { fulfilled } }),
    onSuccess: ({ redemption }, { rewardId }) => {
      qc.setQueryData<RewardDetailResponse>(rewardKey(rewardId), (old) =>
        old ? { ...old, redemptions: old.redemptions.map((r) => (r.id === redemption.id ? redemption : r)) } : old,
      );
    },
  });
}

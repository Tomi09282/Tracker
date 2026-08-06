import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

/**
 * ═══ EVERY AMOUNT HERE IS AN INTEGER IN MINOR UNITS ════════════════════════════════════════════
 *
 * One coin is 100 minor. Nothing in this module divides, and nothing stores a float. `toCoins`
 * below formats for display and is the ONLY place the decimal point exists — a number that has
 * been through it must never be sent back.
 */
export const MINOR_PER_COIN = 100;

/** Display only. Whole coins, because a fractional coin has no meaning to a person. */
export const toCoins = (minor: number) => Math.round(minor / MINOR_PER_COIN);

export interface StoreItem {
  id: number;
  sku: string;
  title: string;
  description: string | null;
  priceMinor: number;
  entitlementKey: string;
  owned: 0 | 1;
}

export interface LedgerEntry {
  id: number;
  amountMinor: number;
  reasonKey: string;
  reasonLabel: string;
  refType: string | null;
  refId: number | null;
  note: string | null;
  createdAt: number;
}

export interface Achievement {
  key: string;
  titleKey: string;
  category: string;
  /** What it pays NOW. */
  rewardMinor: number;
  sortOrder: number;
  unlockId: number | null;
  unlockedAt: number | null;
  /** What THIS person's unlock actually paid. Two different numbers, deliberately. */
  paidMinor: number | null;
}

export function useWallet() {
  return useQuery({
    queryKey: ['coin-wallet'],
    queryFn: () => apiWithRefresh<{ balanceMinor: number }>('/coins/wallet'),
  });
}

export function useLedger() {
  return useQuery({
    queryKey: ['coin-ledger'],
    queryFn: () => apiWithRefresh<{ entries: LedgerEntry[]; nextCursor: number | null }>('/coins/ledger'),
  });
}

export function useStore() {
  return useQuery({
    queryKey: ['coin-store'],
    queryFn: () => apiWithRefresh<{ items: StoreItem[] }>('/coins/store'),
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: ['coin-achievements'],
    queryFn: () => apiWithRefresh<{ achievements: Achievement[] }>('/coins/achievements'),
  });
}

export function useEntitlements() {
  return useQuery({
    queryKey: ['coin-entitlements'],
    queryFn: () =>
      apiWithRefresh<{ entitlements: { id: number; entitlementKey: string; grantedAt: number }[] }>(
        '/coins/entitlements',
      ),
  });
}

export interface PurchaseResult {
  outcome: 'applied';
  replayed: boolean;
  purchaseId: number;
  sku: string;
  title: string;
  entitlementKey: string;
  pricePaidMinor: number;
  balanceMinor: number;
  entitlementId: number;
}

/**
 * Buy one item.
 *
 * ═══ THE KEY IS MINTED ONCE PER ATTEMPT, NOT PER REQUEST ═══════════════════════════════════════
 *
 * That is the whole point of an idempotency key and it is the easiest thing to get wrong here: a
 * key generated inside `mutationFn` would be fresh on every retry, so a network timeout followed
 * by a retry would be two purchases rather than one — the exact failure the server's machinery
 * exists to prevent, defeated by the client. It is minted by the CALLER, once, when the user taps.
 *
 * `expectedPriceMinor` is the price the user was SHOWN, echoed back so the server can refuse if it
 * has changed. It never becomes the amount charged; it can only make the request fail.
 *
 * Only `[A-Za-z0-9_-]` — ':' is the server's namespace separator and is rejected at the edge.
 */
export function mintIdempotencyKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

export function usePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: number; expectedPriceMinor: number; idempotencyKey: string }) =>
      apiWithRefresh<PurchaseResult>(`/coins/store/${input.itemId}/purchase`, {
        method: 'POST',
        body: {
          idempotency_key: input.idempotencyKey,
          expected_price_minor: input.expectedPriceMinor,
        },
      }),
    // Everything the purchase touched. The theme roster too: buying a pack unlocks it, and a
    // picker still showing it locked is the same class of defect as a stale balance.
    onSuccess: () => {
      for (const key of [
        ['coin-wallet'],
        ['coin-ledger'],
        ['coin-store'],
        ['coin-entitlements'],
        ['theme'],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

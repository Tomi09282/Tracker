import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Trophy, Store, Lock, Check } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { useElementVariant } from '../../ui/feedback/ElementStyleProvider';
import { useMotionSafe } from '../../ui/feedback/useMotionSafe';
import { CoinBalance } from './CoinBalance';
import {
  useWallet,
  useLedger,
  useStore,
  useAchievements,
  usePurchase,
  mintIdempotencyKey,
  toCoins,
} from './useCoins';
import type { StoreItem } from './useCoins';

/**
 * The coin screen: balance, store, achievements, statement.
 *
 * ═══ WHAT IT REFUSES TO DO ═════════════════════════════════════════════════════════════════════
 *
 * There is no "coins remaining until X", no countdown to an offer and no daily-login reward. Each
 * is a mechanic for making somebody open an app they did not want to open, and this is a training
 * product: the coins exist to recognise work that already happened. The screen shows what you
 * have, what it buys and what you earned it for.
 *
 * ═══ AND WHAT IT SHOWS THAT IS UNCOMFORTABLE ═══════════════════════════════════════════════════
 *
 * The statement includes SPENDING, in full, with what it went on. A wallet UI that shows earnings
 * prominently and buries the debits is a wallet UI that is managing the user rather than informing
 * them.
 */
export function CoinsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'store' | 'achievements' | 'statement'>('store');
  const wallet = useWallet();

  return (
    <div className="col-mobile screen-x flex flex-col gap-4 py-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-title-2">{t('coins.title')}</h1>
        {wallet.isLoading ? (
          <span className="h-6 w-16 animate-pulse rounded-chip bg-surface-2" />
        ) : (
          <CoinBalance balanceMinor={wallet.data?.balanceMinor ?? 0} className="text-title-3" />
        )}
      </header>

      {/* A tab is a filter, not a new screen. */}
      <nav className="flex gap-1 rounded-card bg-surface-2 p-1" role="tablist">
        {(['store', 'achievements', 'statement'] as const).map((key) => (
          <Pressable
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? 'secondary' : 'ghost'}
            density="compact"
            className="flex-1"
            onClick={() => setTab(key)}
          >
            {t(`coins.tab.${key}`)}
          </Pressable>
        ))}
      </nav>

      {tab === 'store' ? <StoreTab balanceMinor={wallet.data?.balanceMinor ?? 0} /> : null}
      {tab === 'achievements' ? <AchievementsTab /> : null}
      {tab === 'statement' ? <StatementTab /> : null}
    </div>
  );
}

/* ── STORE ──────────────────────────────────────────────────────────────────────────────────── */

function StoreTab({ balanceMinor }: { balanceMinor: number }) {
  const { t } = useTranslation();
  const store = useStore();
  const purchase = usePurchase();
  const [pending, setPending] = useState<number | null>(null);

  /**
   * THE KEY IS MINTED HERE, ONCE, WHEN THE USER TAPS — not inside the mutation, where a retry
   * would generate a fresh one and turn one intent into two purchases. That would defeat the
   * entire server-side idempotency machinery from the client, which is where it is easiest to
   * defeat and hardest to notice.
   */
  const buy = (item: StoreItem) => {
    if (pending !== null) return;
    setPending(item.id);
    const idempotencyKey = mintIdempotencyKey();
    purchase
      .mutateAsync({ itemId: item.id, expectedPriceMinor: item.priceMinor, idempotencyKey })
      .finally(() => setPending(null));
  };

  if (store.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    );
  }

  const items = store.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState icon={Store} title={t('coins.storeEmptyTitle')} body={t('coins.storeEmptyBody')} />;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const owned = item.owned === 1;
          const affordable = balanceMinor >= item.priceMinor;
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-4"
            >
              <span className="min-w-0 flex-1">
                <span className="text-body block truncate text-text-1">{item.title}</span>
                {item.description ? (
                  <span className="text-caption block text-text-3">{item.description}</span>
                ) : null}
              </span>

              {owned ? (
                <span className="text-caption flex items-center gap-1 text-success">
                  <Check className="size-4" aria-hidden />
                  {t('coins.owned')}
                </span>
              ) : (
                <Pressable
                  variant={affordable ? 'primary' : 'ghost'}
                  density="compact"
                  busy={pending === item.id}
                  // NOT disabled when unaffordable. A control that cannot succeed is worse than
                  // none, and this one CAN — it answers 409 with the real numbers, which is how the
                  // user learns how many coins short they are. Disabling it would hide that.
                  onClick={() => buy(item)}
                >
                  <Coins className="size-4" aria-hidden />
                  {toCoins(item.priceMinor)}
                </Pressable>
              )}
            </li>
          );
        })}
      </ul>

      {/* The server's answer, verbatim, including the ones that are refusals. A purchase screen
          that swallows a 409 leaves the user tapping a button that appears to do nothing. */}
      {purchase.isError ? (
        <p className="text-caption mt-2 text-warning" role="alert">
          {t('coins.purchaseRefused')}
        </p>
      ) : null}
      {purchase.data?.replayed ? (
        <p className="text-caption mt-2 text-text-3" role="status">
          {t('coins.alreadyProcessed')}
        </p>
      ) : null}
    </>
  );
}

/* ── ACHIEVEMENTS ───────────────────────────────────────────────────────────────────────────── */

function AchievementsTab() {
  const { t } = useTranslation();
  const achievements = useAchievements();
  const variant = useElementVariant('E26');
  const motionSafe = useMotionSafe();

  if (achievements.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    );
  }

  const all = achievements.data?.achievements ?? [];
  const unlocked = all.filter((a) => a.unlockId !== null);

  return (
    <>
      <p className="text-caption text-text-3">
        {t('coins.unlockedCount', { done: unlocked.length, total: all.length })}
      </p>

      <ul className="flex flex-col gap-2">
        {all.map((a) => {
          const done = a.unlockId !== null;
          return (
            <li
              key={a.key}
              className={`flex items-center gap-3 rounded-card border p-3 ${
                done ? 'border-accent-subtle bg-surface-2' : 'border-line bg-surface-2'
              }`}
            >
              <Trophy
                className={`size-5 shrink-0 ${done ? 'text-accent' : 'text-text-3'} ${
                  // E26-A flame-flicker, and ONLY when motion is allowed. A permanently animating
                  // icon on a list of a dozen is a battery cost and a distraction.
                  done && variant === 'A' && motionSafe ? 'animate-pulse' : ''
                }`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className={`text-body block truncate ${done ? 'text-text-1' : 'text-text-3'}`}>
                  {/* A LITERAL PREFIX, not t(a.titleKey). The server sends the full dotted
                      string and using it directly works — but nothing static can then see that
                      these keys are referenced, so check-i18n reports seven live strings as dead.
                      An exemption list would have silenced it; that is how NATIVE_LABELS ended up
                      guarding nothing for two phases. Writing the prefix here keeps the gate
                      honest and makes the relationship legible to a reader too. */}
                  {t(`achievement.${a.key}`, { defaultValue: a.key })}
                </span>
                <span className="text-caption text-text-3">
                  {/* WHAT IT PAID YOU, if you have it; what it PAYS, if you do not. Two different
                      numbers on purpose — a retuned reward must not rewrite somebody's history. */}
                  {done
                    ? t('coins.paidYou', { count: toCoins(a.paidMinor ?? 0) })
                    : t('coins.pays', { count: toCoins(a.rewardMinor) })}
                </span>
              </span>
              {!done ? <Lock className="size-4 shrink-0 text-text-3" aria-hidden /> : null}
            </li>
          );
        })}
      </ul>

      {/* Stated rather than left to be discovered. Someone looking at a locked list deserves to
          know nothing is expected of them here — the app awards these, they are not claimed. */}
      <p className="text-caption text-text-3">{t('coins.awardedNote')}</p>
    </>
  );
}

/* ── STATEMENT ──────────────────────────────────────────────────────────────────────────────── */

function StatementTab() {
  const { t } = useTranslation();
  const ledger = useLedger();

  if (ledger.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    );
  }

  const entries = ledger.data?.entries ?? [];
  if (entries.length === 0) {
    return <EmptyState icon={Coins} title={t('coins.noHistoryTitle')} body={t('coins.noHistoryBody')} />;
  }

  return (
    <ul className="flex flex-col gap-1">
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex items-center gap-3 rounded-card border border-line bg-surface-2 px-3 py-2"
        >
          <span className="min-w-0 flex-1">
            <span className="text-body-s block truncate text-text-1">{e.reasonLabel}</span>
            <span className="text-caption text-text-3">
              {new Date(e.createdAt * 1000).toLocaleDateString()}
              {e.note ? ` · ${e.note}` : ''}
            </span>
          </span>
          {/* Earning is accent, spending is plain. Spending is NOT danger-coloured: buying
              something you chose to buy is not an error, and colouring it like one would make the
              statement feel like a list of mistakes. */}
          <span className={`text-body-s tabular-nums ${e.amountMinor > 0 ? 'text-accent' : 'text-text-2'}`}>
            {e.amountMinor > 0 ? '+' : ''}
            {toCoins(e.amountMinor)}
          </span>
        </li>
      ))}
    </ul>
  );
}

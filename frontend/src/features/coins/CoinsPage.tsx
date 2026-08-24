import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Coins,
  Trophy,
  Store,
  Lock,
  CircleCheck,
  ChevronLeft,
  Palette,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { Gauge } from '../../ui/feedback/Gauge';
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
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';

/**
 * The coin screen: balance, store, achievements, statement.
 *
 * ═══ THE ANCHOR IS A RING, AND THE RING IS WHY THE HEADER GOT EMPTIED ══════════════════════════
 *
 * The old screen reported on the same wallet in four places: a coin cluster in the header, a
 * transient delta chip beside it, a pending strip and a helper line at the bottom. Four readouts
 * of one number is how a wallet ends up reading as a form. They are all gone; the ring holds the
 * balance and its caption slot holds the delta.
 *
 * A ring rather than a big number because a balance is a COUNTABLE QUANTITY WITH A SPENDABLE
 * RELATIONSHIP to the prices right underneath it — which is exactly the shape a ring reads as.
 * The arc's referent is the share of lifetime earnings still held, and when the server cannot
 * supply that denominator the ring draws a quiet full track with no arc: see `Wallet` in
 * `useCoins.ts` for why a made-up sweep is the one thing forbidden here.
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
const TABS = ['store', 'achievements', 'statement'] as const;
type CoinTab = (typeof TABS)[number];

export function CoinsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CoinTab>('store');
  const wallet = useWallet();

  const balanceMinor = wallet.data?.balanceMinor ?? 0;

  // The arc's referent, or nothing at all. `lifetimeEarnedMinor` is server-computed and is not
  // sent yet, so today this is always 0 and the ring is a bare track — deliberately. A balance
  // divided by a page of history is not a share of anything.
  const lifetime = wallet.data?.lifetimeEarnedMinor ?? 0;
  const share = lifetime > 0 ? balanceMinor / lifetime : 0;

  // Arrow keys move between tabs. `role="tab"` without them is a tablist a keyboard user has to
  // tab through one pill at a time, which is the shape the previous implementation shipped.
  const move = (dir: 1 | -1) => {
    const i = TABS.indexOf(tab);
    setTab(TABS[(i + dir + TABS.length) % TABS.length] as CoinTab);
  };

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-4">
      {/* The header carries the way OUT and nothing else. /coins is entered from the profile
          stack, so the bottom nav keeps Profil lit and this control is the exit. */}
      <header className="flex items-center gap-tight">
        <Pressable
          variant="secondary"
          shape="icon"
          aria-label={t('common.back')}
          onClick={() => history.back()}
          icon={<ChevronLeft className="size-icon-l" aria-hidden />}
        />
        <h1 className="text-title-1 flex-1 text-center text-text-1">{t('coins.title')}</h1>
        {/* Balances the back control so the title is centred on the SCREEN rather than on the
            space left over beside a button. */}
        <span aria-hidden className="size-11 shrink-0" />
      </header>

      <div className="flex justify-center">
        <Gauge value={share} label={t('coins.title')} className="size-44">
          {wallet.isLoading ? (
            // Chip-shaped, sized to the figure it replaces, so nothing moves on the swap.
            <Skeleton className="h-9 w-28 rounded-chip" />
          ) : wallet.isError ? (
            // A FAILED FETCH RENDERS NO FIGURE. Not a zero. A zero balance and an unknown balance
            // are different facts, and a wallet that shows 0 when it simply could not reach the
            // server has told the user something false about their money.
            <Coins className="size-icon-l text-text-3" aria-hidden />
          ) : (
            <CoinBalance balanceMinor={balanceMinor} />
          )}
        </Gauge>
      </div>

      <div className="flex flex-col gap-group">
        {/* A tab is a filter, not a new screen: the header and the ring stay put. */}
        <div
          role="tablist"
          aria-label={t('coins.title')}
          className="flex gap-1 rounded-chip bg-surface-2 p-1"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              move(1);
            }
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              move(-1);
            }
          }}
        >
          {TABS.map((key) => (
            <Pressable
              key={key}
              id={`coins-tab-${key}`}
              role="tab"
              aria-selected={tab === key}
              // Only the selected tab points at a panel, because only the selected panel is in the
              // DOM. An `aria-controls` naming an id that does not exist is not a harmless extra
              // attribute — it is a broken reference a screen reader tries to follow.
              aria-controls={tab === key ? `coins-panel-${key}` : undefined}
              tabIndex={tab === key ? 0 : -1}
              variant={tab === key ? 'secondary' : 'ghost'}
              shape="chip"
              density="compact"
              className="flex-1"
              onClick={() => setTab(key)}
            >
              {t(`coins.tab.${key}`)}
            </Pressable>
          ))}
        </div>

        <div
          id={`coins-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`coins-tab-${tab}`}
          className="flex flex-col gap-group"
        >
          {tab === 'store' ? <StoreTab balanceMinor={balanceMinor} /> : null}
          {tab === 'achievements' ? <AchievementsTab /> : null}
          {tab === 'statement' ? <StatementTab /> : null}
        </div>
      </div>
    </div>
  );
}

/* ── STORE ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The row glyph, by SKU FAMILY rather than by item.
 *
 * A per-item illustration would need a server column nobody has and would break to a blank square
 * the first time somebody lists a SKU the client has never heard of. A family is stable: every
 * `theme.*` is a palette, everything else is a feature, and an unknown SKU still gets a glyph.
 */
function itemIcon(sku: string): LucideIcon {
  return sku.startsWith('theme.') ? Palette : Sparkles;
}

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
      <div className="flex flex-col gap-group">
        {[0, 1, 2].map((i) => (
          // Card-shaped and card-tall: the real row is an icon holder plus two lines of text.
          <Skeleton key={i} className="h-[76px] rounded-card" />
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
      <ul className="flex flex-col gap-group">
        {items.map((item) => {
          const owned = item.owned === 1;
          const affordable = balanceMinor >= item.priceMinor;
          const Icon = itemIcon(item.sku);
          return (
            <Surface as="li" key={item.id} className="flex items-center gap-group">
              <span
                aria-hidden
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-accent-subtle text-accent"
              >
                <Icon className="size-icon-m" strokeWidth={2} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="text-body-strong block truncate text-text-1">{item.title}</span>
                {item.description ? (
                  <span className="text-caption block truncate text-text-3">{item.description}</span>
                ) : null}
              </span>

              {owned ? (
                <span className="text-body-s flex shrink-0 items-center gap-tight text-success">
                  <CircleCheck className="size-icon-s" aria-hidden />
                  {t('coins.owned')}
                </span>
              ) : (
                <Pressable
                  variant={affordable ? 'primary' : 'secondary'}
                  shape="chip"
                  density="compact"
                  className="shrink-0"
                  busy={pending === item.id}
                  // SINGLE-FLIGHT. While one purchase is settling every OTHER price button goes
                  // inert, so a second tap cannot start a second money-class write behind the
                  // first. The tapped one shows busy instead, which is where the user is looking.
                  disabled={pending !== null && pending !== item.id}
                  // NOT disabled when unaffordable. A control that cannot succeed is worse than
                  // none, and this one CAN — it answers 409 with the real numbers, which is how the
                  // user learns how many coins short they are. Disabling it would hide that.
                  onClick={() => buy(item)}
                  icon={<Coins className="size-icon-s" aria-hidden />}
                >
                  {toCoins(item.priceMinor)}
                </Pressable>
              )}
            </Surface>
          );
        })}
      </ul>

      {/* The server's answer, verbatim, including the ones that are refusals. A purchase screen
          that swallows a 409 leaves the user tapping a button that appears to do nothing. */}
      {purchase.isError ? (
        <p className="text-body-s text-warning" role="alert">
          {t('coins.purchaseRefused')}
        </p>
      ) : null}
      {purchase.data?.replayed ? (
        <p className="text-body-s text-text-3" role="status">
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
      <div className="flex flex-col gap-tight">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-card" />
        ))}
      </div>
    );
  }

  const all = achievements.data?.achievements ?? [];
  const unlocked = all.filter((a) => a.unlockId !== null);

  return (
    <>
      <p className="text-body-s text-text-2">
        {t('coins.unlockedCount', { done: unlocked.length, total: all.length })}
      </p>

      <ul className="flex flex-col gap-tight">
        {all.map((a) => {
          const done = a.unlockId !== null;
          return (
            <Surface as="li" key={a.key} className="flex items-center gap-group">
              <span
                aria-hidden
                className={`inline-flex size-11 shrink-0 items-center justify-center rounded-field ${
                  done ? 'bg-accent-subtle text-accent' : 'bg-surface-2 text-text-3'
                }`}
              >
                <Trophy
                  className={`size-icon-m ${
                    // E26-A flame-flicker, and ONLY when motion is allowed. A permanently animating
                    // icon on a list of a dozen is a battery cost and a distraction.
                    done && variant === 'A' && motionSafe ? 'animate-pulse' : ''
                  }`}
                  strokeWidth={2}
                />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={`text-body-strong block truncate ${done ? 'text-text-1' : 'text-text-3'}`}
                >
                  {/* A LITERAL PREFIX, not t(a.titleKey). The server sends the full dotted
                      string and using it directly works — but nothing static can then see that
                      these keys are referenced, so check-i18n reports seven live strings as dead.
                      An exemption list would have silenced it; that is how NATIVE_LABELS ended up
                      guarding nothing for two phases. Writing the prefix here keeps the gate
                      honest and makes the relationship legible to a reader too. */}
                  {t(`achievement.${a.key}`, { defaultValue: a.key })}
                </span>
                <span className="text-caption block text-text-3">
                  {/* WHAT IT PAID YOU, if you have it; what it PAYS, if you do not. Two different
                      numbers on purpose — a retuned reward must not rewrite somebody's history. */}
                  {done
                    ? t('coins.paidYou', { count: toCoins(a.paidMinor ?? 0) })
                    : t('coins.pays', { count: toCoins(a.rewardMinor) })}
                </span>
              </span>

              {!done ? <Lock className="size-icon-s shrink-0 text-text-3" aria-hidden /> : null}
            </Surface>
          );
        })}
      </ul>

      {/* Stated rather than left to be discovered. Someone looking at a locked list deserves to
          know nothing is expected of them here — the app awards these, they are not claimed. */}
      <p className="text-caption measure text-text-3">{t('coins.awardedNote')}</p>
    </>
  );
}

/* ── STATEMENT ──────────────────────────────────────────────────────────────────────────────── */

function StatementTab() {
  const { t } = useTranslation();
  const ledger = useLedger();

  if (ledger.isLoading) {
    return (
      <Surface pad="none" className="flex flex-col gap-tight p-[var(--card-pad)]">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 rounded-field" />
        ))}
      </Surface>
    );
  }

  const entries = ledger.data?.entries ?? [];
  if (entries.length === 0) {
    return <EmptyState icon={Coins} title={t('coins.noHistoryTitle')} body={t('coins.noHistoryBody')} />;
  }

  return (
    // ONE surface with hairlines between the rows, not one card per movement. A statement is a
    // single continuous document; twelve bordered cards make twelve unrelated objects out of it,
    // and at that density the borders carry more ink than the numbers do.
    <Surface as="ul" pad="none" className="flex flex-col">
      {entries.map((e, i) => (
        <li
          key={e.id}
          className={`flex items-center gap-group px-[var(--card-pad)] py-3 ${
            i > 0 ? 'border-t-[length:var(--border-width)] border-[var(--card-border)]' : ''
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="text-body-s block truncate text-text-1">{e.reasonLabel}</span>
            <span className="text-caption block truncate text-text-3">
              {new Date(e.createdAt * 1000).toLocaleDateString()}
              {e.note ? ` · ${e.note}` : ''}
            </span>
          </span>
          {/* Earning is accent, spending is plain. Spending is NOT danger-coloured: buying
              something you chose to buy is not an error, and colouring it like one would make the
              statement feel like a list of mistakes. */}
          <span
            className={`text-body-strong shrink-0 tabular-nums ${
              e.amountMinor > 0 ? 'text-accent' : 'text-text-2'
            }`}
          >
            {e.amountMinor > 0 ? '+' : ''}
            {toCoins(e.amountMinor)}
          </span>
        </li>
      ))}
    </Surface>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Pic } from '../../ui/media/Pic';
import { cn } from '../../lib/cn';
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
 * The coin screen: balance, store, achievements, statement — coins-1 / coins-2 / coins-3.
 *
 * ═══ THE COMPOSITION (figma-build/app/coins-N.body.js) ═════════════════════════════════════════
 *
 *   Screen top="push"          the pushed header at y 64, blocks 32 apart, side 24
 *   ScreenHeader kind="push"   "‹ PROFIL" (the way back is the history, as before) + ÉRMÉK
 *   CoinBalance                the one hero: EGYENLEGED, the giant figure, the coin stack
 *   the view                   the three-cell switch on its hairline, then the chosen view 16 under
 *                              it (12 for the statement, whose first row carries its own air)
 *
 * Nothing is enclosed: the store, the achievements and the statement are rows on the gutter with
 * one hairline between two neighbours (`RowStack`), the store and the achievements closed by the
 * strong rule. A tab is a filter, not a new screen: the header and the balance stay put, the
 * choice is local state and always opens on Bolt (R20).
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

  return (
    <Screen top="push">
      {/* /coins is entered from the profile stack (the bar keeps Profil lit), and from the desktop
          command palette: the way back is the history, not a fixed link to one parent. */}
      <ScreenHeader kind="push" title={t('coins.title')} back={{ onClick: () => history.back(), label: t('nav.profile') }} />

      <CoinBalance
        state={wallet.isLoading ? 'loading' : wallet.isError ? 'error' : 'ready'}
        balanceMinor={wallet.data?.balanceMinor}
      />

      <div className={cn('flex flex-col', tab === 'statement' ? 'gap-3' : 'gap-group')}>
        <Segmented
          layout="cells"
          label={t('coins.title')}
          value={tab}
          onChange={setTab}
          options={TABS.map((key) => ({ value: key, label: t(`coins.tab.${key}`) }))}
        />
        {tab === 'store' ? <StoreTab balanceMinor={balanceMinor} /> : null}
        {tab === 'achievements' ? <AchievementsTab /> : null}
        {tab === 'statement' ? <StatementTab /> : null}
      </div>
    </Screen>
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
      <RowStack as="div" role="status" aria-label={t('common.loading')}>
        {[0, 1, 2].map((i) => (
          <ListRowSkeleton key={i} sub index={i} />
        ))}
      </RowStack>
    );
  }

  // A failed read keeps the empty copy it always had (there is no error copy for the store).
  if (store.isError) {
    return <EmptyState title={t('coins.storeEmptyTitle')} body={t('coins.storeEmptyBody')} />;
  }

  const items = store.data?.items ?? [];
  // Q2: the theme packs are delisted on the server (migration 030, owner ruling 2026-10-17), so
  // GET /coins/store no longer returns them at all. The filter stays as a display belt for an
  // older server: a theme pack the member does not own is never offered. An EMPTY store draws
  // nothing — no section label, no empty-state block: there is nothing to say about a shop that
  // has nothing in it, and the frames draw no such state.
  const listed = items.filter((i) => !(i.sku.startsWith('theme.') && i.owned !== 1));
  if (listed.length === 0) return null;

  return (
    <>
      <SectionHeader rule={false} title={t('coins.storeSection')} />
      <RowStack close>
        {listed.map((item) => {
          const owned = item.owned === 1;
          const affordable = balanceMinor >= item.priceMinor;
          // SINGLE-FLIGHT. While one purchase is settling every OTHER price goes inert, so a second
          // tap cannot start a second money-class write behind the first. The tapped one shows busy.
          // NOT disabled when unaffordable: it answers 409 with the real numbers, which is how the
          // user learns how many coins short they are. Disabling it would hide that.
          const busy = pending === item.id;
          const inert = pending !== null && pending !== item.id;
          const coin = <Pic slot="coin" width={20} />;
          return (
            <ListRow
              key={item.id}
              // THE CATALOGUE IS SEEDED IN ENGLISH: the SKU resolves to a local string, and
              // `defaultValue` keeps a SKU the bundle has never heard of on the server's own words
              // instead of a raw dotted key. The `coins.item.` prefix is written out so check-i18n
              // can see these keys.
              title={t(`coins.item.${item.sku}.title`, { defaultValue: item.title })}
              sub={item.description ? t(`coins.item.${item.sku}.description`, { defaultValue: item.description }) : undefined}
              trailing={
                owned ? (
                  <span className="flex h-11 items-center gap-1.5 text-cap text-text-2">
                    <Check className="size-4 shrink-0 text-accent" strokeWidth={2.5} aria-hidden />
                    {t('coins.owned')}
                  </span>
                ) : undefined
              }
              control={
                owned ? undefined : affordable ? (
                  <Pressable variant="primary" size="sm" icon={coin} busy={busy} disabled={inert} onClick={() => buy(item)}>
                    {toCoins(item.priceMinor)}
                  </Pressable>
                ) : (
                  <TextLink text="data" lead={coin} busy={busy} disabled={inert} onClick={() => buy(item)}>
                    {toCoins(item.priceMinor)}
                  </TextLink>
                )
              }
            />
          );
        })}
      </RowStack>

      {/* The server's answer, including the ones that are refusals. A purchase screen that
          swallows a 409 leaves the user tapping a control that appears to do nothing. */}
      {purchase.isError ? (
        <NoticeLine tone="warn" role="alert">
          {t('coins.purchaseRefused')}
        </NoticeLine>
      ) : null}
      {purchase.data?.replayed ? (
        <NoticeLine tone="info" role="status">
          {t('coins.alreadyProcessed')}
        </NoticeLine>
      ) : null}
    </>
  );
}

/* ── ACHIEVEMENTS ───────────────────────────────────────────────────────────────────────────── */

function AchievementsTab() {
  const { t } = useTranslation();
  const achievements = useAchievements();

  if (achievements.isLoading) {
    return (
      <RowStack as="div" role="status" aria-label={t('common.loading')}>
        {[0, 1, 2, 3].map((i) => (
          <ListRowSkeleton key={i} sub leadSlot index={i} />
        ))}
      </RowStack>
    );
  }

  const all = achievements.data?.achievements ?? [];
  const unlocked = all.filter((a) => a.unlockId !== null);

  return (
    <>
      <SectionHeader rule={false} title={t('coins.unlockedCount', { done: unlocked.length, total: all.length })} />

      <RowStack close>
        {all.map((a) => {
          const done = a.unlockId !== null;
          return (
            <ListRow
              key={a.key}
              // A 48 pt slot keeps the 68 pt row and the text edge; the 56 pt medal is hung 7 / 4
              // out of it so its INK starts on the gutter and fills the slot (coins-2 body.js).
              // Earned = the lit medal; not yet = the same medal at rest, dimmed.
              lead={
                <span className="relative block size-12">
                  <Pic slot="medal" width={56} lit={done} className={cn('absolute -left-[7px] -top-1', !done && 'opacity-45')} />
                </span>
              }
              // A LITERAL PREFIX, not t(a.titleKey): nothing static could then see that these keys
              // are referenced, and check-i18n would report seven live strings as dead.
              title={t(`achievement.${a.key}`, { defaultValue: a.key })}
              // WHAT IT PAID YOU, if you have it; what it PAYS, if you do not. Two different numbers
              // on purpose — a retuned reward must not rewrite somebody's history.
              sub={done ? t('coins.paidYou', { count: toCoins(a.paidMinor ?? 0) }) : t('coins.pays', { count: toCoins(a.rewardMinor) })}
              tone={done ? 'default' : 'muted'}
              trailing={done ? undefined : <Lock className="size-4 text-text-3" aria-hidden />}
            />
          );
        })}
      </RowStack>

      {/* Stated rather than left to be discovered: the app awards these, they are not claimed. */}
      <p className="text-cap text-text-3">{t('coins.awardedNote')}</p>
    </>
  );
}

/* ── STATEMENT ──────────────────────────────────────────────────────────────────────────────── */

function StatementTab() {
  const { t } = useTranslation();
  const ledger = useLedger();

  if (ledger.isLoading) {
    return (
      <RowStack as="div" role="status" aria-label={t('common.loading')}>
        {[0, 1, 2, 3, 4].map((i) => (
          <ListRowSkeleton key={i} sub index={i} />
        ))}
      </RowStack>
    );
  }

  const entries = ledger.data?.entries ?? [];
  if (entries.length === 0) {
    return <EmptyState title={t('coins.noHistoryTitle')} body={t('coins.noHistoryBody')} />;
  }

  return (
    // One continuous document: rows with a hairline between two, no closing rule — the shell's
    // fade cuts the list at the bar, which says there is more below.
    <RowStack>
      {entries.map((e) => (
        <ListRow
          key={e.id}
          // The reason stays as the server sends it.
          title={e.reasonLabel}
          sub={`${new Date(e.createdAt * 1000).toLocaleDateString()}${e.note ? ` · ${e.note}` : ''}`}
          // Earning is lit, spending is plain ink. Spending is NOT danger: buying something you
          // chose to buy is not an error, and colouring it like one would make the statement read
          // as a list of mistakes.
          trailing={
            <span className={cn('text-data-l', e.amountMinor > 0 ? 'text-accent' : 'text-text-1')}>
              {e.amountMinor > 0 ? '+' : ''}
              {toCoins(e.amountMinor)}
            </span>
          }
        />
      ))}
    </RowStack>
  );
}

import { useState } from 'react';
import type { ReactNode } from 'react';
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
import { LedgerRow } from '../../ui/data/LedgerRow';
import { SegmentBar } from '../../ui/data/SegmentBar';
import { Rule } from '../../ui/data/Rule';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Pic } from '../../ui/media/Pic';
import { cn } from '../../lib/cn';
import { CoinBalance } from './CoinBalance';
import { WeekColumns } from './WeekColumns';
import type { WeekColumn } from './WeekColumns';
import { groupByDay, hungarianArticleIsAz, localDayKey, previousDayKey, readLevel, signed } from './statement';
import type { LedgerRead, WalletRead } from './statement';
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
 * The coin screen: balance, level, this week, achievements, statement — design round B of the
 * LifeOS effort (coins-1v2 / coins-1v2-debt / coins-2v2), on the approved coins-1 / -2 / -3 kit.
 *
 * ═══ THE COMPOSITION (figma-build/lifeos/coins-1v2.part.js, coins-2v2.part.js) ═════════════════
 *
 *   Screen top="push"          the pushed header at y 64, blocks 32 apart, side 24
 *   ScreenHeader kind="push"   "‹ PROFIL" (the way back is the history, as before) + ÉRMÉK
 *   CoinBalance                the one hero: EGYENLEGED (or TARTOZÁS), the giant figure, the coin
 *                              stack, "Elkölthető: N érme"
 *   NoticeLine warn            only below zero: what the debt means
 *   the view                   the three-cell switch on its hairline, then the chosen view:
 *     Áttekintés               SZINT (level figure, mono XP, the XP SegmentBar, what is missing)
 *                              closed by the strong rule · EZEN A HÉTEN with the week's net and
 *                              the day columns · the daily-cap line · the store, when it has items
 *     Eredmények               the achievements, as coins-2
 *     Kimutatás                the statement grouped by day, newest first, the day's net on the
 *                              eyebrow's baseline (24 between the switch and the first day, 24
 *                              between two days, each later day opened by the strong rule)
 *
 * Nothing is enclosed: rows on the gutter with one hairline between two neighbours (`RowStack`).
 * A tab is a filter, not a new screen: the header and the balance stay put, the choice is local
 * state and always opens on Áttekintés (R20).
 *
 * ═══ THE GAME IS SHOWN, AND IT IS SHOWN HONESTLY ═══════════════════════════════════════════════
 *
 * The owner reversed the earlier "no streak / XP / level" record (ADR-0022, 2026-10-17): coins,
 * XP and levels are part of the product now, and this page is where they are read. What still
 * holds is that every figure here is the server's: the level and the XP bar, the week, the cap
 * and the settle time come from GET /coins/wallet; a field an older server does not send is not
 * drawn, never invented as a zero. A balance below zero is shown as debt, in so many words.
 *
 * ═══ AND WHAT IT SHOWS THAT IS UNCOMFORTABLE ═══════════════════════════════════════════════════
 *
 * The statement includes SPENDING and PENALTIES, in full, with what they were for. A wallet UI
 * that shows earnings prominently and buries the debits is a wallet UI that is managing the user
 * rather than informing them.
 */
const TABS = ['overview', 'achievements', 'statement'] as const;
type CoinTab = (typeof TABS)[number];

export function CoinsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CoinTab>('overview');
  const wallet = useWallet();

  const read = wallet.data as WalletRead | undefined;
  // What a purchase can use: the server's spendable when it sends one (max(0, balance)).
  const spendableMinor = read?.spendableMinor ?? Math.max(0, read?.balanceMinor ?? 0);
  const debtCoins = read && read.balanceMinor < 0 ? Math.abs(toCoins(read.balanceMinor)) : null;

  const switcher = (
    <Segmented
      layout="cells"
      label={t('coins.title')}
      value={tab}
      onChange={setTab}
      options={TABS.map((key) => ({ value: key, label: t(`coins.tab.${key}`) }))}
    />
  );

  return (
    <Screen top="push">
      {/* /coins is entered from the profile stack (the bar keeps Profil lit), and from the desktop
          command palette: the way back is the history, not a fixed link to one parent. */}
      <ScreenHeader kind="push" title={t('coins.title')} back={{ onClick: () => history.back(), label: t('nav.profile') }} />

      <CoinBalance
        state={wallet.isLoading ? 'loading' : wallet.isError ? 'error' : 'ready'}
        balanceMinor={read?.balanceMinor}
        spendableMinor={read?.spendableMinor}
      />

      {debtCoins !== null ? (
        <NoticeLine tone="warn" role="status">
          {t('coins.debtNotice', { count: debtCoins })}
        </NoticeLine>
      ) : null}

      {tab === 'overview' ? <OverviewTab switcher={switcher} wallet={read} spendableMinor={spendableMinor} /> : null}
      {tab === 'achievements' ? (
        <div className="flex flex-col gap-group">
          {switcher}
          <AchievementsTab />
        </div>
      ) : null}
      {tab === 'statement' ? <StatementTab switcher={switcher} today={read?.today ?? null} /> : null}
    </Screen>
  );
}

/* ── OVERVIEW ───────────────────────────────────────────────────────────────────────────────── */

function OverviewTab({ switcher, wallet, spendableMinor }: { switcher: ReactNode; wallet: WalletRead | undefined; spendableMinor: number }) {
  const { t, i18n } = useTranslation();
  const level = readLevel(wallet);

  // The week as the server sends it (Monday..Sunday of the logical week); [] before a zone is
  // known, and absent from an older server — then the section is not drawn.
  const week = wallet?.week ?? [];
  const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' });
  const dayName = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' });
  const columns: WeekColumn[] = week.map((d) => {
    const when = new Date(`${d.date}T00:00:00Z`);
    return {
      coins: d.future ? null : toCoins(d.netMinor),
      label: dayLabel.format(when),
      name: dayName.format(when),
      today: d.date === wallet?.today,
    };
  });
  const weekNet = columns.reduce((sum, c) => sum + (c.coins ?? 0), 0);
  const xpLine = level ? t('coins.level.xp', { xp: level.xp, next: level.next }) : '';

  return (
    <div className="flex flex-col gap-section">
      <div className="flex flex-col">
        {switcher}
        {level ? (
          // The level ledger: the kit row (eyebrow, mono XP from x 112, the num figure on the edge),
          // then 12 under it the XP bar — ten segments of the level's span — and 12 under that what
          // is still missing; the strong rule 20 under the line closes the ledger.
          <RowStack close>
            <div>
              <LedgerRow label={t('coins.level.label')} note={<span className="text-data text-text-2">{xpLine}</span>} value={level.level} />
              <div className="flex flex-col gap-3 pb-5 pt-3">
                <SegmentBar label={xpLine} segments={level.segments.map((state) => ({ state }))} />
                <p className="text-cap text-text-3">
                  {t(hungarianArticleIsAz(level.level + 1) ? 'coins.level.toNextAz' : 'coins.level.toNext', {
                    count: level.missing,
                    level: level.level + 1,
                  })}
                </p>
              </div>
            </div>
          </RowStack>
        ) : null}
      </div>

      {columns.length > 0 ? (
        <section aria-labelledby="coins-week" className="flex flex-col gap-group">
          <SectionHeader
            rule={false}
            title={t('coins.week.title')}
            titleId="coins-week"
            trailing={<span className="text-data text-text-1">{signed(weekNet)}</span>}
          />
          <WeekColumns days={columns} label={t('coins.week.title')} />
          {wallet?.dailyEarnCapMinor !== undefined && wallet.settleTime ? (
            <p className="text-cap text-text-3">{t('coins.week.capLine', { cap: toCoins(wallet.dailyEarnCapMinor), time: wallet.settleTime })}</p>
          ) : null}
        </section>
      ) : null}

      {/* The store stays reachable (Q4: nothing a user can do today disappears). With the theme
          packs delisted (030) it is empty, and an empty store draws nothing at all. */}
      <StoreTab balanceMinor={spendableMinor} />
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
    <section className="flex flex-col gap-group">
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
    </section>
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

function StatementTab({ switcher, today }: { switcher: ReactNode; today: string | null }) {
  const { t, i18n } = useTranslation();
  const ledger = useLedger();

  if (ledger.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {switcher}
        <RowStack as="div" role="status" aria-label={t('common.loading')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <ListRowSkeleton key={i} sub index={i} />
          ))}
        </RowStack>
      </div>
    );
  }

  const entries = (ledger.data?.entries ?? []) as LedgerRead[];
  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-group">
        {switcher}
        <EmptyState title={t('coins.noHistoryTitle')} body={t('coins.noHistoryBody')} />
      </div>
    );
  }

  // "Ma" and "Tegnap" are the wallet's LOGICAL today when the server knows it, else the browser's
  // calendar day.
  const todayKey = today ?? localDayKey(Date.now() / 1000);
  const yesterdayKey = previousDayKey(todayKey);
  const dateLabel = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const headOf = (date: string) => {
    const label = dateLabel.format(new Date(`${date}T00:00:00Z`));
    if (date === todayKey) return t('coins.day.today', { date: label });
    if (date === yesterdayKey) return t('coins.day.yesterday', { date: label });
    return label;
  };

  return (
    // One continuous document: day groups 24 apart, no closing rule — the shell's fade cuts the
    // list at the bar, which says there is more below.
    <div className="flex flex-col gap-6">
      {switcher}
      {groupByDay(entries).map((day, index) => (
        <section key={day.date} aria-label={headOf(day.date)} className="flex flex-col gap-2">
          {index > 0 ? <Rule strong /> : null}
          <SectionHeader rule={false} title={headOf(day.date)} trailing={<span className="text-data text-text-1">{signed(day.netCoins)}</span>} />
          <RowStack>
            {day.entries.map((e) => {
              const coins = toCoins(e.amountMinor);
              return (
                <ListRow
                  key={e.id}
                  // A LITERAL PREFIX so check-i18n sees the keys; a reason the bundle does not know
                  // keeps the server's own words.
                  title={t(`coins.reason.${e.reasonKey}`, { defaultValue: e.reasonLabel })}
                  // What the movement was for: the workout's title on a LifeOS award, the server's
                  // note on any other movement. A LifeOS note ("capped") is bookkeeping, not copy.
                  sub={(e.refType === 'coin_event' ? e.sourceTitle : e.note) ?? undefined}
                  // Earning is lit, spending and penalties are plain ink. A debit is NOT danger:
                  // buying something you chose to buy is not an error.
                  trailing={<span className={cn('text-data-l', coins > 0 ? 'text-accent' : 'text-text-1')}>{signed(coins)}</span>}
                />
              );
            })}
          </RowStack>
        </section>
      ))}
    </div>
  );
}

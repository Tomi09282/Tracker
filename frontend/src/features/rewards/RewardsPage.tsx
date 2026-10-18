import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Plus } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { StatBlock } from '../../ui/data/StatBlock';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import type { Reward } from '../../lib/lifeos-api';
import { useRewards } from './rewardsApi';
import { FigUnit, RewardRow, coinsOf } from './RewardRow';
import { RewardSheet } from './RewardSheet';
import { RedeemConfirm } from './RedeemConfirm';

/**
 * Jutalmak, pushed from Profil (the JUTALMAK ledger row) — frame `lifeos/rewards-1` (design round
 * B, Figma 189:257).
 *
 * Composition, as `rewards-1.part.js` / `c.common.js rewardsPage` on the kit:
 *
 *   header      pushed: "‹ PROFIL" (app/routeMeta.ts), the title "Jutalmak", the 44 pt "+" on the
 *               right (opens the RewardSheet: reward-form)
 *   hero        ELKÖLTHETŐ + the giant spendable figure with "érme" (cap) on its baseline, and the
 *               line "A beváltás nem csökkenti az XP-t és a szintet."
 *   JUTALOMBOLT the head's trailing words "ár szerint"; the live rewards by cost (`RewardRow`)
 *
 * No lime pill on this screen: a redeemable row says so with the 6 pt lime dot and the quiet
 * "Beváltás" link, which opens the confirmation (README open question 3).
 *
 * Undrawn states, in the same language: loading (the hero and three rows as skeletons), a failed
 * read (the danger line with "Újra"), a server without the shop (404: the same line), an empty shop
 * (f_app's "Üres a bolt" with its line and "Új jutalom +"), an account in debt (spendable 0 and
 * the Érmék debt line: nothing can be redeemed), the archived rewards (the footer link opens them
 * in place, dimmed; each opens its page where it can be restored).
 */
export function RewardsPage() {
  const { t } = useTranslation();
  const rewards = useRewards();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [redeeming, setRedeeming] = useState<Reward | null>(null);

  const data = rewards.data;
  const debt = data && data.balanceMinor < 0 ? coinsOf(-data.balanceMinor) : 0;

  const plus = (
    <Pressable variant="link" shape="icon" aria-label={t('rewards.new')} aria-haspopup="dialog" onClick={() => setSheetOpen(true)} className="[&_svg]:size-6">
      <Plus aria-hidden />
    </Pressable>
  );

  return (
    <Screen top="push">
      <ScreenHeader kind="push" title={t('rewards.title')} trailing={plus} />

      {rewards.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void rewards.refetch()} busy={rewards.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('rewards.failed')}
        </NoticeLine>
      ) : !data ? (
        <RewardsSkeleton />
      ) : (
        <>
          <StatBlock label={t('rewards.spendable')} caption={t('rewards.xpNote')}>
            <FigUnit value={coinsOf(data.spendableMinor)} unit={t('rewards.coinUnit')} />
          </StatBlock>
          {debt > 0 ? (
            <NoticeLine tone="warn" role="status">
              {t('coins.debtNotice', { count: debt })}
            </NoticeLine>
          ) : null}

          <Section title={t('rewards.shop')} trailing={data.items.length > 1 ? <span className="text-cap text-text-2">{t('rewards.byCost')}</span> : undefined}>
            {data.items.length > 0 ? (
              <RowStack>
                {data.items.map((r) => (
                  <RewardRow key={r.id} reward={r} onRedeem={setRedeeming} />
                ))}
              </RowStack>
            ) : (
              <EmptyState
                title={t('rewards.emptyTitle')}
                body={t('rewards.emptyBody')}
                action={
                  <TextLink text="body" trail={<Plus aria-hidden />} onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
                    {t('rewards.new')}
                  </TextLink>
                }
              />
            )}
          </Section>

          {data.archived.length > 0 ? (
            <div className="flex w-full flex-col gap-1">
              <TextLink
                text="body"
                className="self-start"
                trail={<ChevronRight aria-hidden className={showArchived ? 'rotate-90' : undefined} />}
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
              >
                {t('rewards.archivedCount', { count: data.archived.length })}
              </TextLink>
              {showArchived ? (
                <RowStack>
                  {data.archived.map((r) => (
                    <RewardRow key={r.id} reward={r} dim />
                  ))}
                </RowStack>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <RewardSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <RedeemConfirm reward={redeeming} onClose={() => setRedeeming(null)} />
    </Screen>
  );
}

/** Loading: the hero and three rows where the text will be — never a spinner. */
function RewardsSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="flex w-full flex-col gap-section">
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-40" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>
      <div aria-hidden className="flex w-full flex-col gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-1 w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { StatBlock } from '../../ui/data/StatBlock';
import { Dot } from '../../ui/data/Dot';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { ApiError } from '../../lib/api';
import type { RewardDetailResponse, RewardRedemption } from '../../lib/lifeos-api';
import { useArchiveReward, useFulfilRedemption, useRewardDetail } from './rewardsApi';
import { FigUnit, coinsOf, useRewardStatus } from './RewardRow';
import { RewardSheet } from './RewardSheet';
import { RedeemConfirm } from './RedeemConfirm';

/**
 * One reward, pushed from Jutalmak — frame `lifeos/reward-detail` (design round B, Figma 189:619).
 *
 * Composition, as `reward-detail.part.js` on the kit:
 *
 *   header      pushed: "‹ JUTALMAK", the reward's name as the title, "Szerkesztés" (text link,
 *               opens the RewardSheet in edit mode) on the right
 *   hero        the description (body, text-2), 24, ÁR + the giant cost with "érme" (cap)
 *   terms       a list opened and closed by a strong rule: Beváltható (többször / egyszer) ·
 *               Pihenő két beváltás között (N nap; left out for a one-time reward) · Beváltva eddig
 *   redeem      the status line (lime dot + "Beváltható · elkölthető 190 érme, utána 110"), 20,
 *               the screen's ONE lime pill "Beváltás · 80 érme" (opens the confirmation)
 *   BEVÁLTÁSOK  the head's trailing word "Teljesítve"; each redemption a row with the date and
 *               weekday, the cost (the receipt's snapshot) and "még nem kaptad meg" while open, and
 *               the set check (lime tick = fulfilled, ring = not yet) — the row is the toggle; the
 *               closing line "A teljesítés csak a te jelölésed: érmét nem mozgat."
 *   archive     "Archiválás" (danger text, behind a confirmation) over its one line
 *
 * Undrawn states, in the same language: a reward that cannot be redeemed now (no pill; the status
 * line names why: pihen · még N nap / beváltva · egyszeri / még N érme), an archived reward (no
 * redeem block; "Visszaállítás" instead of "Archiválás"), no redemption yet (the section is left
 * out), loading, a failed read and a reward that is not there (404: another account's reward looks
 * the same).
 */
export function RewardDetailPage() {
  const { id: idParam } = useParams();
  const id = idParam && /^\d{1,9}$/.test(idParam) ? Number(idParam) : null;
  const { t } = useTranslation();
  const detail = useRewardDetail(id);
  const notFound = id === null || (detail.error instanceof ApiError && detail.error.status === 404);
  const data = detail.data;
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Screen top="push">
      <ScreenHeader
        kind="push"
        title={data?.reward.name ?? (notFound ? undefined : '')}
        trailing={
          data && !data.reward.archived ? (
            <TextLink aria-haspopup="dialog" onClick={() => setEditOpen(true)}>
              {t('rewards.edit')}
            </TextLink>
          ) : undefined
        }
      />
      {notFound ? (
        // A reward that is not there and another account's reward are the same 404 (anti-IDOR):
        // one honest line and the way back to the shop — nothing to retry.
        <NoticeLine tone="danger" role="alert" action={<TextLink to="/rewards">{t('rewards.title')}</TextLink>}>
          {t('rewards.gone')}
        </NoticeLine>
      ) : detail.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void detail.refetch()} busy={detail.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('rewards.failed')}
        </NoticeLine>
      ) : !data ? (
        <DetailSkeleton />
      ) : (
        <RewardDetail data={data} />
      )}
      {data ? <RewardSheet open={editOpen} onClose={() => setEditOpen(false)} reward={data.reward} /> : null}
    </Screen>
  );
}

function RewardDetail({ data }: { data: RewardDetailResponse }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { reward } = data;
  const archive = useArchiveReward();
  const fulfil = useFulfilRedemption();
  const { ok, status, extra } = useRewardStatus(reward);
  const [askArchive, setAskArchive] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const live = !reward.archived;
  const cost = coinsOf(reward.costMinor);

  return (
    <>
      <div className="flex w-full flex-col gap-6">
        {reward.description ? <p className="whitespace-pre-line text-body text-text-2">{reward.description}</p> : null}
        <StatBlock label={t('rewards.price')}>
          <FigUnit value={cost} unit={t('rewards.coinUnit')} />
        </StatBlock>
      </div>

      <RowStack open close>
        <ListRow title={t('rewards.form.repeatable')} value={reward.repeatable ? t('rewards.many') : t('rewards.onceValue')} />
        {reward.repeatable ? (
          <ListRow
            title={t('rewards.form.cooldown')}
            value={reward.cooldownDays ? t('rewards.days', { count: reward.cooldownDays }) : t('rewards.noLimit')}
          />
        ) : null}
        <ListRow title={t('rewards.redeemedSoFar')} value={t('rewards.times', { count: reward.redeemedCount })} />
      </RowStack>

      {live ? (
        <div className="flex w-full flex-col gap-5">
          <p className="flex min-h-5 items-center gap-2 text-cap text-text-2">
            {ok ? <Dot tone="live" /> : null}
            {ok ? (
              <span>
                <span className="text-text-1">{t('rewards.statusOk')}</span>
                {' · '}
                {t('rewards.afterRedeem', { spendable: coinsOf(data.spendableMinor), after: coinsOf(reward.balanceAfterMinor) })}
              </span>
            ) : (
              <span>{[status, extra].filter(Boolean).join(' · ')}</span>
            )}
          </p>
          {ok ? (
            <Pressable variant="primary" size="lg" className="w-full" aria-haspopup="dialog" onClick={() => setRedeemOpen(true)}>
              {t('rewards.redeemCost', { count: cost })}
            </Pressable>
          ) : null}
        </div>
      ) : null}

      {data.redemptions.length > 0 ? (
        <Section title={t('rewards.redemptions')} trailing={<span className="text-cap text-text-2">{t('rewards.fulfilled')}</span>}>
          <RowStack close>
            {data.redemptions.map((r) => (
              <ListRow
                key={r.id}
                title={dayLine(r, locale)}
                sub={r.fulfilled ? t('rewards.costLine', { count: coinsOf(r.costMinor) }) : `${t('rewards.costLine', { count: coinsOf(r.costMinor) })} · ${t('rewards.notYet')}`}
                trailing={<CheckMark done={r.fulfilled} />}
                aria-pressed={r.fulfilled}
                aria-label={`${dayLine(r, locale)}, ${t('rewards.fulfilled')}`}
                busy={fulfil.isPending && fulfil.variables?.id === r.id}
                onClick={() =>
                  fulfil.mutate({ id: r.id, rewardId: reward.id, fulfilled: !r.fulfilled }, { onError: () => toast(t('rewards.failed'), 'error') })
                }
              />
            ))}
          </RowStack>
          <p className="text-cap text-text-3">{t('rewards.fulfilledNote')}</p>
        </Section>
      ) : null}

      <div className="flex w-full flex-col">
        {live ? (
          <TextLink text="body" tone="danger" className="self-start" aria-haspopup="dialog" onClick={() => setAskArchive(true)}>
            {t('rewards.archive')}
          </TextLink>
        ) : (
          <TextLink
            text="body"
            className="self-start"
            busy={archive.isPending}
            onClick={() => archive.mutate({ id: reward.id, archive: false }, { onError: () => toast(t('rewards.failed'), 'error') })}
          >
            {t('rewards.restore')}
          </TextLink>
        )}
        {live ? <p className="text-cap text-text-3">{t('rewards.archiveNote')}</p> : null}
      </div>

      <RedeemConfirm reward={redeemOpen ? reward : null} onClose={() => setRedeemOpen(false)} />
      <ConfirmSheet
        open={askArchive}
        onClose={() => setAskArchive(false)}
        title={t('rewards.archiveTitle')}
        message={t('rewards.archiveBody')}
        confirmLabel={t('rewards.archive')}
        tone="danger"
        busy={archive.isPending}
        status={archive.isError ? 'error' : 'idle'}
        onConfirm={() =>
          archive.mutate(
            { id: reward.id, archive: true },
            {
              onSuccess: () => {
                setAskArchive(false);
                navigate('/rewards', { replace: true });
              },
            },
          )
        }
      />
    </>
  );
}

/** "2026. 10. 14. · szerda": the redemption's logical day and its weekday, in the reader's language. */
function dayLine(r: RewardRedemption, locale: string) {
  const [y, m, d] = r.localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const day = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).format(date);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date);
  return `${day} · ${weekday}`;
}

function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="flex w-full flex-col gap-section">
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-4 h-4 w-12" />
        <Skeleton className="h-24 w-28" />
      </div>
      <RowStack as="div">
        {[0, 1, 2].map((i) => (
          <ListRowSkeleton key={i} index={i} />
        ))}
      </RowStack>
    </div>
  );
}

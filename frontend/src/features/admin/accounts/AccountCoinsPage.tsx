import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { toCoins } from '../../coins/useCoins';
import { LedgerRow } from '../../../ui/data/LedgerRow';
import { ListRow, ListRowSkeleton } from '../../../ui/data/ListRow';
import { RowStack } from '../../../ui/data/RowStack';
import { EmptyState } from '../../../ui/feedback/EmptyState';
import { Pic } from '../../../ui/media/Pic';
import { Pressable } from '../../../ui/primitives/Pressable';
import { Screen } from '../../../ui/shell/Screen';
import { ScreenHeader } from '../../../ui/shell/ScreenHeader';
import { hasRole, useSession } from '../../auth/useSession';
import { useOnline } from '../../plans/useOnline';
import { AdminForbidden } from '../AdminShell';
import { accountIdOf, useAccountDetail, useAccountLedger } from './accountsApi';
import { useCoinReason } from './AccountDetailPage';
import { LedgerLine } from './AccountParts';
import { signedCoins, useAccountFormat } from './format';

/**
 * The whole coin ledger of one account (`/admin/accounts/:id/coins`) - the door "Teljes napló" of the
 * account page. Not drawn in a frame: it is the account page's own language - the ÉRME ledger head
 * (the balance), then the movements as the page's three last ones are set, newest first, with
 * "Továbbiak" for the next page of `GET /admin/coins/ledger?user_id=`.
 *
 * Read-only: no row edits or deletes anything (the ledger is append-only on the server too).
 */
export function AccountCoinsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = accountIdOf(params.id);
  const { data: me } = useSession();
  const admin = hasRole(me, 'admin');
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const fmt = useAccountFormat();
  const coinReason = useCoinReason();

  const ledger = useAccountLedger(id, admin);
  // The balance is the account page's read; when this page is opened by its address it is read here.
  const detail = useAccountDetail(id, admin);

  if (me && !admin) return <AdminForbidden />;

  const leave = () => {
    if (location.key !== 'default') void navigate(-1);
    else void navigate(`/admin/accounts/${id ?? ''}`, { replace: true });
  };
  const rows = ledger.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <Screen top="push" width="wide">
      <ScreenHeader kind="push" title={t('adminUsers.coin.fullLedger')} back={{ onClick: leave, label: t('adminUsers.account') }} />

      {id === null ? (
        <EmptyState heading="h2" title={t('adminUsers.goneTitle')} body={t('adminUsers.goneBody')} />
      ) : (
        <div className="flex flex-col">
          <RowStack open close={!ledger.hasNextPage && rows.length > 0}>
            <LedgerRow
              label={t('adminUsers.coin.head')}
              labelTrail={<Pic slot="coin" width={22} />}
              note={t('adminUsers.coin.balance')}
              value={detail.data ? toCoins(detail.data.coins.balanceMinor) : undefined}
              failed={detail.isError}
              busy={detail.isPending}
            />
            {rows.map((e) => (
              <LedgerLine key={e.id} wideDate date={fmt.date(e.createdAt)} title={coinReason(e.reasonKey)} note={e.note} amount={signedCoins(e.amountMinor)} />
            ))}
            {ledger.hasNextPage ? (
              <ListRow
                title={t('adminUsers.more')}
                trailing={<ChevronDown aria-hidden className="size-4 text-text-3" strokeWidth={1.75} />}
                busy={ledger.isFetchingNextPage}
                onClick={() => void ledger.fetchNextPage()}
              />
            ) : null}
          </RowStack>

          {ledger.isPending ? (
            <div role="status" className="mt-2">
              <span className="sr-only">{t('common.loading')}</span>
              <RowStack as="div" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <ListRowSkeleton key={i} sub index={i} />
                ))}
              </RowStack>
            </div>
          ) : ledger.isError && rows.length === 0 ? (
            <EmptyState
              className="mt-8"
              title={online ? t('adminUsers.failedTitle') : t('offline.title')}
              body={t('adminUsers.failedLedgerBody')}
              action={
                <Pressable variant="primary" size="lg" busy={ledger.isFetching} onClick={() => void ledger.refetch()}>
                  {t('common.retry')}
                </Pressable>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState className="mt-8" title={t('coins.noHistoryTitle')} body={t('coins.noHistoryBody')} />
          ) : null}
          {ledger.isError && rows.length > 0 ? (
            <p role="alert" className="mt-3 text-cap text-danger">
              {t('adminUsers.failedLedgerBody')}
            </p>
          ) : null}
        </div>
      )}
    </Screen>
  );
}

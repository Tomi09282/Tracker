import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { ApiError } from '../../../lib/api';
import { clearOutbox } from '../../../lib/outbox';
import { cn } from '../../../lib/cn';
import { personLabel } from '../../../lib/person';
import { toCoins } from '../../coins/useCoins';
import { Monogram, MonogramSkeleton } from '../../../ui/data/Monogram';
import { ListRow } from '../../../ui/data/ListRow';
import { LedgerRow } from '../../../ui/data/LedgerRow';
import { RowStack } from '../../../ui/data/RowStack';
import { ConfirmSheet } from '../../../ui/feedback/ConfirmSheet';
import { EmptyState } from '../../../ui/feedback/EmptyState';
import { NoticeLine } from '../../../ui/feedback/NoticeLine';
import { Skeleton } from '../../../ui/feedback/ScreenSkeleton';
import { Pic } from '../../../ui/media/Pic';
import { Pressable } from '../../../ui/primitives/Pressable';
import { TextLink } from '../../../ui/primitives/TextLink';
import { Screen } from '../../../ui/shell/Screen';
import { ScreenHeader } from '../../../ui/shell/ScreenHeader';
import { useOnline } from '../../plans/useOnline';
import { hasRole, useSession } from '../../auth/useSession';
import { AdminForbidden } from '../AdminShell';
import { accountIdOf, useAccountDetail, type AdminAccountDetail } from './accountsApi';
import { useAccountWrite, writeErrorText, type AccountWrite } from './accountActions';
import { useAccountFormat, signedCoins } from './format';
import { AccountSection, FactRow, LedgerLine } from './AccountParts';
import { CoinSheet, NameSheet, RoleSheet } from './AccountSheets';
import { ReasonSheet } from './ReasonSheet';

type SheetName = 'name' | 'role' | 'disable' | 'enable' | 'coins' | 'signout' | 'lockout' | 'password';

/** The words of a ledger reason: the wallet's own where it has them, the admin set's, else the key itself. */
export function useCoinReason() {
  const { t } = useTranslation();
  return (key: string) => t(`coins.reason.${key}`, { defaultValue: t(`adminUsers.coin.reason.${key}`, { defaultValue: key }) });
}

/** The words of an audit action, else the action itself (a mono code is still more useful than nothing). */
function useAuditAction() {
  const { t } = useTranslation();
  return (action: string) => t(`adminUsers.audit.${action}`, { defaultValue: action });
}

/**
 * The account page (`/admin/accounts/:id`), pushed from a row of Fiókok - frames
 * `admin-account-detail-1`, `-2a..2d` (the sheets), `-3a` (disabled) and `-3b` (your own account).
 *
 * ═══ ONE READ, THEN LEDGER SECTIONS ════════════════════════════════════════════════════════════
 *
 * `GET /admin/users/:id` is the whole page. The identity (the e-mail is READ-ONLY: it is the login
 * identity and nothing edits it), then FIÓK, EDZŐI OLDAL, PIACTÉR, ÉRME, TEVÉKENYSÉG, NAPLÓ and
 * MŰVELETEK. Sections a coach alone has (EDZŐI OLDAL) or that need a profile (PIACTÉR) appear only
 * when the account has them; the frames 3a / 3b leave the middle sections out for brevity, and this
 * page draws them for those accounts too.
 *
 * ═══ PRIVACY IS THE SERVER'S ═══════════════════════════════════════════════════════════════════
 *
 * TEVÉKENYSÉG is four counts - the admin cannot read health content, and the endpoint never sends
 * any - and the page says so in a quiet line.
 *
 * ═══ NO CLIENT-SIDE AUTHORITY ══════════════════════════════════════════════════════════════════
 *
 * Your own account has no Szerepkör, no Letiltás and no Érme-korrekció row (frame 3b draws the
 * first two gone; the third the server refuses with a 409, so it is gone too). That is a
 * courtesy: the server refuses all three whatever this page draws.
 */
export function AccountDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = accountIdOf(params.id);
  const { data: me } = useSession();
  const admin = hasRole(me, 'admin');
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const fmt = useAccountFormat();
  const coinReason = useCoinReason();
  const auditAction = useAuditAction();

  const detail = useAccountDetail(id, admin);
  const write = useAccountWrite(id ?? 0);
  const [sheet, setSheet] = useState<SheetName | null>(null);

  if (me && !admin) return <AdminForbidden />;

  // Back to the list it was opened from: the history step when there is one inside the app (the row
  // pushed this page - the list, with its filters in the address, comes back as it was), the list
  // itself when the page was opened by its address.
  const leave = () => {
    if (location.key !== 'default') void navigate(-1);
    else void navigate('/admin/accounts', { replace: true });
  };
  const back = { onClick: leave, label: t('nav.accounts') };

  const d = detail.data;
  const account = d?.account;
  const name = account ? personLabel({ email: account.email, display_name: account.displayName }) : '';
  const disabled = account?.disabledAt != null;
  const self = account?.isSelf === true;

  const open = (s: SheetName) => {
    write.reset();
    setSheet(s);
  };
  const close = () => setSheet(null);

  /** Run a write; the sheet closes on success, stays (with the sentence) on a refusal. */
  const run = (w: AccountWrite) =>
    write.mutate(w, {
      onSuccess: (answer) => {
        if (answer.selfSignedOut) {
          // You ended your own sessions: the server cleared the cookies, so leave like a logout does.
          clearOutbox();
          qc.clear();
          void navigate('/login', { replace: true });
          return;
        }
        close();
      },
    });
  const retry = () => {
    if (write.variables) run(write.variables);
  };
  const error = write.isError ? writeErrorText(write.error, t) : null;
  const sheetBase = { busy: write.isPending, error, onClose: close, onRetry: retry };

  if (id === null || (detail.error instanceof ApiError && detail.error.status === 404)) {
    return (
      <Screen top="push" width="wide">
        <ScreenHeader kind="push" back={back} />
        <EmptyState heading="h1" title={t('adminUsers.goneTitle')} body={t('adminUsers.goneBody')} />
      </Screen>
    );
  }

  return (
    <Screen top="push" width="wide">
      <ScreenHeader kind="push" back={back} />

      {detail.isPending ? (
        <DetailSkeleton />
      ) : detail.isError || !d || !account ? (
        <EmptyState
          heading="h1"
          title={online ? t('adminUsers.failedTitle') : t('offline.title')}
          body={t('adminUsers.failedDetailBody')}
          action={
            <Pressable variant="primary" size="lg" busy={detail.isFetching} onClick={() => void detail.refetch()}>
              {t('common.retry')}
            </Pressable>
          }
        />
      ) : (
        <>
          {/* ── the identity: the monogram with its one dot, the name, the read-only e-mail ── */}
          <section aria-label={t('adminUsers.account')} className="flex flex-col gap-5">
            <Monogram
              person={{ email: account.email, display_name: account.displayName }}
              size={140}
              dot={disabled ? 'muted' : 'accent'}
              dotLabel={disabled ? t('adminUsers.disabled') : t('adminUsers.state.active')}
              className="self-start"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-title text-text-1">{name}</h1>
              <div className="flex items-baseline justify-between gap-4">
                <p className="min-w-0 truncate text-body text-text-2">{account.email}</p>
                <span className="inline-flex shrink-0 items-center gap-1 text-micro uppercase text-text-3">
                  <Lock aria-hidden className="size-3" strokeWidth={1.75} />
                  {t('adminUsers.readOnly')}
                </span>
              </div>
              <p className="text-micro uppercase text-text-2">
                <span className="text-text-1">{t(`adminUsers.role.${account.role}`)}</span>
                {' · '}
                <span className={cn(disabled && 'text-danger')}>{disabled ? t('adminUsers.disabled') : t('adminUsers.state.active')}</span>
                {self ? ` · ${t('adminUsers.you')}` : null}
              </p>
            </div>
            {disabled && account.disabled ? (
              <NoticeLine tone="danger">
                {[
                  t('adminUsers.disabledNotice'),
                  account.disabled.reason,
                  fmt.date(account.disabled.at),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </NoticeLine>
            ) : null}
          </section>

          <AccountSections
            d={d}
            fmt={fmt}
            coinReason={coinReason}
            auditAction={auditAction}
          />

          {/* ── the actions ── */}
          <AccountSection title={t('adminUsers.actions')}>
            <RowStack>
              <ListRow title={t('adminUsers.nameSheet.title')} chevron disabled={!online} onClick={() => open('name')} />
              {!self ? (
                <ListRow
                  title={t('adminUsers.col.role')}
                  value={t(`adminUsers.role.${account.role}`)}
                  chevron
                  disabled={!online}
                  onClick={() => open('role')}
                />
              ) : null}
              {!self ? <ListRow title={t('adminUsers.coin.title')} chevron disabled={!online} onClick={() => open('coins')} /> : null}
              <ListRow
                title={t('adminUsers.signout.title')}
                sub={d.sessions.open > 0 ? t(d.sessions.open === 1 ? 'adminUsers.signout.openOne' : 'adminUsers.signout.open', { count: d.sessions.open }) : t('adminUsers.signout.none')}
                chevron
                disabled={!online}
                onClick={() => open('signout')}
              />
              <ListRow
                title={t('adminUsers.lockout.reset')}
                sub={lockoutLine(d, t, fmt) ?? t('adminUsers.lockout.nothing')}
                chevron
                // Nothing to lift: the row stays, dimmed, and says why in its sub line.
                disabled={!online || lockoutLine(d, t, fmt) === null}
                onClick={() => open('lockout')}
              />
              <ListRow
                title={t('adminUsers.password.force')}
                sub={t('adminUsers.password.forceSub')}
                subLines={2}
                chevron
                disabled={!online || account.mustChange}
                onClick={() => open('password')}
              />
            </RowStack>
            <div className="flex flex-col pt-2">
              {self ? (
                <p className="flex items-center gap-2 text-cap text-text-3">
                  <Lock aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {t('adminUsers.selfNote')}
                </p>
              ) : disabled ? (
                <>
                  <TextLink text="body" disabled={!online} onClick={() => open('enable')} className="self-start">
                    {t('adminUsers.enable.link')}
                  </TextLink>
                  <p className="text-cap text-text-3">{t('adminUsers.enable.hint')}</p>
                </>
              ) : (
                <>
                  <TextLink text="body" tone="danger" disabled={!online} onClick={() => open('disable')} className="self-start">
                    {t('adminUsers.disable.link')}
                  </TextLink>
                  <p className="text-cap text-text-3">{t('adminUsers.disable.hint')}</p>
                </>
              )}
            </div>
          </AccountSection>

          <NameSheet
            {...sheetBase}
            open={sheet === 'name'}
            current={account.displayName ?? ''}
            onSave={(displayName) => run({ kind: 'name', displayName })}
          />
          <RoleSheet
            {...sheetBase}
            open={sheet === 'role'}
            current={account.role}
            onSave={(role, password) => run({ kind: 'role', role, password })}
          />
          <CoinSheet
            {...sheetBase}
            open={sheet === 'coins'}
            balanceMinor={d.coins.balanceMinor}
            onSave={(amountMinor, note, key) => run({ kind: 'coins', amountMinor, note, key })}
          />
          <ReasonSheet
            open={sheet === 'disable'}
            onClose={close}
            title={t('adminUsers.disable.title')}
            message={t('adminUsers.disable.message', { name })}
            reasonLabel={t('adminUsers.reason')}
            reasonHint={t('adminUsers.reasonHint')}
            confirmLabel={t('adminUsers.disable.link')}
            busy={write.isPending}
            error={error}
            onConfirm={(reason) => run({ kind: 'disable', reason })}
          />
          <ReasonSheet
            open={sheet === 'enable'}
            onClose={close}
            title={t('adminUsers.enable.title')}
            message={t('adminUsers.enable.message', { name })}
            reasonLabel={t('adminUsers.reason')}
            reasonHint={t('adminUsers.reasonHint')}
            confirmLabel={t('adminUsers.enable.link')}
            tone="default"
            busy={write.isPending}
            error={error}
            onConfirm={(reason) => run({ kind: 'enable', reason })}
          />
          <ConfirmSheet
            open={sheet === 'signout'}
            onClose={close}
            title={t('adminUsers.signout.sheetTitle')}
            message={self ? t('adminUsers.signout.selfMessage') : t('adminUsers.signout.message', { name })}
            confirmLabel={t('adminUsers.signout.confirm')}
            busy={write.isPending}
            status={error ? 'error' : 'idle'}
            onRetry={retry}
            onConfirm={() => run({ kind: 'signoutAll' })}
          />
          <ConfirmSheet
            open={sheet === 'lockout'}
            onClose={close}
            title={t('adminUsers.lockout.reset')}
            message={t('adminUsers.lockout.message', { name })}
            confirmLabel={t('adminUsers.lockout.confirm')}
            tone="default"
            busy={write.isPending}
            status={error ? 'error' : 'idle'}
            onRetry={retry}
            onConfirm={() => run({ kind: 'resetLockout' })}
          />
          <ConfirmSheet
            open={sheet === 'password'}
            onClose={close}
            title={t('adminUsers.password.sheetTitle')}
            message={self ? t('adminUsers.password.selfMessage') : t('adminUsers.password.message', { name })}
            confirmLabel={t('adminUsers.password.confirm')}
            tone="default"
            busy={write.isPending}
            status={error ? 'error' : 'idle'}
            onRetry={retry}
            onConfirm={() => run({ kind: 'forcePassword' })}
          />
        </>
      )}
    </Screen>
  );
}

/** "zárolva 09:47-ig" or "5 hibás belépés", or null when there is nothing to lift. */
function lockoutLine(d: AdminAccountDetail, t: ReturnType<typeof useTranslation>['t'], fmt: ReturnType<typeof useAccountFormat>): string | null {
  if (d.lockout.lockedUntil !== null) return t('adminUsers.lockout.until', { time: fmt.time(d.lockout.lockedUntil) });
  if (d.lockout.failedLogins > 0) return t(d.lockout.failedLogins === 1 ? 'adminUsers.lockout.failedOne' : 'adminUsers.lockout.failed', { count: d.lockout.failedLogins });
  return null;
}

function AccountSections({
  d,
  fmt,
  coinReason,
  auditAction,
}: {
  d: AdminAccountDetail;
  fmt: ReturnType<typeof useAccountFormat>;
  coinReason: (key: string) => string;
  auditAction: (action: string) => string;
}) {
  const { t } = useTranslation();
  const { account, sessions, coaching, marketplace, coins, activity, audit } = d;
  const lock = lockoutLine(d, t, fmt);
  const asCoach = coaching.asCoach;
  const showCoach = account.role === 'coach' || asCoach.activeClients > 0 || coaching.subscription !== null;
  const subStatus = coaching.subscription ? t(`adminUsers.sub.${coaching.subscription.status}`) : t('adminUsers.sub.none');

  return (
    <>
      <AccountSection title={t('adminUsers.sec.account')}>
        <RowStack>
          <FactRow label={t('adminUsers.col.created')} value={fmt.date(account.createdAt)} />
          <FactRow
            label={t('adminUsers.lastLogin')}
            value={sessions.lastStartedAt !== null ? fmt.dateTime(sessions.lastStartedAt) : '—'}
          />
          <FactRow label={t('adminUsers.openSessions')} value={sessions.open} />
          <FactRow label={t('adminUsers.lockout.label')} value={lock ?? t('adminUsers.lockout.none')} tone={lock ? 'warn' : 'ink'} />
          <FactRow
            label={t('adminUsers.mustChangeLabel')}
            value={account.mustChange ? t('adminUsers.mustChangeYes') : t('adminUsers.mustChangeNo')}
            tone={account.mustChange ? 'warn' : 'ink'}
          />
        </RowStack>
      </AccountSection>

      {showCoach ? (
        <AccountSection title={t('adminUsers.sec.coach')}>
          <RowStack>
            <FactRow
              label={t('adminUsers.col.clients')}
              value={asCoach.clientCap !== null && !asCoach.capExempt ? `${asCoach.activeClients} / ${asCoach.clientCap}` : asCoach.activeClients}
            />
            <FactRow label={t('adminUsers.tier')} value={coaching.subscription?.tierName ?? asCoach.tierKey ?? '—'} />
            <FactRow label={t('adminUsers.subscription')} value={subStatus} />
          </RowStack>
        </AccountSection>
      ) : null}

      {marketplace ? (
        <AccountSection title={t('nav.marketplace')}>
          <RowStack>
            <FactRow label={t('adminUsers.profile')} value={`@${marketplace.handle}`} />
            <FactRow
              label={t('adminUsers.profileState')}
              value={
                marketplace.removed
                  ? t('adminUsers.profileRemoved')
                  : marketplace.verified
                    ? t('adminUsers.profileVerified')
                    : marketplace.published
                      ? t('adminUsers.profilePublished')
                      : t('adminUsers.profileUnpublished')
              }
            />
            <FactRow
              label={t('adminUsers.posts')}
              value={marketplace.posts.draft + marketplace.posts.live + marketplace.posts.withdrawn + marketplace.posts.removed}
            />
            <FactRow
              label={t('adminUsers.openReports')}
              value={marketplace.openReports}
              // The door to Piactér filtered to this author (its posts list shows each post's open reports).
              to={marketplace.openReports > 0 ? { pathname: '/admin/marketplace', search: `?view=posts&q=${encodeURIComponent(marketplace.handle)}` } : undefined}
            />
          </RowStack>
        </AccountSection>
      ) : null}

      {/* ÉRME: the balance as the ledger head, the last three movements, the door to the whole ledger. */}
      <RowStack open close>
        <LedgerRow
          label={t('adminUsers.coin.head')}
          labelTrail={<Pic slot="coin" width={22} />}
          note={t('adminUsers.coin.balance')}
          value={toCoins(coins.balanceMinor)}
        />
        {coins.entries.map((e) => (
          <LedgerLine
            key={e.id}
            date={fmt.shortDate(e.createdAt)}
            title={coinReason(e.reasonKey)}
            note={e.note}
            amount={signedCoins(e.amountMinor)}
          />
        ))}
        {coins.totalEntries > 0 ? (
          <ListRow
            to={`/admin/accounts/${account.id}/coins`}
            title={t('adminUsers.coin.fullLedger')}
            value={t(coins.totalEntries === 1 ? 'adminUsers.coin.entriesOne' : 'adminUsers.coin.entries', { count: coins.totalEntries })}
            chevron
          />
        ) : null}
      </RowStack>

      <AccountSection title={t('adminUsers.sec.activity')} trailing={<span className="text-cap text-text-3">{t('adminUsers.countsOnly')}</span>}>
        <RowStack>
          <FactRow big label={t('adminUsers.act.workouts')} value={activity.workouts} />
          <FactRow big label={t('adminUsers.act.nutrition')} value={activity.nutritionLogs} />
          <FactRow big label={t('adminUsers.act.measurements')} value={activity.measurements} />
          <FactRow big label={t('adminUsers.act.photos')} value={activity.photos} />
        </RowStack>
        <p className="flex items-center gap-2 text-cap text-text-3">
          <Lock aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
          {t('adminUsers.privacy')}
        </p>
      </AccountSection>

      {audit.length > 0 ? (
        <AccountSection title={t('adminUsers.sec.audit')} trailing={<span className="text-cap text-text-3">{t('adminUsers.auditLast')}</span>}>
          <RowStack>
            {audit.map((a) => (
              <ListRow
                key={a.id}
                title={auditAction(a.action)}
                sub={`${a.actorEmail ?? t('adminUsers.actorSystem')} · ${fmt.dateTime(a.createdAt)}`}
              />
            ))}
          </RowStack>
        </AccountSection>
      ) : null}
    </>
  );
}

/** The page while it loads: the hero's shape and a few rows, nothing invented. */
function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-8">
      <span className="sr-only">{t('common.loading')}</span>
      <div aria-hidden className="flex flex-col gap-5">
        <MonogramSkeleton size={140} className="self-start" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-60" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div aria-hidden className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}

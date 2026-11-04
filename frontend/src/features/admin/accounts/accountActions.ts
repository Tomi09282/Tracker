import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { ApiError, apiWithRefresh } from '../../../lib/api';
import type { AdminAccountBrief } from './accountsApi';

/*
 * The account writes of `B-admin-accounts` api.md, one mutation per account page.
 *
 * The page never decides whether a write is allowed: it hides the rows the server would refuse (your
 * own role, your own coins) and shows the server's refusal in words when one comes anyway. After
 * every write the account page, the list and the ledger are read again - the page shows what the
 * server holds, not what the client assumed.
 */

export type AccountWrite =
  | { kind: 'name'; displayName: string | null }
  | { kind: 'role'; role: 'user' | 'coach' | 'admin'; password?: string }
  | { kind: 'disable'; reason: string }
  | { kind: 'enable'; reason: string }
  | { kind: 'coins'; amountMinor: number; note: string; key: string }
  | { kind: 'resetLockout' }
  | { kind: 'signoutAll' }
  | { kind: 'forcePassword' };

interface WriteAnswer {
  replayed?: boolean;
  account?: AdminAccountBrief;
  /** signout-all / force-password-change: the admin signed THEMSELVES out - the client must leave. */
  selfSignedOut?: boolean;
}

function send(id: number, w: AccountWrite): Promise<WriteAnswer> {
  const base = `/admin/users/${id}`;
  switch (w.kind) {
    case 'name':
      return apiWithRefresh(`${base}/name`, { method: 'PATCH', body: { displayName: w.displayName } });
    case 'role':
      // The step-up password travels ONLY when granting admin; it is never stored on the client.
      return apiWithRefresh(`${base}/role`, {
        method: 'POST',
        body: w.password === undefined ? { role: w.role } : { role: w.role, password: w.password },
      });
    case 'disable':
      return apiWithRefresh(`${base}/disable`, { method: 'POST', body: { reason: w.reason } });
    case 'enable':
      return apiWithRefresh(`${base}/enable`, { method: 'POST', body: { reason: w.reason } });
    case 'coins':
      return apiWithRefresh(`${base}/coins`, {
        method: 'POST',
        body: { amount_minor: w.amountMinor, note: w.note, idempotency_key: w.key },
      });
    case 'resetLockout':
      return apiWithRefresh(`${base}/reset-lockout`, { method: 'POST', body: {} });
    case 'signoutAll':
      return apiWithRefresh(`${base}/signout-all`, { method: 'POST', body: {} });
    case 'forcePassword':
      return apiWithRefresh(`${base}/force-password-change`, { method: 'POST', body: {} });
  }
}

export function useAccountWrite(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (w: AccountWrite) => send(id, w),
    // Success or not, what the server holds is read again: a refused write may mean the account changed.
    onSettled: () => void qc.invalidateQueries({ queryKey: ['admin', 'accounts'] }),
  });
}

/** The one-line sentence for a refused write, in the admin area's own style. */
export function writeErrorText(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiError)) return t('adminUsers.err.generic');
  const reason = typeof err.body.reason === 'string' ? err.body.reason : '';
  if (err.status === 401 && reason === 'step_up_required') return t('adminUsers.err.stepUp');
  if (err.status === 401) return t('adminUsers.err.password');
  if (err.status === 403) return t('adminUsers.err.forbidden');
  if (err.status === 404) return t('adminUsers.err.gone');
  if (err.status === 409 && reason === 'insufficient') return t('adminUsers.err.insufficient');
  if (err.status === 409 && reason.startsWith('cannot_')) return t('adminUsers.err.self');
  if (err.status === 409) return t('adminUsers.err.conflict');
  if (err.status === 429) return t('adminUsers.err.rate');
  if (err.status === 400) return t('adminUsers.err.invalid');
  return t('adminUsers.err.generic');
}

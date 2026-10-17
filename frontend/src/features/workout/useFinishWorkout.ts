import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh, ApiError } from '../../lib/api';

/**
 * How a running session ends (owner decision D3, frames `workout-finish` / `workout-finish-confirm`).
 *
 *   complete   POST /workouts/:id/finish   -> status `completed` (the history keeps it, badges are evaluated)
 *   abandon    POST /workouts/:id/abandon  -> status `abandoned` (the rows survive, the history filters it out)
 *
 * A NEW file, not an addition to `useWorkout.ts`: the existing hook files are frozen (three gates mirror
 * or import them).
 *
 * ═══ IDEMPOTENCY ═══════════════════════════════════════════════════════════════════════════════════
 *
 * The server's guard is `status = 'in_progress'`, one guarded UPDATE: ending a session twice changes
 * nothing and answers 404 — the same answer a stranger's id gets, by design (routes.js `endSession`).
 * So a retry after a lost response cannot re-date or flip a closed session, and the client needs no
 * key of its own (like the void, unlike the check: there are no values to disagree about). What the
 * client DOES need is to tell "my earlier attempt already landed" from "this failed": on a 404 it
 * asks `/workouts/current` again, and if that session is no longer the live one, the end it asked
 * for has happened — the call resolves as `replayed` instead of showing an error for a session that
 * is, in fact, closed. Any other 404 (the session is still live and still refused) stays an error.
 *
 * ═══ NOT QUEUED OFFLINE ═══════════════════════════════════════════════════════════════════════════
 *
 * Unlike a set check, ending a session is not put into the outbox: a finish replayed an hour later
 * would close whatever session is live THEN, and "Befejezés" must not report success it does not
 * have. A network failure is an error the sheet shows, with "Újra".
 */
export type SessionEnd = 'complete' | 'abandon';

const PATH: Record<SessionEnd, string> = { complete: 'finish', abandon: 'abandon' };

export interface FinishOutcome {
  end: SessionEnd;
  /** The session was already closed when this request arrived (a retry of one that landed). */
  replayed: boolean;
}

/**
 * `onEnded` runs BEFORE the session queries are invalidated: the caller marks the player as ended and
 * leaves for Home first, so the refetched "no session" can never be read as the D2 empty state
 * (which takes the Edzés tab to the library).
 */
export function useFinishWorkout(onEnded?: (outcome: FinishOutcome) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, end }: { logId: number; end: SessionEnd }): Promise<FinishOutcome> => {
      try {
        await apiWithRefresh<{ status: string }>(`/workouts/${logId}/${PATH[end]}`, { method: 'POST', body: {} });
        return { end, replayed: false };
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) throw err;
        const now = await apiWithRefresh<{ log: { id: number } | null }>('/workouts/current');
        if (now.log?.id === logId) throw err;
        return { end, replayed: true };
      }
    },
    // Everything that read the live session or "what is on today": the player itself (and the
    // previous column, whose history now holds this session), Home's today card, and the wallet and
    // achievements a completed session may have moved (evaluated in the background on the server).
    //
    // NOT awaited, and only after `onEnded`: the caller leaves the player for Home the moment the end
    // has landed.
    onSuccess: (outcome) => {
      onEnded?.(outcome);
      for (const queryKey of [['workout'], ['today'], ['coin-wallet'], ['coin-ledger'], ['coin-achievements']]) {
        void qc.invalidateQueries({ queryKey });
      }
    },
  });
}

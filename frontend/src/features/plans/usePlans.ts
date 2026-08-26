import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

export interface PlanSummary {
  id: number;
  scope: 'template' | 'client' | 'personal' | 'system';
  name: string;
  description: string | null;
  goal: string | null;
  cycle_days: number;
  starts_on: string | null;
  ends_on: string | null;
  status: 'draft' | 'active' | 'paused' | 'ended';
  revision: number;
  coach_client_id: number | null;
  client_user_id: number | null;
  client_email: string | null;
  client_display_name: string | null;
  day_count: number;
  updated_at: number;
}

export interface PlanDay {
  id: number;
  plan_id: number;
  day_index: number;
  slot: number;
  name: string;
  notes: string | null;
  is_rest: 0 | 1;
  est_minutes: number | null;
  start_time: string | null;
}

/**
 * THESE INTERFACES ARE THE WIRE, NOT A SUBSET OF IT.
 *
 * `GET /plans/:id` answers `SELECT *` for blocks and `SELECT px.*` for exercises, so the payload
 * has always carried more columns than were declared here. That was harmless while the fields were
 * only read — until the delete-undo started REPLAYING a captured row: an undeclared column is a
 * column the snapshot silently drops, and an undo that restores something different from what was
 * deleted is worse than no undo at all. An EMOM's time cap, a tempo string and an `assisted`
 * load mode were each one of those.
 */
export interface PlanBlock {
  id: number;
  plan_id: number;
  day_id: number;
  kind: 'single' | 'superset' | 'circuit' | 'emom' | 'amrap';
  position: number;
  rounds: number | null;
  rest_seconds: number | null;
  /** The time cap on an EMOM/AMRAP block. */
  cap_seconds: number | null;
  label: string | null;
}

export interface PlanExercise {
  id: number;
  plan_id: number;
  block_id: number;
  exercise_id: number | null;
  exercise_name_snapshot: string;
  /** Resolved into the reader's language; the snapshot is only the fallback. */
  name?: string;
  translated?: 0 | 1;
  position: number;
  target_metric: 'reps' | 'time' | 'distance';
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_seconds: number | null;
  target_distance_m: number | null;
  /** Canonical kilograms, computed by the server from what was typed. NEVER sent back on a write. */
  target_weight_kg: number | null;
  target_weight_entry_unit: 'kg' | 'lb' | null;
  target_weight_entry_value: number | null;
  target_percent_1rm: number | null;
  target_rpe: number | null;
  load_mode: 'external' | 'bodyweight' | 'weighted_bodyweight' | 'assisted';
  tempo: string | null;
  rest_seconds: number | null;
  notes: string | null;
}

export interface PlanTree {
  plan: PlanSummary & { archived_at: number | null };
  days: PlanDay[];
  blocks: PlanBlock[];
  exercises: PlanExercise[];
  targets: unknown[];
}

const KEY = ['plans'] as const;

export const usePlans = () =>
  useQuery({ queryKey: KEY, queryFn: () => apiWithRefresh<{ plans: PlanSummary[] }>('/plans') });

export const usePlan = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, id],
    queryFn: () => apiWithRefresh<PlanTree>(`/plans/${id}`),
    enabled: id != null,
    retry: false,
  });

/**
 * Every mutation invalidates the whole plan namespace.
 *
 * A structural edit anywhere in the tree bumps the plan's `revision` (by trigger), so the plan row
 * and its children are never independently fresh. Invalidating selectively would leave a stale
 * revision on screen — and the revision is what a log snapshots, so it is not cosmetic.
 */
// Generic on the RESULT as well as the arguments: a clone returns the new plan's id and the caller
// navigates to it, so swallowing the return type into `unknown` would push a cast onto every use.
function usePlanMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export const useCreatePlan = () =>
  usePlanMutation((body: { name: string; coach_client_id?: number | null; starts_on?: string | null; cycle_days?: number }) =>
    apiWithRefresh<{ id: number }>('/plans', { method: 'POST', body }),
  );

export const useUpdatePlan = () =>
  usePlanMutation(({ id, ...body }: { id: number } & Record<string, unknown>) =>
    apiWithRefresh(`/plans/${id}`, { method: 'PATCH', body }),
  );

export const useArchivePlan = () =>
  usePlanMutation((id: number) => apiWithRefresh(`/plans/${id}`, { method: 'DELETE' }));

export const useCreateDay = () =>
  usePlanMutation(({ planId, ...body }: { planId: number } & Record<string, unknown>) =>
    apiWithRefresh<{ id: number }>(`/plans/${planId}/days`, { method: 'POST', body }),
  );

export const useDeleteDay = () =>
  usePlanMutation(({ planId, dayId }: { planId: number; dayId: number }) =>
    apiWithRefresh(`/plans/${planId}/days/${dayId}`, { method: 'DELETE' }),
  );

export const useCreateBlock = () =>
  usePlanMutation(({ planId, ...body }: { planId: number } & Record<string, unknown>) =>
    apiWithRefresh<{ id: number }>(`/plans/${planId}/blocks`, { method: 'POST', body }),
  );

export const useDeleteBlock = () =>
  usePlanMutation(({ planId, blockId }: { planId: number; blockId: number }) =>
    apiWithRefresh(`/plans/${planId}/blocks/${blockId}`, { method: 'DELETE' }),
  );

export const useAddExercise = () =>
  usePlanMutation(({ planId, ...body }: { planId: number } & Record<string, unknown>) =>
    apiWithRefresh<{ id: number }>(`/plans/${planId}/exercises`, { method: 'POST', body }),
  );

export const useDeleteExercise = () =>
  usePlanMutation(({ planId, rowId }: { planId: number; rowId: number }) =>
    apiWithRefresh(`/plans/${planId}/exercises/${rowId}`, { method: 'DELETE' }),
  );

/**
 * Clone a plan — to a client (with a link) or to a fresh template (without one).
 *
 * A DEEP COPY on the server, never a live link: a coach must be able to fix a rep range for ONE
 * client without rewriting what everyone else does tomorrow. The clone lands as a DRAFT so it can
 * be tailored before the client ever sees it, and `source_plan_id` records where it came from.
 */
export const useClonePlan = () =>
  usePlanMutation(
    ({ id, ...body }: { id: number; name?: string; coach_client_id?: number | null; starts_on?: string | null }) =>
      apiWithRefresh<{ id: number; copied: Record<string, number> }>(`/plans/${id}/clone`, {
        method: 'POST',
        body,
      }),
  );

/**
 * Copy days forward within a plan.
 *
 * `cycleGrewTo` comes back non-null when the copy did not fit in the existing cycle. That is not a
 * detail: growing the cycle re-dates every future occurrence of the plan, so the UI has to say it
 * out loud rather than let the coach discover their calendar moved.
 */
export const useCopyDays = () =>
  usePlanMutation<
    { planId: number; day_ids: number[]; offset: number },
    { copied: number; cycleDays: number; cycleGrewTo: number | null }
  >(({ planId, ...body }) =>
    apiWithRefresh(`/plans/${planId}/copy-days`, { method: 'POST', body }),
  );

/**
 * Reorder sends the WHOLE list, and the server answers `{moved, of}`.
 *
 * When those disagree the client's list has drifted from the server's — a row was deleted from
 * another device, or an id was stale. The response is the signal to refetch rather than to keep
 * showing an order the server did not accept.
 */
export const useReorder = () =>
  usePlanMutation(({ planId, what, ids }: { planId: number; what: 'blocks' | 'exercises'; ids: number[] }) =>
    apiWithRefresh<{ moved: number; of: number }>(`/plans/${planId}/${what}/order`, {
      method: 'PUT',
      body: { ids },
    }),
  );

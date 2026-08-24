import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';
import type { ProgressPoint } from '../../ui/feedback/ProgressChart';

export interface ClientRow {
  link_id: number;
  client_id: number;
  email: string;
  /**
   * NULL until the person names themselves — a coach-created account whose owner has never signed
   * in cannot have. Read it through `personLabel`, never directly: the fallback is a decision about
   * privacy, not a `??` for each call site to make on its own. See `lib/person.ts`.
   */
  display_name: string | null;
  status: 'invited' | 'active' | 'archived';
  origin: 'invite' | 'team_code' | 'pregenerated' | 'manual';
  team_id: number | null;
  team_name: string | null;
  invited_at: number;
  accepted_at: number | null;
  /** 1 while a pre-generated account still holds the coach's temporary password. */
  must_change_credentials: 0 | 1;
  /**
   * Completed sessions in the last 28 days, computed at READ time.
   *
   * A COUNT, never a percentage. A percentage needs a denominator, and "how many sessions were
   * prescribed" is the schedule rule — arithmetic over a window rather than a column. Showing a
   * made-up denominator would be worse than showing none.
   */
  sessions_28d: number;
  last_session_on: string | null;
}

export interface TeamRow {
  id: number;
  name: string;
  description: string | null;
  member_count: number;
}

export interface CodeRow {
  id: number;
  label: string | null;
  team_id: number | null;
  kind: 'single' | 'multi';
  max_uses: number;
  uses: number;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
}

const KEY = ['coaching'] as const;

export function useClients() {
  return useQuery({
    queryKey: [...KEY, 'clients'],
    queryFn: () => apiWithRefresh<{ clients: ClientRow[] }>('/clients'),
  });
}

/** One client, for the deep-linkable detail screen. */
export function useClient(linkId: number | null) {
  return useQuery({
    queryKey: [...KEY, 'client', linkId],
    queryFn: () => apiWithRefresh<{ client: ClientRow & { joined_at: number } }>(`/clients/${linkId}`),
    enabled: linkId != null,
    // A 404 here means "not yours, archived, or never existed" — three truths the API refuses to
    // distinguish. Retrying cannot turn any of them into a 200, so it only delays the message.
    retry: false,
  });
}

export interface ClientOnboarding {
  status: 'draft' | 'complete';
  primary_goal: string | null;
  experience: string | null;
  sessions_per_week: number | null;
  session_minutes: number | null;
  training_location: string | null;
  units: 'metric' | 'imperial';
  height_cm: number | null;
  bodyweight_kg: number | null;
  birth_year: number | null;
  sex: string | null;
  notes: string | null;
  /** Resolved into the COACH's language by the server — this is the coach reading, not the client. */
  equipment: { id: number; slug: string; name: string }[];
  limitations: { body_area: string; severity: 'past' | 'caution' | 'avoid'; note: string | null }[];
}

export function useClientOnboarding(linkId: number | null) {
  return useQuery({
    queryKey: [...KEY, 'client', linkId, 'onboarding'],
    queryFn: () => apiWithRefresh<{ profile: ClientOnboarding | null }>(`/clients/${linkId}/onboarding`),
    enabled: linkId != null,
    retry: false,
  });
}

export interface ClientLog {
  id: number;
  title: string | null;
  plan_name_snapshot: string | null;
  day_name_snapshot: string | null;
  local_date: string;
  completed_at: number | null;
  status: string;
  total_working_sets: number | null;
  total_reps: number | null;
  total_volume_kg: number | null;
  duration_seconds: number | null;
}

export interface ClientRecord {
  id: number;
  exercise_id: number | null;
  exercise_name_snapshot: string;
  kind: string;
  rep_bucket: number;
  value: number;
  previous_value: number | null;
  value_unit: string;
  local_date: string;
}

/** A client's training history, read through the link. Archiving withdraws it on the next request. */
export function useClientWorkouts(linkId: number | null) {
  return useQuery({
    queryKey: [...KEY, 'client', linkId, 'workouts'],
    queryFn: () => apiWithRefresh<{ logs: ClientLog[] }>(`/clients/${linkId}/workouts`),
    enabled: linkId != null,
    retry: false,
  });
}

export function useClientRecords(linkId: number | null) {
  return useQuery({
    queryKey: [...KEY, 'client', linkId, 'records'],
    queryFn: () => apiWithRefresh<{ records: ClientRecord[] }>(`/clients/${linkId}/records`),
    enabled: linkId != null,
    retry: false,
  });
}

export function useTeams() {
  return useQuery({
    queryKey: [...KEY, 'teams'],
    queryFn: () => apiWithRefresh<{ teams: TeamRow[] }>('/teams'),
  });
}

export function useCodes() {
  return useQuery({
    queryKey: [...KEY, 'codes'],
    queryFn: () => apiWithRefresh<{ codes: CodeRow[] }>('/invite-codes'),
  });
}

function useCoachingMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Everything on this screen derives from the same three lists, so one invalidation keeps
    // them consistent rather than each mutation guessing which caches it touched.
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export const useCreateTeam = () =>
  useCoachingMutation((body: { name: string; description?: string | null }) =>
    apiWithRefresh('/teams', { method: 'POST', body }),
  );

export const useArchiveClient = () =>
  useCoachingMutation((linkId: number) =>
    apiWithRefresh(`/clients/${linkId}/archive`, { method: 'POST' }),
  );

export const useRevokeCode = () =>
  useCoachingMutation((codeId: number) =>
    apiWithRefresh(`/invite-codes/${codeId}/revoke`, { method: 'POST' }),
  );

/**
 * Minting a code is the one call whose RESULT matters beyond success: the plaintext comes back
 * exactly once and is never retrievable again, so the caller must show it immediately.
 */
export function useCreateCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: 'single' | 'multi'; max_uses?: number; team_id?: number | null }) =>
      apiWithRefresh<{ id: number; code: string }>('/invite-codes', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function usePregenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { emails: string[]; team_id?: number | null }) =>
      apiWithRefresh<{
        created: { email: string; temporaryPassword: string; userId: number }[];
        skipped: string[];
      }>('/clients/pregenerate', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * One exercise's progress series.
 *
 * `linkId` is optional: omitted, the server returns the CALLER's own series, which is what the
 * client-side progress screen wants. Passed, it resolves the client through the link and an
 * unrelated coach gets an empty series rather than an error — the same shape as every other
 * link-scoped read here.
 */
export function useProgress(exerciseId: number | null, linkId?: number | null) {
  return useQuery({
    queryKey: ['progress', exerciseId, linkId ?? 'self'],
    enabled: exerciseId != null,
    queryFn: () =>
      apiWithRefresh<{ exercise_id: number; days: number; points: ProgressPoint[] }>(
        `/progress?exercise_id=${exerciseId}${linkId ? `&client=${linkId}` : ''}`,
      ),
  });
}

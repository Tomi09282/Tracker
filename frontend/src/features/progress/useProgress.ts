import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

export interface MetricRow {
  key: string;
  unit: 'kg' | 'cm' | 'pct';
  min: number;
  max: number;
  sort_order: number;
}

export interface MeasurementRow {
  id: number;
  metric_key: string;
  measured_on: string;
  value: number;
  note: string | null;
  unit: 'kg' | 'cm' | 'pct';
}

export interface PhotoRow {
  id: number;
  taken_on: string;
  pose: string | null;
  storage_key: string;
  mime: string;
  bytes: number;
  note: string | null;
  created_at: number;
}

export interface ShareRow {
  id: number;
  coach_client_id: number;
  share_measurements: 0 | 1;
  share_photos: 0 | 1;
  granted_at: number;
  revoked_at: number | null;
  coach_email: string;
  link_status: 'invited' | 'active' | 'archived';
}

/**
 * `clientId` is the SUBJECT, and passing it is what makes this the coach's read.
 *
 * The same hook serves both sides on purpose. Two hooks would be two places to get the query key
 * wrong, and a coach's data cached under the client's key is a data leak inside the browser.
 * `clientId` is therefore part of every key below, never merely part of the URL.
 */
export function useMeasurements(clientId?: number, metricKey?: string) {
  const params = new URLSearchParams();
  if (clientId != null) params.set('client_id', String(clientId));
  if (metricKey) params.set('metric_key', metricKey);
  const qs = params.toString();

  return useQuery({
    queryKey: ['measurements', clientId ?? 'self', metricKey ?? 'all'],
    queryFn: () =>
      apiWithRefresh<{ client_id: number; measurements: MeasurementRow[] }>(
        `/measurements${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useMetrics() {
  return useQuery({
    queryKey: ['measurement-metrics'],
    queryFn: () => apiWithRefresh<{ metrics: MetricRow[] }>('/measurement-metrics'),
    // A vocabulary that changes by INSERT rather than by deploy still changes rarely enough that
    // refetching it per screen is waste.
    staleTime: 10 * 60 * 1000,
  });
}

export function useRecordMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { metric_key: string; measured_on: string; value: number; note?: string | null }) =>
      apiWithRefresh<{ id: number }>('/measurements', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measurements'] }),
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiWithRefresh<void>(`/measurements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measurements'] }),
  });
}

export function usePhotos(clientId?: number) {
  return useQuery({
    queryKey: ['progress-photos', clientId ?? 'self'],
    queryFn: () =>
      apiWithRefresh<{ client_id: number; photos: PhotoRow[] }>(
        `/progress-photos${clientId != null ? `?client_id=${clientId}` : ''}`,
      ),
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiWithRefresh<void>(`/progress-photos/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress-photos'] }),
  });
}

export function useShares() {
  return useQuery({
    queryKey: ['progress-shares'],
    queryFn: () => apiWithRefresh<{ shares: ShareRow[] }>('/progress-shares'),
  });
}

export function useSetShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, ...body }: { linkId: number; share_measurements?: boolean; share_photos?: boolean }) =>
      apiWithRefresh<void>(`/progress-shares/${linkId}`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress-shares'] }),
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: number) => apiWithRefresh<void>(`/progress-shares/${linkId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress-shares'] }),
  });
}

export interface AccessEntry {
  id: number;
  viewer: string;
  kind: string;
  target_id: number | null;
  at: number;
}

export function useAccessLog() {
  return useQuery({
    queryKey: ['progress-access-log'],
    queryFn: () => apiWithRefresh<{ entries: AccessEntry[] }>('/progress-access-log'),
  });
}

/**
 * Upload a photo.
 *
 * NOT through `apiWithRefresh`: this is multipart, and that helper sets a JSON content type. The
 * cookie policy and the CSRF header are still applied, because the route sits above the global
 * CSRF middleware precisely so it can run its own equivalent check — the rule is narrowed for one
 * route, not waived, and the client has to hold up its half.
 */
export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; taken_on: string; pose?: string; note?: string }) => {
      const form = new FormData();
      form.append('file', input.file);
      form.append('taken_on', input.taken_on);
      if (input.pose) form.append('pose', input.pose);
      if (input.note) form.append('note', input.note);

      const res = await fetch('/api/v1/progress-photos', {
        method: 'POST',
        credentials: 'include',
        // Content-Type is left unset ON PURPOSE so the browser writes the multipart boundary.
        headers: { 'X-CSRF': '1' },
        body: form,
      });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { id: number; storage_key: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress-photos'] }),
  });
}

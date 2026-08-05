import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

export interface EquipmentOption {
  id: number;
  slug: string;
  name: string;
  /** False when the label fell back to another language — the UI says so rather than pretending. */
  translated: 0 | 1;
}

export interface Limitation {
  body_area: string;
  severity: 'past' | 'caution' | 'avoid';
  note: string | null;
}

export interface OnboardingProfile {
  status: 'draft' | 'complete';
  step: number;
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
  completed_at: number | null;
  equipment: number[];
  limitations: Limitation[];
}

export interface OnboardingPayload {
  lang: string;
  profile: OnboardingProfile | null;
  options: {
    equipment: EquipmentOption[];
    goals: string[];
    experience: string[];
    locations: string[];
    sex: string[];
    bodyAreas: string[];
    severity: string[];
  };
  required: string[];
}

/** Anything the questionnaire can send. Mirrors the server's writable set, nothing more. */
export type ProfilePatch = Partial<
  Pick<
    OnboardingProfile,
    | 'step'
    | 'primary_goal'
    | 'experience'
    | 'sessions_per_week'
    | 'session_minutes'
    | 'training_location'
    | 'units'
    | 'height_cm'
    | 'bodyweight_kg'
    | 'birth_year'
    | 'sex'
    | 'notes'
  >
> & { equipment?: number[]; limitations?: Limitation[] };

const KEY = ['onboarding'] as const;

export function useOnboarding() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiWithRefresh<OnboardingPayload>('/onboarding'),
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiWithRefresh<{ ok: true; alreadyComplete: boolean }>('/onboarding/complete', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Draft auto-save.
 *
 * Three things had to be true, and each one is why a plain `useMutation` was not enough:
 *
 *  1. It saves while the client types, so it debounces — one request per pause, not per keystroke.
 *  2. Two answers changed inside one debounce window must BOTH be sent. The pending patch is
 *     merged into, never replaced, or the faster answer silently loses.
 *  3. Closing the tab mid-window must not lose the last answer, so the pending patch is flushed
 *     on `pagehide`. `beforeunload` would not fire on mobile Safari, which is exactly where a
 *     half-filled form gets abandoned.
 */
export function useDraftSave(delay = 700) {
  const qc = useQueryClient();
  const pending = useRef<ProfilePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    // Cleared BEFORE the request, so answers given while it is in flight queue for the next
    // save instead of being wiped by this one's completion.
    pending.current = {};
    setState('saving');
    try {
      const res = await apiWithRefresh<{ profile: OnboardingProfile }>('/onboarding', {
        method: 'PATCH',
        body: patch,
      });
      qc.setQueryData<OnboardingPayload>(KEY, (old) => (old ? { ...old, profile: res.profile } : old));
      setState('saved');
    } catch {
      // The answer is not lost: it goes back into the pending patch so the next save retries it.
      // A silent drop here would mean the client sees "saved" for an answer the server refused.
      pending.current = { ...patch, ...pending.current };
      setState('error');
    }
  }, [qc]);

  const save = useCallback(
    (patch: ProfilePatch) => {
      pending.current = { ...pending.current, ...patch };
      setState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      // Unmounting is navigating away mid-questionnaire — the same loss, so the same flush.
      void flush();
    };
  }, [flush]);

  return { save, flush, state };
}

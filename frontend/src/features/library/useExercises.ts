import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

export interface ExerciseRow {
  id: number;
  name: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  exercise_type: string | null;
  status: string;
  owner_id: number | null;
  source: string;
  /** 0 when the name came from the fallback chain rather than the requested language. */
  translated: 0 | 1;
  thumb_key: string | null;
  /** Both present only when `forClient` was asked for. */
  missing_equipment?: string[];
  conflicts?: { body_area: string; severity: 'avoid' | 'caution'; relation: 'loads' | 'stabilises' }[];
}

export interface ExerciseFilters {
  q?: string;
  muscle?: string;
  equipment?: string;
  difficulty?: string;
  type?: string;
  mine?: boolean;
  /**
   * A coach_clients link id. Asks the server to annotate each row with what THIS client can do:
   * kit they did not tick, and body areas they flagged that the movement's muscles belong to.
   * Ownership-checked server-side — a miss is a 404, not an unannotated list.
   */
  forClient?: number;
}

export interface Taxonomy {
  id: number;
  slug: string;
  /**
   * Already resolved into the requested language by the server, with the fallback chain applied.
   *
   * It used to be `name_en` + `name_hu` with a ternary at every call site, which is how a UI ends
   * up half-translated — two of three sites get updated and the third keeps serving English.
   * Migration 007 dropped those columns. `translated` says whether this label really is in the
   * reader's language or fell back, so the UI can mark it rather than pretending.
   */
  name: string;
  translated?: 0 | 1;
  body_side?: 'front' | 'back' | 'both';
}

const toQuery = (filters: ExerciseFilters, lang: string, cursor?: string) => {
  const p = new URLSearchParams();
  if (filters.q) p.set('q', filters.q);
  if (filters.muscle) p.set('muscle', filters.muscle);
  if (filters.equipment) p.set('equipment', filters.equipment);
  if (filters.difficulty) p.set('difficulty', filters.difficulty);
  if (filters.type) p.set('type', filters.type);
  if (filters.mine) p.set('mine', '1');
  if (filters.forClient) p.set('for_client', String(filters.forClient));
  p.set('lang', lang);
  if (cursor) p.set('cursor', cursor);
  return p.toString();
};

/**
 * Paged exercise list.
 *
 * `lang` is part of the query key on purpose: switching language changes the CONTENT, not just
 * the chrome, so the cached pages for the old language must not be reused.
 */
export function useExercises(filters: ExerciseFilters, lang: string) {
  return useInfiniteQuery({
    queryKey: ['exercises', filters, lang],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiWithRefresh<{ exercises: ExerciseRow[]; nextCursor: string | null }>(
        `/exercises?${toQuery(filters, lang, pageParam)}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * Muscle and equipment labels, resolved server-side into the requested language.
 *
 * `lang` is both SENT and part of the query key, and both halves were missing. The result was a
 * German interface with Hungarian filter chips — measured, not hypothetical:
 *
 *   - Without `?lang=`, the server falls back to Accept-Language, which is the BROWSER's language
 *     and has nothing to do with the language the user picked in the app. Those two differ for
 *     anyone using the switch at all, which is everyone this feature exists for.
 *   - Without `lang` in the key, the first answer is cached for the 30-minute staleTime below and
 *     switching language would keep showing it. That is the more dangerous half: it would survive
 *     a fix to the first one and look like the fix did not work.
 *
 * `useExercises` had both from the start. The two hooks living in one file and still disagreeing
 * is the argument for the rule, not against it.
 */
export function useTaxonomies(lang: string) {
  return useQuery({
    queryKey: ['taxonomies', lang],
    queryFn: () =>
      apiWithRefresh<{ lang: string; muscles: Taxonomy[]; equipment: Taxonomy[] }>(
        `/taxonomies?lang=${encodeURIComponent(lang)}`,
      ),
    // These change when an admin edits them, which is approximately never during a session.
    staleTime: 30 * 60_000,
  });
}

export interface ExerciseDetail {
  exercise: {
    id: number;
    name: string;
    description: string | null;
    instructions: string[];
    difficulty: string | null;
    exercise_type: string | null;
    source: string;
    translated: 0 | 1;
  };
  lang: string;
  availableLangs: { lang: string; origin: string }[];
  muscles: (Taxonomy & { role: 'primary' | 'secondary' })[];
  equipment: Taxonomy[];
  media: { id: number; storage_key: string; mime: string; width: number; height: number }[];
  substitutions: { id: number; name: string; difficulty: string | null }[];
}

export function useExercise(id: number | null, lang: string) {
  return useQuery({
    queryKey: ['exercise', id, lang],
    queryFn: () => apiWithRefresh<ExerciseDetail>(`/exercises/${id}?lang=${lang}`),
    enabled: id !== null,
  });
}

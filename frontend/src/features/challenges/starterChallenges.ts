import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiWithRefresh } from '../../lib/api';
import type { ChallengeCategory, ChallengeResponse } from '../../lib/lifeos-api';
import { DRAW_KEY, POOL_KEY, refusalOf } from './challengesApi';

/**
 * The OPT-IN starter list (open finding O2): a new account's pool is empty, so its first daily draw
 * answers 409 EMPTY_POOL. "Add starter challenges" creates these ten, one `POST /challenges` each —
 * the existing route, no migration, no server change.
 *
 * What is data here is only the numbers: the NAME of each one is user data and is read from the
 * language files (`challenges.starter.<id>`) in the user's current language at the moment of the click.
 * Every value is inside the server's own limits (name <= 80, points 0..50, weight 1..3, pool of 50).
 *
 * IDEMPOTENT BY KEY: the client key of the first try is `starter-NN`; the server answers a repeated key
 * with the challenge it already made (`replayed`), so a retry after a partial failure, a double tap or
 * a second tab never creates a duplicate. A key whose challenge was DELETED is answered 409 CONFLICT
 * (the row keeps its key); that one is tried again under `starter-NN-2`, then `-3` and so on, and the
 * following starters begin at the generation that worked (they were deleted together).
 */
export interface Starter {
  id: string;
  category: ChallengeCategory;
  points: number;
  weight: number;
}

export const STARTERS: readonly Starter[] = [
  { id: 's01', category: 'discipline', points: 3, weight: 1 },
  { id: 's02', category: 'discipline', points: 4, weight: 2 },
  { id: 's03', category: 'movement', points: 6, weight: 3 },
  { id: 's04', category: 'movement', points: 5, weight: 2 },
  { id: 's05', category: 'mind', points: 6, weight: 2 },
  { id: 's06', category: 'mind', points: 4, weight: 1 },
  { id: 's07', category: 'connection', points: 8, weight: 2 },
  { id: 's08', category: 'connection', points: 4, weight: 1 },
  { id: 's09', category: 'food', points: 2, weight: 3 },
  { id: 's10', category: 'food', points: 10, weight: 1 },
];

/** How many keys one starter may burn through: its own, then one more for each time the whole list was deleted. */
const GENERATIONS = 6;

/** `starter-01`, `starter-01-2`, `starter-01-3`: 8..64 of [A-Za-z0-9_-] as the server's clientKey requires. */
export function starterKey(index: number, generation: number) {
  const base = `starter-${String(index + 1).padStart(2, '0')}`;
  return generation === 0 ? base : `${base}-${generation + 1}`;
}

/** A starter run that stopped: how many of the ten the server holds now, and why it stopped. */
export class StarterRunError extends Error {
  readonly created: number;
  readonly reason: unknown;
  constructor(created: number, cause: unknown) {
    super('starter challenges incomplete');
    this.created = created;
    this.reason = cause;
  }
}

const isConflict = (err: unknown) => err instanceof ApiError && err.status === 409 && refusalOf(err) === null;

/**
 * Creates the starters one after the other (the order is the list's; the pool shows them by name),
 * `names` being the ten names in the user's language, by id. Stops at the first refusal that retrying
 * under another key cannot cure (the pool cap, no time zone yet, the network) with a `StarterRunError`.
 * Writes nothing into the caches until the run is over, then refreshes the pool, the draw and Ma once.
 */
export function useAddStarterChallenges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (names: Readonly<Record<string, string>>) => {
      let held = 0;
      let from = 0;
      try {
        for (const [i, s] of STARTERS.entries()) {
          for (let g = from; g < GENERATIONS; g += 1) {
            try {
              await apiWithRefresh<ChallengeResponse>('/challenges', {
                method: 'POST',
                body: { clientKey: starterKey(i, g), name: names[s.id], category: s.category, points: s.points, weight: s.weight },
              });
              held += 1;
              from = g;
              break;
            } catch (err) {
              if (!isConflict(err) || g === GENERATIONS - 1) throw err;
            }
          }
        }
      } catch (err) {
        throw new StarterRunError(held, err);
      }
      return held;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: POOL_KEY });
      void qc.invalidateQueries({ queryKey: DRAW_KEY });
      void qc.invalidateQueries({ queryKey: ['lifeos', 'today'] });
    },
  });
}

/** The code behind a failed run, for the message: the refusal of the last write, if it was one. */
export function starterRefusal(err: unknown) {
  return refusalOf(err instanceof StarterRunError ? err.reason : err);
}

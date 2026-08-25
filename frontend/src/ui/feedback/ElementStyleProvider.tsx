import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CATALOG, type Variant } from './catalog';

type StyleMap = Record<string, Variant>;

const StyleContext = createContext<StyleMap>({});
/** Lets a subtree force a variant — the playground and the admin preview use this. */
const OverrideContext = createContext<StyleMap>({});

/**
 * The elements whose design of record is NOT variant A. Everything absent from this map is A
 * deliberately — A is the calm default the catalog is ordered around, not a placeholder.
 *
 * This map is the client-side mirror of the seed in
 * `backend/src/db/migrations/002_theming.sql`, which is the copy the server actually serves. The
 * comment above this constant used to say "curated defaults" over a blanket `'A'` for all 27, so
 * ten elements — E1, E8, E12, E13, E15, E16, E19, E20, E25 — rendered one variant on first paint
 * and swapped to a different one the moment the query resolved, on every cold load.
 *
 * E21 is the one entry that intentionally LEADS the seed rather than mirroring it: both workout
 * mockups draw the active row's `Tartsd nyomva a rögzítéshez` instruction, which only renders
 * under B (Hold-to-confirm), so hold-to-confirm is the design of record for the set-check row. The
 * seed still says A and the server therefore still serves A — that row has to change with it, and
 * until it does this only fixes the first paint. The instruction stays gated on the variant either
 * way: printing "hold to record" on a row that records on a tap is a false instruction.
 */
const CURATED: Record<string, Variant> = {
  E1: 'D',
  E8: 'D',
  E12: 'D',
  E13: 'B',
  E15: 'C',
  E16: 'D',
  E19: 'C',
  E20: 'B',
  E21: 'B',
  E25: 'B',
};

/** Curated defaults, used until the server answers and if it never does. */
const FALLBACK: StyleMap = {
  // Spread over the catalog rather than used alone, so an element added to the catalog tomorrow
  // gets A instead of `undefined`.
  ...Object.fromEntries(CATALOG.map((e) => [e.id, 'A' as Variant])),
  ...CURATED,
};

/**
 * Loads the GLOBAL active variant for every element.
 *
 * These are one admin setting shared by every user (owner requirement 24) — not a per-user
 * preference — so the whole map arrives in one small public request and is cached for the
 * session. A failure degrades to the curated defaults rather than to an unstyled app.
 */
export function ElementStyleProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['element-styles'],
    queryFn: () => api<{ styles: StyleMap }>('/ui/element-styles'),
    staleTime: 5 * 60_000,
  });

  const value = useMemo(() => ({ ...FALLBACK, ...(data?.styles ?? {}) }), [data]);
  return <StyleContext.Provider value={value}>{children}</StyleContext.Provider>;
}

export function VariantOverride({ styles, children }: { styles: StyleMap; children: ReactNode }) {
  const parent = useContext(OverrideContext);
  const merged = useMemo(() => ({ ...parent, ...styles }), [parent, styles]);
  return <OverrideContext.Provider value={merged}>{children}</OverrideContext.Provider>;
}

/**
 * The active variant for an element. Every feedback-aware component calls this instead of
 * hardcoding its behaviour, which is what makes the admin studio able to change the feel of
 * the entire app without a code change or a redeploy.
 */
export function useElementVariant(elementId: string): Variant {
  const global = useContext(StyleContext);
  const override = useContext(OverrideContext);
  return override[elementId] ?? global[elementId] ?? 'A';
}

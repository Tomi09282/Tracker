import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CATALOG, type Variant } from './catalog';

type StyleMap = Record<string, Variant>;

const StyleContext = createContext<StyleMap>({});
/** Lets a subtree force a variant — the playground and the admin preview use this. */
const OverrideContext = createContext<StyleMap>({});

/** Curated defaults, used until the server answers and if it never does. */
const FALLBACK: StyleMap = Object.fromEntries(CATALOG.map((e) => [e.id, 'A' as Variant]));

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

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { readableOn } from './contrast';

export const THEME_PACKS = ['midnight', 'solar', 'forest', 'neon', 'mono'] as const;
export type ThemePack = (typeof THEME_PACKS)[number];

export interface GradientStop {
  color: string;
  position: number;
}
export interface Gradient {
  type: 'linear' | 'radial';
  angle: number;
  stops: GradientStop[];
}

export interface ThemeState {
  pack: ThemePack;
  /** null = use the pack's own accent. */
  accent: string | null;
  gradient: Gradient | null;
}

const STORAGE_KEY = 'tracker.theme';
const DEFAULT: ThemeState = { pack: 'midnight', accent: null, gradient: null };

interface ThemeContextValue extends ThemeState {
  setTheme: (next: Partial<ThemeState>) => void;
  /** Applies values to the DOM without persisting — the live preview in the builder. */
  preview: (next: Partial<ThemeState>) => void;
  /** Drops any preview and repaints from committed state. */
  cancelPreview: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function gradientCss(g: Gradient): string {
  const stops = [...g.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ');
  return g.type === 'linear'
    ? `linear-gradient(${g.angle}deg, ${stops})`
    : `radial-gradient(circle at 50% 50%, ${stops})`;
}

/**
 * Writes theme state onto the document root.
 *
 * Everything downstream — the 50–950 accent ramp, hover, pressed, the subtle fill, the brand
 * gradient — is derived in CSS from `--accent`, so setting that one property repaints the whole
 * app. No component re-renders and no stylesheet is swapped.
 */
function applyToDom(state: ThemeState) {
  const root = document.documentElement;
  root.dataset.theme = state.pack;

  if (state.accent) {
    root.style.setProperty('--accent', state.accent);
    root.style.setProperty('--accent-fg', readableOn(state.accent).fg);
  } else {
    // Removing the override hands control back to the pack's own declaration.
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-fg');
  }

  if (state.gradient) root.style.setProperty('--gradient-brand', gradientCss(state.gradient));
  else root.style.removeProperty('--gradient-brand');
}

function readStored(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<ThemeState>;
    return {
      pack: THEME_PACKS.includes(parsed.pack as ThemePack) ? (parsed.pack as ThemePack) : 'midnight',
      accent: typeof parsed.accent === 'string' ? parsed.accent : null,
      gradient: parsed.gradient ?? null,
    };
  } catch {
    return DEFAULT;
  }
}

/**
 * Local storage is the FAST path — it is what the pre-paint script in index.html reads, and it
 * is why a returning user never sees a flash of the wrong theme. The server copy in
 * `user_theme_prefs` is the DURABLE path: it is what makes the choice follow the user to a new
 * device. They are synced by the settings screen, and local wins on first paint.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(readStored);

  useEffect(() => {
    applyToDom(state);
  }, [state]);

  const setTheme = useCallback((next: Partial<ThemeState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next };
      const toStore = {
        ...merged,
        // The pre-paint script cannot compute contrast, so the foreground is cached alongside
        // the accent for it to read.
        accentFg: merged.accent ? readableOn(merged.accent).fg : undefined,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch {
        /* private mode or a full quota must not break theming */
      }
      return merged;
    });
  }, []);

  const preview = useCallback((next: Partial<ThemeState>) => {
    applyToDom({ ...readStored(), ...next });
  }, []);

  const cancelPreview = useCallback(() => {
    applyToDom(readStored());
  }, []);

  const value = useMemo(
    () => ({ ...state, setTheme, preview, cancelPreview }),
    [state, setTheme, preview, cancelPreview],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

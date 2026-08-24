import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { readableOn } from './contrast';

export const THEME_PACKS = ['midnight', 'solar', 'forest', 'neon', 'mono'] as const;
export type ThemePack = (typeof THEME_PACKS)[number];

/**
 * Whether surfaces are allowed to be see-through.
 *
 * `system` — follow `prefers-reduced-transparency`, which is the default and stays the default.
 * `full`   — translucent here regardless of the OS setting.
 * `none`   — opaque here regardless of the OS setting.
 *
 * The OS preference is an accessibility signal and honouring it by default is not optional. But it
 * is SYSTEM-WIDE, and somebody who turned it on because one other app was unreadable has no way to
 * say "not this one" — so the app offers its own answer, with the OS as the default rather than as
 * the ceiling. It is also the only way the material can be reviewed: the whole glass pass was built
 * and judged on a machine with the preference on, where the glass was never once on screen.
 */
export const TRANSPARENCY = ['system', 'full', 'none'] as const;
export type Transparency = (typeof TRANSPARENCY)[number];

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
  /** `system` = follow `prefers-reduced-transparency`. See the note on TRANSPARENCY above. */
  transparency: Transparency;
}

const STORAGE_KEY = 'tracker.theme';
const DEFAULT: ThemeState = { pack: 'midnight', accent: null, gradient: null, transparency: 'system' };

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

  // ABSENT means "follow the OS", which is what the media query in tokens.css already does. The
  // attribute is only written when the user has actually chosen — so a fresh install, a private
  // window and a wiped profile all behave exactly as they did before this existed.
  if (state.transparency === 'system') delete root.dataset.transparency;
  else root.dataset.transparency = state.transparency;

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
      // An unknown value falls back to following the OS, which is the safe direction: the failure
      // mode of a corrupt entry must never be "quietly ignore an accessibility preference".
      transparency: TRANSPARENCY.includes(parsed.transparency as Transparency)
        ? (parsed.transparency as Transparency)
        : 'system',
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

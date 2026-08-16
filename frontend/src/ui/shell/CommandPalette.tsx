import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Search, CornerDownLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useSession } from '../../features/auth/useSession';

interface Command {
  id: string;
  label: string;
  icon?: LucideIcon;
  run: () => void;
  keywords?: string;
  /**
   * The route, kept for SEARCH as well as navigation.
   *
   * Measured: typing "nutrition" into a Hungarian UI returned nothing. The label was
   * "Táplálkozás" and the keywords carried "food meal etel taplalkozas" — every word except the
   * English name of the screen. The comment above them claimed they carried both languages; they
   * carried the other one.
   *
   * Including the path fixes it for every entry at once and in every language, because a route is
   * already the English name of the thing. Optional, so a caller-supplied command that runs
   * something other than a navigation still works.
   */
  to?: string;
}

/**
 * Cmd+K command palette.
 *
 * Desktop only by design: on mobile the bottom navbar is already one thumb-reach away, and a
 * keyboard-summoned overlay on a device with no keyboard is dead weight.
 *
 * Deliberately NOT animated. The Bible's own frequency table puts anything used a hundred times
 * a day in the "no animation, ever" row — an open/close transition here reads as lag, and this
 * is the one surface where a power user notices 200ms.
 */
export function CommandPalette({ commands }: { commands?: Command[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  /*
   * ═══ IT KNEW FIVE OF THE PRODUCT'S EIGHTEEN SCREENS ══════════════════════════════════════════
   *
   * Home, library, settings, playground and admin. A palette people reach for and half the time do
   * not find what they wanted is a palette they stop reaching for — and the five it knew were not
   * the five anybody navigates to most.
   *
   * `keywords` carry BOTH languages on the entries where the Hungarian and English words share no
   * letters, because somebody running the app in Hungarian still types "nutrition" half the time.
   * The label itself is translated, so the search matches whichever the person actually uses.
   */
  const items = useMemo<Command[]>(() => {
    // `to` is stored as well as used, so navigation and search can never disagree about where a
    // command goes — one field, two readers.
    const go = (id: string, label: string, to: string, keywords?: string): Command => ({
      id,
      label,
      to,
      run: () => void navigate(to),
      keywords,
    });

    const base: Command[] = [
      go('home', t('nav.home'), '/', 'kezdolap today ma'),
      go('library', t('nav.library'), '/library', 'exercise gyakorlat'),
      go('nutrition', t('nav.nutrition'), '/nutrition', 'food meal etel taplalkozas'),
      go('progress', t('nav.progress'), '/progress', 'measurement meres suly weight'),
      go('workout', t('nav.workout'), '/workout', 'player edzes session'),
      go('notifications', t('nav.notifications'), '/notifications', 'ertesites'),
      go('coins', t('nav.coins'), '/coins', 'erme wallet store bolt'),
      go('marketplace', t('nav.marketplace'), '/m', 'piacter coaches edzok discover'),
      go('settings', t('nav.settings'), '/settings', 'theme tema beallitasok'),
    ];

    if (user?.role === 'coach' || user?.role === 'admin') {
      base.push(
        go('coach', t('nav.coach'), '/coach', 'clients kliensek dashboard'),
        go('plans', t('nav.plans'), '/coach/plans', 'tervek programs'),
        go('compose', t('nav.compose'), '/compose', 'posts bejegyzes publish'),
        go('composeProfile', t('nav.composeProfile'), '/compose/profile', 'public profile nyilvanos profil handle'),
      );
    }
    if (user?.role === 'admin') {
      base.push(
        go('admin', t('nav.admin'), '/admin', 'stats moderation'),
        go('styleStudio', t('nav.styleStudio'), '/admin/styles', 'variants elements stilus'),
        go('playground', t('nav.playground'), '/playground', 'qa feedback matrix'),
      );
    }
    return [...base, ...(commands ?? [])];
  }, [commands, navigate, t, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => `${c.label} ${c.keywords ?? ''} ${c.to ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => {
          // Captured on the way IN, while the element that had focus still has it.
          if (!v) returnFocusTo.current = document.activeElement as HTMLElement | null;
          return !v;
        });
        setQuery('');
        setCursor(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /*
   * Focus goes back where it came from.
   *
   * Opening moved it into the search box; closing used to drop it on `<body>`. For a keyboard user
   * that costs their place on the page every time they open the palette and change their mind —
   * which, on a surface designed to be opened constantly, is constantly.
   */
  const returnFocusTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      input.current?.focus();
    } else {
      returnFocusTo.current?.focus?.();
      returnFocusTo.current = null;
    }
  }, [open]);

  if (!open) return null;

  const runAt = (i: number) => {
    filtered[i]?.run();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-tooltip)] hidden items-start justify-center bg-black/50 pt-[12vh] lg:flex"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,560px)] overflow-hidden rounded-card border border-[var(--surface-border)] bg-[var(--sheet-bg)] shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--surface-border)] px-3">
          <Search size={20} strokeWidth={2} aria-hidden className="shrink-0 text-text-3" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); runAt(cursor); }
            }}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.placeholder')}
            // Same mechanism as the list rows below: `outline-none` sits in the utilities layer
            // and beats the `:focus-visible` backstop in index.css, so the ring has to be
            // redrawn here too. The palette opens focused on this input — losing its ring means
            // a keyboard user cannot see where the palette put them.
            className="min-h-[var(--target-min)] w-full bg-transparent text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          />
          <kbd className="text-micro rounded-field border border-[var(--surface-border)] px-1.5 py-0.5 text-text-3">
            esc
          </kbd>
        </div>

        <ul role="listbox" aria-label={t('palette.title')} className="max-h-80 overflow-auto p-1">
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => runAt(i)}
                className={cn(
                  'flex min-h-[var(--target-min)] w-full cursor-pointer items-center justify-between gap-2',
                  'rounded-field px-3 text-left text-body outline-none',
                  // The cursor moves with the arrow keys, so the row it lands on has to CHANGE
                  // rather than simply be different — instant, because this is the one surface a
                  // power user notices 200ms on.
                  'transition-colors duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
                  // `outline-none` alone removed focus instead of redrawing it: it sits in the
                  // utilities layer and beats the `:focus-visible` backstop in index.css, so a
                  // Tab into the list landed on a row with no indicator at all.
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                  i === cursor ? 'bg-accent-subtle text-text-1' : 'text-text-2',
                )}
              >
                {c.label}
                {i === cursor ? (
                  <CornerDownLeft size={16} strokeWidth={2} aria-hidden className="shrink-0 text-text-3" />
                ) : null}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            // A sentence the reader has to act on, so it sits on the label step of the ink ramp,
            // not the chrome step.
            <li className="text-body-s px-3 py-3 text-text-2">{t('palette.empty')}</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

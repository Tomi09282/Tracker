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

  const items = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'home', label: t('nav.home'), run: () => void navigate('/') },
      { id: 'library', label: t('nav.library'), run: () => void navigate('/library'), keywords: 'exercise gyakorlat' },
      { id: 'settings', label: t('nav.settings'), run: () => void navigate('/settings'), keywords: 'theme téma' },
      { id: 'playground', label: 'Playground', run: () => void navigate('/playground'), keywords: 'qa feedback' },
    ];
    if (user?.role === 'admin') {
      base.push({ id: 'admin', label: t('nav.admin'), run: () => void navigate('/admin') });
    }
    return [...base, ...(commands ?? [])];
  }, [commands, navigate, t, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery('');
        setCursor(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
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
            className="min-h-[var(--target-min)] w-full bg-transparent text-body text-text-1 outline-none placeholder:text-text-3"
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
            <li className="text-body-s px-3 py-3 text-text-3">{t('palette.empty')}</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

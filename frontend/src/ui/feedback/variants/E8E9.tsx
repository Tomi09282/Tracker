import { useTranslation } from 'react-i18next';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Pressable } from '../../primitives/Pressable';
import { useElementVariant } from '../ElementStyleProvider';
import { useMotionSafe, SPRING } from '../useMotionSafe';

/* ══ E8 — Select ════════════════════════════════════════════════════════════════════════════ */

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SelectOption[];
  value: string | null;
  onChange: (next: string) => void;
  label: string;
}) {
  const variant = useElementVariant('E8');
  const motionSafe = useMotionSafe();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const visible = useMemo(() => {
    // E — filter as you type. Only this variant searches; the others show the full list, so
    // the behaviour of the control is what changes, not just its look.
    if (variant !== 'E' || !query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, variant]);

  // A click outside closes it. Without this the panel survives the next interaction and the
  // user has to press Escape to get rid of something they already moved past.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // D — on a small screen the list rises as a bottom sheet: a dropdown pinned to a trigger near
  // the top of the viewport leaves its options under the thumb's reach.
  const asSheet = variant === 'D';

  return (
    <div ref={root} className="relative w-full">
      <span className="text-body-s text-text-2">{label}</span>

      <Pressable
        shape="field"
        className="mt-1.5 w-full"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn('flex-1 truncate', selected ? 'text-text-1' : 'text-text-3')}>
          {selected?.label ?? '—'}
        </span>
        <ChevronDown
          size={20}
          strokeWidth={2}
          aria-hidden
          className={cn(
            'shrink-0 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            open && 'rotate-180',
          )}
        />
      </Pressable>

      <AnimatePresence>
        {open ? (
          <>
            {asSheet ? (
              <motion.div
                aria-hidden
                className="fixed inset-0 z-[var(--z-sheet)] bg-black/50"
                initial={motionSafe ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={motionSafe ? { opacity: 0 } : undefined}
                onClick={() => setOpen(false)}
              />
            ) : null}

            <motion.ul
              id={listId}
              role="listbox"
              aria-label={label}
              className={cn(
                'z-[var(--z-sheet)] overflow-auto border border-[var(--surface-border)] bg-[var(--sheet-bg)]',
                asSheet
                  ? 'fixed inset-x-0 bottom-0 max-h-[60vh] rounded-t-[var(--radius-sheet)] p-2 pb-[calc(--spacing(2)+env(safe-area-inset-bottom))]'
                  : 'absolute inset-x-0 top-full mt-1 max-h-64 rounded-card p-1 shadow-[var(--shadow-overlay)]',
              )}
              initial={motionSafe ? (asSheet ? { y: '100%' } : { opacity: 0, scale: 0.96, y: -8 }) : false}
              animate={asSheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
              exit={motionSafe ? (asSheet ? { y: '100%' } : { opacity: 0, scale: 0.98 }) : undefined}
              transition={motionSafe ? (asSheet ? SPRING.soft : SPRING.tight) : { duration: 0 }}
            >
              {asSheet ? (
                <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-chip bg-surface-3" />
              ) : null}

              {variant === 'E' ? (
                <li className="mb-1 flex items-center gap-2 rounded-field bg-[var(--field-bg)] px-3">
                  <Search size={20} strokeWidth={2} aria-hidden className="shrink-0 text-text-3" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={label}
                    className="min-h-[var(--target-min)] w-full bg-transparent text-body text-text-1 outline-none placeholder:text-text-3"
                  />
                </li>
              ) : null}

              {visible.map((opt, i) => {
                const active = opt.value === value;
                return (
                  <motion.li
                    key={opt.value}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHover(opt.value)}
                    initial={
                      // A — options arrive in a short stagger, so a long list reads as one
                      // panel opening rather than a block appearing from nowhere.
                      motionSafe && variant === 'A' ? { opacity: 0, y: -4 } : false
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: motionSafe && variant === 'A' ? Math.min(i, 8) * 0.03 : 0 }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={cn(
                        'flex min-h-[var(--target-min)] w-full cursor-pointer items-center justify-between gap-2',
                        'rounded-field px-3 text-left text-body outline-none',
                        'transition-colors duration-[var(--duration-instant)]',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                        // C — a trailing highlight follows the cursor instead of each row
                        // lighting independently.
                        variant === 'C' && hover === opt.value && 'bg-accent-subtle',
                        variant !== 'C' && 'hover:bg-accent-subtle',
                        active ? 'text-accent' : 'text-text-1',
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {active ? (
                        <motion.span
                          className="inline-flex shrink-0"
                          // B — the check slides in rather than blinking on.
                          initial={motionSafe && variant === 'B' ? { x: 8, opacity: 0 } : false}
                          animate={{ x: 0, opacity: 1 }}
                          transition={SPRING.tight}
                        >
                          <Check size={20} strokeWidth={2.5} aria-hidden />
                        </motion.span>
                      ) : null}
                    </button>
                  </motion.li>
                );
              })}

              {visible.length === 0 ? (
                <li className="text-body-s px-3 py-3 text-text-3">—</li>
              ) : null}
            </motion.ul>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ══ E9 — Date picker ═══════════════════════════════════════════════════════════════════════ */

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function DatePicker({
  value,
  onChange,
  label,
}: {
  value: Date | null;
  onChange: (next: Date) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const variant = useElementVariant('E9');
  const motionSafe = useMotionSafe();
  const [month, setMonth] = useState(() => startOfDay(value ?? new Date()));
  const today = startOfDay(new Date());

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // Monday-first, which is what a Hungarian calendar looks like.
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month);

  const quick = [
    { key: 'today', date: today },
    { key: 'tomorrow', date: new Date(today.getTime() + DAY_MS) },
    { key: 'nextWeek', date: new Date(today.getTime() + 7 * DAY_MS) },
  ];

  return (
    <div className="w-full">
      <span className="text-body-s text-text-2">{label}</span>

      {/* D — the three dates people actually pick, one tap away, before any calendar grid. */}
      {variant === 'D' ? (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {quick.map((q) => (
            <Pressable
              key={q.key}
              shape="chip"
              density="compact"
              variant={value && startOfDay(value).getTime() === q.date.getTime() ? 'primary' : 'secondary'}
              onClick={() => {
                onChange(q.date);
                setMonth(q.date);
              }}
            >
              {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(q.date)}
            </Pressable>
          ))}
        </div>
      ) : null}

      {/* The canonical card, reading its padding from --card-pad rather than re-deciding it. */}
      <div className="mt-2 rounded-card border border-[var(--surface-border)] bg-surface-1 p-[var(--card-pad)]">
        <div className="flex items-center justify-between gap-2">
          <Pressable
            shape="icon"
            variant="ghost"
            aria-label={t('common.prevMonth')}
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronDown size={20} strokeWidth={2} aria-hidden className="rotate-90" />
          </Pressable>
          <span className="text-body-s capitalize text-text-1">{monthLabel}</span>
          <Pressable
            shape="icon"
            variant="ghost"
            aria-label={t('common.nextMonth')}
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronDown size={20} strokeWidth={2} aria-hidden className="-rotate-90" />
          </Pressable>
        </div>

        {/*
          The 44px floor applies to BOTH axes. Seven columns inside a narrow card squeeze each
          day to ~35px wide — tall enough, too thin to hit reliably. So the cells keep a minimum
          width and the calendar scrolls inside its own box instead: a control that overflows is
          recoverable, a control too small to tap is not. Static linting cannot see this, because
          the width comes out of the layout rather than out of a class.
        */}
        <div className="mt-2 overflow-x-auto">
          <div className="grid min-w-[max-content] grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = new Date(month.getFullYear(), month.getMonth(), i + 1);
            const isToday = date.getTime() === today.getTime();
            const isSelected = value ? startOfDay(value).getTime() === date.getTime() : false;
            return (
              <button
                key={date.toISOString()}
                type="button"
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => onChange(date)}
                className={cn(
                  'relative inline-flex size-[var(--target-min)] cursor-pointer items-center justify-center',
                  'rounded-chip text-body-s tabular-nums outline-none',
                  'transition-[background-color,transform] duration-[var(--duration-instant)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                  isSelected ? 'bg-accent text-accent-fg' : 'text-text-2 hover:bg-accent-subtle',
                  // A — the chosen day pops rather than merely changing colour.
                  isSelected && variant === 'A' && motionSafe && 'scale-105',
                )}
              >
                {i + 1}
                {/* C — today keeps a marker even when another day is selected, so the calendar
                    never loses its anchor. */}
                {isToday && variant === 'C' && !isSelected ? (
                  <span aria-hidden className="absolute bottom-1 size-1 rounded-chip bg-accent" />
                ) : null}
              </button>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Dumbbell, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { FeedbackField } from '../../ui/feedback/variants/E7Field';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useExercises, useTaxonomies, type ExerciseFilters, type Taxonomy } from './useExercises';
import { MuscleMap } from '../../ui/muscle-map/MuscleMap';

const DIFFICULTY_DOT: Record<string, string> = {
  beginner: 'bg-success',
  intermediate: 'bg-warning',
  advanced: 'bg-danger',
};

/** Debounce so typing does not fire a request per keystroke. */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function FilterRow({
  label,
  options,
  value,
  onChange,
  nameOf,
}: {
  label: string;
  options: Taxonomy[];
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  nameOf: (t: Taxonomy) => string;
}) {
  return (
    <div>
      <p className="text-micro uppercase text-text-3">{label}</p>
      {/*
        Horizontal chip row. `overflow-x-auto` on its own container, never on the page — the
        Bible is explicit that wide content scrolls inside itself and the body never scrolls
        sideways.
      */}
      <div className="-mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {options.map((opt) => {
          const active = value === opt.slug;
          return (
            <Pressable
              key={opt.slug}
              shape="chip"
              density="compact"
              variant={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              className="shrink-0"
              onClick={() => onChange(active ? undefined : opt.slug)}
            >
              {nameOf(opt)}
            </Pressable>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Exercise library — Bible blueprint 4.
 *
 * Search bar, horizontal filter chips, result rows with a 64px thumb, and infinite scroll at
 * 24 per page. The muscle-map entry card slots in above the results once the SVG asset lands.
 */
export function LibraryPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);

  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string>();
  const [equipment, setEquipment] = useState<string>();
  const debouncedSearch = useDebounced(search, 300);

  const filters: ExerciseFilters = useMemo(
    () => ({ q: debouncedSearch || undefined, muscle, equipment }),
    [debouncedSearch, muscle, equipment],
  );

  const taxonomies = useTaxonomies(lang);
  const query = useExercises(filters, lang);
  const rows = query.data?.pages.flatMap((p) => p.exercises) ?? [];

  const nameOf = (tax: Taxonomy) => tax.name;
  const activeFilters = [muscle, equipment].filter(Boolean).length;

  // Infinite scroll via a sentinel rather than a scroll listener: the observer fires only when
  // the element is actually near the viewport, and costs nothing while it is not.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  return (
    <div className="col-mobile screen-x py-6">
      <h1 className="text-title-1 text-text-1">{t('nav.library')}</h1>

      <div className="mt-8">
        <FeedbackField
          label={t('library.search')}
          placeholder={t('library.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
          inputMode="search"
          trailing={
            search ? (
              <Pressable
                shape="icon"
                variant="ghost"
                aria-label={t('common.cancel')}
                onClick={() => setSearch('')}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </Pressable>
            ) : (
              <span className="inline-flex size-[var(--target-min)] items-center justify-center text-text-3">
                <Search size={20} strokeWidth={2} aria-hidden />
              </span>
            )
          }
        />
      </div>

      {/*
        The reversible direction of the map (owner requirement 21): the detail screen reads it
        to show what an exercise targets; here the same component is a filter control.
      */}
      <details className="mt-4 rounded-card border border-[var(--surface-border)] bg-surface-1">
        <summary className="text-body-s flex min-h-[var(--target-min)] cursor-pointer list-none items-center px-4 text-text-2 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:text-text-1">
          {t('muscleMap.filterHint')}
        </summary>
        <div className="px-4 pb-4">
          <MuscleMap
            selected={muscle}
            onSelect={(slug) => setMuscle((cur) => (cur === slug ? undefined : slug))}
          />
        </div>
      </details>

      {taxonomies.data ? (
        <div className="mt-4 flex flex-col gap-4">
          <FilterRow
            label={t('library.muscle')}
            options={taxonomies.data.muscles}
            value={muscle}
            onChange={setMuscle}
            nameOf={nameOf}
          />
          <FilterRow
            label={t('library.equipment')}
            options={taxonomies.data.equipment}
            value={equipment}
            onChange={setEquipment}
            nameOf={nameOf}
          />
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between gap-2">
        <p className="text-body-s text-text-2">
          {query.isPending ? t('common.loading') : t('library.count', { count: rows.length })}
        </p>
        {activeFilters > 0 ? (
          <Pressable
            density="compact"
            variant="ghost"
            onClick={() => {
              setMuscle(undefined);
              setEquipment(undefined);
            }}
          >
            {t('library.clearFilters')}
          </Pressable>
        ) : null}
      </div>

      {query.isPending ? (
        // Skeleton rows match the real row geometry, so the swap does not shift the layout.
        <ul className="mt-2 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex h-[72px] items-center gap-3 rounded-card border border-[var(--surface-border)] bg-surface-1 px-3 py-1">
              <Skeleton className="size-16 shrink-0 rounded-field" />
              <div className="flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={t('library.emptyTitle')}
          body={t('library.emptyBody')}
          action={
            search || activeFilters ? (
              <Pressable
                variant="primary"
                onClick={() => {
                  setSearch('');
                  setMuscle(undefined);
                  setEquipment(undefined);
                }}
              >
                {t('library.clearFilters')}
              </Pressable>
            ) : undefined
          }
        />
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/library/${row.id}`}
                className={cn(
                  // 72px exactly: the Bible caps list rows at 72 and specifies a 64px thumb for
                  // this screen, which leaves 4px of vertical padding. Anything more and the row
                  // grows past the cap; the horizontal padding stays at 12px.
                  'flex h-[72px] items-center gap-3 rounded-card border border-[var(--surface-border)]',
                  'bg-surface-1 px-3 py-1 transition-colors duration-[var(--duration-fast)]',
                  'ease-[var(--ease-standard)] hover:bg-surface-2',
                  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                  'focus-visible:outline-[var(--focus-ring)]',
                )}
              >
                {/* The box is reserved whether or not an image exists, so an arriving thumb
                    cannot shift the row it sits in. */}
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-field bg-surface-2">
                  {row.thumb_key ? (
                    <img
                      src={`/api/v1/media/${row.thumb_key}`}
                      alt=""
                      width={64}
                      height={64}
                      loading="lazy"
                      className="size-16 object-cover"
                    />
                  ) : (
                    <Dumbbell size={24} strokeWidth={1.5} aria-hidden className="text-text-3" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-body block truncate text-text-1">{row.name}</span>
                  <span className="text-caption mt-0.5 flex items-center gap-2 text-text-3">
                    {row.difficulty ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn('inline-block size-1.5 rounded-chip', DIFFICULTY_DOT[row.difficulty])}
                        />
                        {t(`library.difficulty.${row.difficulty}`)}
                      </span>
                    ) : null}
                    {row.exercise_type ? <span>{t(`library.type.${row.exercise_type}`)}</span> : null}
                    {/* Honest about fallback content rather than passing English off as
                        translated — the API tells us, so the UI can too. */}
                    {row.translated === 0 && lang !== 'en' ? (
                      <span className="text-micro uppercase rounded-chip bg-surface-2 px-1.5">en</span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinel} aria-hidden className="h-4" />
      {query.isFetchingNextPage ? (
        <ul className="mt-2 flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex h-[72px] items-center gap-3 rounded-card border border-[var(--surface-border)] bg-surface-1 px-3 py-1">
              <Skeleton className="size-16 shrink-0 rounded-field" />
              <div className="flex-1">
                <Skeleton className="h-4 w-2/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Check, ChevronDown, Dumbbell, Funnel, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { FeedbackField } from '../../ui/feedback/variants/E7Field';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useExercises, useTaxonomies, type ExerciseFilters, type Taxonomy } from './useExercises';
import { MuscleMap } from '../../ui/muscle-map/MuscleMap';
import { SectionBadge } from './SectionBadge';

const DIFFICULTY_DOT: Record<string, string> = {
  beginner: 'bg-success',
  intermediate: 'bg-warning',
  advanced: 'bg-danger',
};

/**
 * ONE row geometry, named once.
 *
 * The skeleton and the real row have to agree exactly or the swap shifts the list — which is the
 * only thing a skeleton is for. They disagreed by nothing before because both were hand-written;
 * the thumbnail is landscape now (80x56 rather than a 64px square), so the two strings would have
 * had to be edited in lockstep. This is that lockstep.
 */
const ROW = 'flex h-[88px] items-center gap-3 px-3';
const THUMB = 'h-14 w-20 shrink-0 rounded-field';

/** Debounce so typing does not fire a request per keystroke. */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function RowSkeleton({ meta = true }: { meta?: boolean }) {
  return (
    <Surface as="li" pad="none" className={ROW}>
      <Skeleton className={THUMB} />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-2/3" />
        {meta ? <Skeleton className="mt-2 h-3 w-1/3" /> : null}
      </div>
    </Surface>
  );
}

/**
 * Exercise library — [[55-Screens/library]].
 *
 * Three ways in: type the name, tap a muscle on the body, tap a muscle-group chip. What the
 * redesign changed is what is NOT here any more — the second chip strip, the `Keresés` label
 * above a field that already carries a magnifier, and the label-shaped result rows.
 */
export function LibraryPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);

  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string>();
  const debouncedSearch = useDebounced(search, 300);

  /*
   * ═══ WHY THERE IS NO `equipment` HERE ANY MORE ═════════════════════════════════════════════
   *
   * Two identical horizontal chip strips stacked, told apart only by an 11px label, is the
   * data-field problem in miniature — and cutting one is what buys this screen its air. So the
   * `ESZKÖZ` strip is gone and the screen sends no equipment filter at all.
   *
   * `ExerciseFilters.equipment` stays in `useExercises`, alongside `difficulty`, `type` and
   * `mine`, which no screen has ever exposed either: that interface is the API's surface, not
   * this screen's control set. It is NOT wired to a control that half-works — the ambiguity the
   * spec refuses is a filter that exists in the UI and does nothing, and there is now none.
   * The open question (a filter sheet behind the funnel badge) is recorded in the screen note.
   */
  const filters: ExerciseFilters = useMemo(
    () => ({ q: debouncedSearch || undefined, muscle }),
    [debouncedSearch, muscle],
  );

  const taxonomies = useTaxonomies(lang);
  const query = useExercises(filters, lang);
  const rows = query.data?.pages.flatMap((p) => p.exercises) ?? [];

  const nameOf = (tax: Taxonomy) => tax.name;

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
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      <h1 className="text-display text-text-1">{t('nav.library')}</h1>

      {/* ── finding something ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-group">
        <FeedbackField
          /*
           * The visible `Keresés` label is hidden, not deleted. The placeholder is a full
           * sentence about what to type, the field carries a magnifier, and the screen's `h1`
           * three lines up says `Gyakorlatok` — a fourth statement of the same word was the
           * densest thing in the old top third. `sr-only` keeps the input NAMED for anyone who
           * hears the page instead of seeing it, which is the half that actually mattered.
           */
          className="[&>label]:sr-only"
          label={t('library.search')}
          placeholder={t('library.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
          inputMode="search"
          leading={<Search className="size-icon-m" strokeWidth={2} />}
          trailing={
            search ? (
              <Pressable
                shape="icon"
                variant="ghost"
                aria-label={t('common.cancel')}
                onClick={() => setSearch('')}
              >
                <X className="size-icon-m" strokeWidth={2} aria-hidden />
              </Pressable>
            ) : undefined
          }
        />

        {/*
          ═══ THE MAP STAYS INSIDE ITS DISCLOSURE ══════════════════════════════════════════════
          The reversible direction of the map (owner requirement 21): the detail screen READS it
          to show what an exercise targets, here the same component WRITES a filter.

          It is collapsed by default because `MuscleMap`'s own contract says so — its regions are
          9–33px wide and cannot be enlarged without wrecking the anatomy, so it is a SECONDARY
          affordance whose licence to exist below the 44px floor is that the chip row underneath
          does the identical filtering at full size. Opening it by default does not break that
          rule, but it does put the sub-floor control first in the reading order, so the honest
          arrangement is: full-size search, then the map behind one tap, then the chips.
        */}
        <Surface as="details" pad="none" className="group">
          <summary
            className={cn(
              'text-body-s flex min-h-[var(--target-min)] cursor-pointer list-none items-center',
              'justify-between gap-tight px-4 text-text-2',
              'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
              'hover:text-text-1',
            )}
          >
            {t('muscleMap.filterHint')}
            <ChevronDown
              aria-hidden
              className={cn(
                'size-icon-m shrink-0 transition-transform',
                'duration-[var(--duration-fast)] ease-[var(--ease-standard)] group-open:rotate-180',
              )}
            />
          </summary>
          <div className="px-4 pb-4">
            <MuscleMap
              selected={muscle}
              onSelect={(slug) => setMuscle((cur) => (cur === slug ? undefined : slug))}
            />
          </div>
        </Surface>

        {/* ── the muscle-group strip: the same filter, at 44px ─────────────────────────────── */}
        <div className="flex flex-col gap-tight">
          <SectionBadge icon={Funnel}>
            <h2 className="text-micro uppercase text-text-2">{t('library.muscle')}</h2>
          </SectionBadge>

          {/*
            Horizontal chip row. `overflow-x-auto` on its own container, never on the page — wide
            content scrolls inside itself and the body never scrolls sideways. It bleeds to both
            screen edges so the chips fading off the right advertise that there are more.
          */}
          <div className="-mx-4 flex gap-tight overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {taxonomies.data
              ? taxonomies.data.muscles.map((opt) => {
                  const active = muscle === opt.slug;
                  return (
                    <Pressable
                      key={opt.slug}
                      shape="chip"
                      density="compact"
                      variant={active ? 'primary' : 'secondary'}
                      aria-pressed={active}
                      className="shrink-0"
                      icon={
                        active ? <Check className="size-icon-s" strokeWidth={2.5} aria-hidden /> : undefined
                      }
                      onClick={() => setMuscle(active ? undefined : opt.slug)}
                    >
                      {nameOf(opt)}
                    </Pressable>
                  );
                })
              : // Placeholders at chip height, so the strip does not appear from nothing and
                // push the whole result list down once the taxonomy request lands.
                Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-[var(--control-h)] w-28 shrink-0 rounded-chip" />
                ))}
          </div>
        </div>
      </div>

      {/* ── what was found ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-group">
        <div className="flex min-h-[var(--target-min)] items-center justify-between gap-tight">
          <p className="text-body-s text-text-2">
            {query.isPending ? t('common.loading') : t('library.count', { count: rows.length })}
          </p>
          {/* Clears the MUSCLE filter and leaves the search text alone — the two are different
              questions, and one button that wiped both would make the strip unusable for anyone
              who typed first. */}
          {muscle ? (
            <Pressable
              shape="chip"
              density="compact"
              variant="primary"
              onClick={() => setMuscle(undefined)}
            >
              {t('library.clearFilters')}
            </Pressable>
          ) : null}
        </div>

        {query.isPending ? (
          <ul className="flex flex-col gap-tight">
            {Array.from({ length: 6 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={t('library.emptyTitle')}
            body={t('library.emptyBody')}
            action={
              // Only when something is actually filtering. A genuinely empty catalogue must not
              // be offered a button that would change nothing.
              search || muscle ? (
                <Pressable
                  variant="primary"
                  onClick={() => {
                    setSearch('');
                    setMuscle(undefined);
                  }}
                >
                  {t('library.clearFilters')}
                </Pressable>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-tight">
            {rows.map((row) => (
              <li key={row.id}>
                {/* The card IS the link: one tap target for the whole row, and `interactive`
                    carries the hover and the focus ring that a `div` wrapping an `a` would have
                    had to re-declare. */}
                <Surface as={Link} to={`/library/${row.id}`} pad="none" interactive className={ROW}>
                  {/* The box is reserved whether or not an image exists, so an arriving thumb
                      cannot shift the row it sits in. Landscape, because a movement photograph
                      is landscape and a square crop cut the barbell off at both ends. */}
                  <span
                    className={cn(
                      THUMB,
                      'grid place-items-center overflow-hidden bg-surface-2',
                    )}
                  >
                    {row.thumb_key ? (
                      <img
                        src={`/api/v1/media/${row.thumb_key}`}
                        alt=""
                        width={80}
                        height={56}
                        loading="lazy"
                        className="h-14 w-20 object-cover"
                      />
                    ) : (
                      <Dumbbell className="size-icon-l text-text-3" strokeWidth={1.5} aria-hidden />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="text-body-strong block truncate text-text-1">{row.name}</span>
                    <span className="text-caption mt-1 flex items-center gap-tight text-text-3">
                      {row.difficulty ? (
                        <span className="inline-flex items-center gap-tight">
                          <span
                            aria-hidden
                            className={cn(
                              'inline-block size-1.5 rounded-chip',
                              DIFFICULTY_DOT[row.difficulty],
                            )}
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
                </Surface>
              </li>
            ))}
          </ul>
        )}

        <div ref={sentinel} aria-hidden className="h-1" />

        {query.isFetchingNextPage ? (
          // The tail: identical geometry again, so the list above never moves while a page loads.
          <ul className="flex flex-col gap-tight">
            {Array.from({ length: 3 }, (_, i) => (
              <RowSkeleton key={i} meta={false} />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

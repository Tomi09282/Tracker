import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { SearchField } from '../../ui/primitives/SearchField';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { Segmented, type SegmentedOption } from '../../ui/feedback/variants/E6Segmented';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { Rule } from '../../ui/data/Rule';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { UserPhoto } from '../../ui/media/UserPhoto';
import { useExercises, useTaxonomies, type ExerciseFilters, type Taxonomy } from './useExercises';
import { MuscleMap } from '../../ui/muscle-map/MuscleMap';
import { musclesOnSide, type MuscleSide } from '../../ui/muscle-map/figure';

/** Debounce so typing does not fire a request per keystroke. */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Widths of the chip-strip placeholders: four words of different length, 24 apart. */
const CHIP_SKELETON = ['w-10', 'w-28', 'w-32', 'w-16'] as const;

/**
 * Exercise library — the muscle selector of the Edzés tab (owner decision D2), frames
 * `library-1` (nothing chosen), `library-2` (front, "Mell") and `library-3` (back, "Széles hátizom").
 *
 * Three ways in, as before: tap a muscle on the figure, tap a muscle word in the strip, or type a
 * name behind the header glyph. The composition is the frame's (`figma-build/app/library-1.body.js`):
 *
 *   header (root, y 72)                       the title and ONE trailing glyph: search
 *   stage (y 152, 364 high, no surface)       the figure on the right, head on the stage top - 24,
 *                                             right hand on the gutter, the box bleeding to the
 *                                             screen edge; on the left the eyebrow, then the hint OR
 *                                             the chosen muscle as the screen's subject line with
 *                                             "Szűrők törlése"; the Elöl / Hátul switch at the bottom
 *   16, strong rule, 4, the chip strip, 4     the same filter as the figure, scoped to the side shown
 *   the rows                                  the 48 pt still column, text at x 88; the cell stays
 *                                             empty without an upload (the list API carries no
 *                                             equipment key, so no still is guessed)
 *
 * No pill on this screen: lime is the lit muscle, the chosen chip's mark and the lit tab.
 */
export function LibraryPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);

  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string>();
  const debouncedSearch = useDebounced(search, 300);

  /*
   * No `equipment` filter: the strip was cut in August and the screen sends none.
   * `ExerciseFilters.equipment` stays in `useExercises` (with `difficulty`, `type`, `mine`): that
   * interface is the API's surface, not this screen's control set.
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

  /* ── Pulse page state (view only; nothing here reaches the URL, R20) ─────────────────────── */

  // Every screen that shows the figure opens on the front.
  const [side, setSide] = useState<MuscleSide>('front');
  // The search line is behind the header glyph (the frames draw only the glyph). A typed term
  // keeps it open, so a filter that is narrowing the list can never be hidden.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchShown = searchOpen || search !== '';

  const toggleMuscle = (slug: string) => setMuscle((cur) => (cur === slug ? undefined : slug));
  const clearAll = () => {
    setSearch('');
    setMuscle(undefined);
  };

  const sides: SegmentedOption<MuscleSide>[] = [
    { value: 'front', label: t('muscleMap.front') },
    { value: 'back', label: t('muscleMap.back') },
  ];

  // The strip is scoped to the side shown, as the frames draw it: front 13 words, back 11.
  // `full-body` has no region on either side and stays on both.
  const onSide = musclesOnSide(side);
  const chips = taxonomies.data?.muscles.filter((m) => onSide.includes(m.slug) || m.slug === 'full-body');

  // The subject line: the taxonomy's name, or the map's own label while the taxonomy is still on
  // its way (a tap on the figure can land before it answers).
  const chosen = muscle ? taxonomies.data?.muscles.find((m) => m.slug === muscle) : undefined;
  const subject = muscle ? (chosen ? nameOf(chosen) : t(`muscle.${muscle}`, { defaultValue: muscle })) : null;

  return (
    <Screen top="root">
      <ScreenHeader
        kind="root"
        title={t('nav.library')}
        // Closed: the frames' search glyph. Open and empty: the same place closes the line (one
        // glass on screen, the field's own). A typed term keeps the line open, so the header
        // control would do nothing - it steps aside and the field's clear control is the way out.
        trailing={
          !searchShown ? (
            <Pressable
              variant="link"
              shape="icon"
              aria-label={t('library.search')}
              aria-expanded={false}
              onClick={() => setSearchOpen(true)}
            >
              <Search />
            </Pressable>
          ) : search === '' ? (
            <Pressable
              variant="link"
              shape="icon"
              aria-label={t('common.close')}
              aria-expanded
              onClick={() => setSearchOpen(false)}
            >
              <X />
            </Pressable>
          ) : undefined
        }
      >
        {searchShown ? (
          <SearchField
            // Opened by the glyph: the caret goes where the user is about to type.
            autoFocus={searchOpen}
            label={t('library.search')}
            placeholder={t('library.searchPlaceholder')}
            clearLabel={t('library.clearSearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        ) : null}
      </ScreenHeader>

      <div className="flex flex-col gap-4">
        {/* ── the stage: the figure and the selection, no surface ──────────────────────────── */}
        {/* 364 high as drawn; on a short phone (under 784 pt) it gives way down to 260 so the
            muscle words and the first row stay on the first screen, and the figure scales with it. */}
        <div className="relative flex h-[clamp(260px,calc(100dvh-420px),364px)] flex-col justify-between">
          {/* FIRST in the DOM: the figure's regions are the first buttons named after a muscle,
              before the chips (the capture scripts click "Mell" / "Széles hátizom" nth 0). Its
              regions are smaller than 44 pt; the chip strip below is the full-size path to the
              same filter (the documented exception, MuscleMap.tsx). */}
          <MuscleMap
            sideControl="none"
            side={side}
            selected={muscle}
            onSelect={toggleMuscle}
            className="absolute right-[-24px] top-[-24px] w-[calc(clamp(260px,calc(100dvh-420px),364px)*195/364)]"
          />

          <div className="flex max-w-[calc(100%-138px)] flex-col gap-4 self-start">
            <SectionHeader rule={false} title={t('library.muscle')} />
            {subject ? (
              <div className="flex flex-col items-start">
                <p className="text-display-xl text-text-1">{subject}</p>
                {/* Clears the MUSCLE only; a typed term stays (the empty state clears both). */}
                <TextLink text="body" lead={<X />} onClick={() => setMuscle(undefined)}>
                  {t('library.clearFilters')}
                </TextLink>
              </div>
            ) : (
              <p className="max-w-[156px] text-body text-text-2">{t('muscleMap.filterHint')}</p>
            )}
          </div>

          <Segmented
            label={t('muscleMap.viewLabel')}
            options={sides}
            value={side}
            onChange={setSide}
            className="self-start"
          />
        </div>

        {/* ── the filter and what it found, under one rule ─────────────────────────────────── */}
        <div className="flex flex-col gap-1">
          <Rule strong />

          {chips ? (
            <ChipRow label={t('library.muscle')} scroll="bleed">
              {chips.map((opt) => (
                <Chip key={opt.slug} selected={muscle === opt.slug} onClick={() => toggleMuscle(opt.slug)}>
                  {nameOf(opt)}
                </Chip>
              ))}
            </ChipRow>
          ) : (
            // Word-sized blocks where the strip will be, so the rows do not jump when it lands.
            <div aria-hidden className="flex h-11 items-center gap-6">
              {CHIP_SKELETON.map((w) => (
                <Skeleton key={w} className={`h-4 shrink-0 ${w}`} />
              ))}
            </div>
          )}

          {/* The count is not drawn in any frame; it stays for assistive tech (it counts the rows
              loaded so far, never a total). */}
          <p className="sr-only" role="status">
            {query.isPending ? t('common.loading') : t('library.count', { count: rows.length })}
          </p>

          {query.isPending ? (
            <RowStack as="div">
              {Array.from({ length: 6 }, (_, i) => (
                <ListRowSkeleton key={i} sub leadSlot index={i} />
              ))}
            </RowStack>
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('library.emptyTitle')}
              body={t('library.emptyBody')}
              action={
                // Only when something is actually filtering: an empty catalogue is not offered a
                // control that would change nothing.
                search || muscle ? (
                  <TextLink text="body" onClick={clearAll}>
                    {t('library.clearFilters')}
                  </TextLink>
                ) : undefined
              }
            />
          ) : (
            <RowStack>
              {rows.map((row) => {
                const sub = [
                  row.difficulty ? t(`library.difficulty.${row.difficulty}`) : null,
                  row.exercise_type ? t(`library.type.${row.exercise_type}`) : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <ListRow
                    key={row.id}
                    to={`/library/${row.id}`}
                    title={row.name}
                    sub={sub || undefined}
                    chevron
                    // The frames' 48 pt still column (x 24, text at x 88, rows 68): a real upload
                    // when the exercise has one; otherwise the cell stays EMPTY, as the frame's
                    // "Rope Jumping · no still" row draws it. The list answer carries no equipment
                    // key (R-S-library-02), so no equipment still is guessed and no square is drawn.
                    lead={
                      row.thumb_key ? (
                        <UserPhoto src={`/api/v1/media/${row.thumb_key}`} alt="" ratio={1} desaturate className="w-12" />
                      ) : (
                        <span aria-hidden className="block size-12" />
                      )
                    }
                    // Honest about fallback content rather than passing English off as translated.
                    trailing={
                      row.translated === 0 && lang !== 'en' ? <span className="text-micro text-text-2">en</span> : undefined
                    }
                  />
                );
              })}
            </RowStack>
          )}

          <div ref={sentinel} aria-hidden className="h-px" />

          {query.isFetchingNextPage ? (
            // The tail: the same rows again, so the list above never moves while a page loads.
            <RowStack as="div">
              {Array.from({ length: 3 }, (_, i) => (
                <ListRowSkeleton key={i} sub leadSlot index={i} />
              ))}
            </RowStack>
          ) : null}
        </div>
      </div>
    </Screen>
  );
}

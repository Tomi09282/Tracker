import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '../../ui/primitives/Field';
import { TextLink } from '../../ui/primitives/TextLink';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { MuscleMap } from '../../ui/muscle-map/MuscleMap';
import { musclesOnSide, type MuscleSide } from '../../ui/muscle-map/figure';
import { useExercises, type ExerciseRow } from '../library/useExercises';

/** Debounce so typing does not fire a request per keystroke (the same 300 ms as the library's search). */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

type RowMuscles = ExerciseRow['muscles'];

/**
 * Which side of the figure shows an exercise: the BACK when more of its primary muscles are drawn
 * only there (lats, hamstrings, glutes, triceps ...), the front otherwise - a tie, an exercise
 * whose primaries are on both sides (calves, forearms) and one with no primary on the figure at all
 * (full body) all stay on the front, which is where every screen that shows the figure opens.
 *
 * "Which side a muscle is on" is the FIGURE's own table (`musclesOnSide`), not the database's
 * `body_side`: the figure is what is drawn, and the two disagree for a few muscles.
 */
export function figureSideOf(muscles: RowMuscles): MuscleSide {
  const front = musclesOnSide('front');
  const back = musclesOnSide('back');
  const primary = muscles.filter((m) => m.role === 'primary');
  // An exercise with only secondary muscles is still judged on those, so the figure is not blank.
  const judged = primary.length > 0 ? primary : muscles;
  const onlyBack = judged.filter((m) => back.includes(m.slug) && !front.includes(m.slug)).length;
  const onlyFront = judged.filter((m) => front.includes(m.slug) && !back.includes(m.slug)).length;
  return onlyBack > onlyFront ? 'back' : 'front';
}

/** slug -> role for the figure; a muscle listed twice keeps its strongest role. */
function highlightsOf(muscles: RowMuscles): Record<string, 'primary' | 'secondary'> {
  const out: Record<string, 'primary' | 'secondary'> = {};
  for (const m of muscles) if (out[m.slug] !== 'primary') out[m.slug] = m.role;
  return out;
}

/** The figure's size in a result: 72 pt tall, 34 wide (the figure's own 597 : 1261 box). */
const FIGURE_SIZE = 'h-[72px] aspect-[597/1261]';

/**
 * The lead of a result: the read-only mannequin, 72 pt tall, on the side that shows the exercise.
 *
 * It is decoration for the eye - the muscle names beside it are the information - so it is hidden
 * from assistive technology (the map's own "muscle map, front view" would only be read out as noise
 * in front of every result).
 *
 * PERFORMANCE, MEASURED (dev build, desktop Chrome, 12 results): one figure costs about 4.5 ms of
 * main thread (a render of the raster, the panel paths, two filters and a second pass for its
 * measured width), so a page of twelve was a 55-65 ms long task on every settled search - on a
 * phone, several times that. The scroll box shows about four and a half, so the figure is MOUNTED
 * only when its row is within 120 px of the box's visible part: the row keeps its 34 x 72 slot
 * (nothing moves when the figure arrives) and the first paint is the names. Once mounted it stays,
 * so scrolling back never redraws it.
 */
function RowFigure({ muscles, scroller }: { muscles: RowMuscles; scroller: HTMLElement | null }) {
  const slot = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(typeof IntersectionObserver !== 'function');
  useEffect(() => {
    const el = slot.current;
    if (near || !el || !scroller) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { root: scroller, rootMargin: '120px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, scroller]);
  return (
    <span ref={slot} aria-hidden className={`flex shrink-0 ${FIGURE_SIZE}`}>
      {near ? <RowMap muscles={muscles} /> : null}
    </span>
  );
}

/** The figure itself, memoised on the row's `muscles` array: typing re-renders the picker on every keystroke. */
const RowMap = memo(function RowMap({ muscles }: { muscles: RowMuscles }) {
  const side = useMemo(() => figureSideOf(muscles), [muscles]);
  const highlights = useMemo(() => highlightsOf(muscles), [muscles]);
  return <MuscleMap sideControl="none" side={side} highlights={highlights} className="h-[72px]" />;
});

export interface ExercisePickerProps {
  /** A client plan knows whose it is, so each result is flagged against that client's questionnaire. */
  forClient?: number;
  /** Offline: results stay readable, none can be picked (the add is a write). */
  offline: boolean;
  /** Add the exercise; the picker closes when this resolves. */
  onPick: (exerciseId: number) => Promise<void>;
  onCancel: () => void;
}

/**
 * The exercise picker of the plan editor - the search field, up to twelve results each led by the
 * muscle map of what it works, and "Mégse". It replaces "+ Gyakorlat" in place (it is not a sheet).
 *
 * THE OWNER OVERRODE THE SPEC HERE (2026-11-03, DEV-093): the plan-editor note listed "muscle tags /
 * a muscle map in picker results" under what must not be drawn; the coach wants to see what an
 * exercise works while choosing it, so every result carries the figure and a one-line muscle label.
 *
 * Language and debounce are the library's: the result names follow `i18n.language` (this used to
 * be a hard-coded `'hu'`) and a query goes out 300 ms after the last keystroke.
 */
export function ExercisePicker({ forClient, offline, onPick, onCancel }: ExercisePickerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 300);
  const [picking, setPicking] = useState<number | null>(null);
  // The scroll box, as state: the figures observe against it, and it only exists once there are rows.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  const query = useExercises({ q: debounced || undefined, forClient }, lang);

  // The previous answer stays on screen while the next one is on its way (the query key changes
  // with every settled search term, and a changed key has no data): otherwise the list would blink
  // to skeletons on every keystroke pause. `settled` is the last page that was really answered.
  const [settled, setSettled] = useState<ExerciseRow[] | null>(null);
  const answered = query.data?.pages?.[0]?.exercises;
  useEffect(() => {
    if (answered) setSettled(answered);
  }, [answered]);
  const rows = (answered ?? settled ?? []).slice(0, 12);
  const failed = query.isError && !answered;
  const refreshing = !answered && settled !== null && !failed;
  // First load only: nothing answered yet, nothing to show.
  const loading = !answered && settled === null && !failed;

  /* A row's muscle line: the primary names in the row's own text colour, the secondary ones dimmer
     behind a dot. The words "primary" / "secondary" are for assistive tech only. */
  const labelOf = (muscles: RowMuscles): ReactNode => {
    if (muscles.length === 0) return <span className="text-text-3">{t('plans.pickerNoMuscles')}</span>;
    const name = (slug: string) => t(`muscle.${slug}`, { defaultValue: slug });
    const primary = muscles.filter((m) => m.role === 'primary').map((m) => name(m.slug));
    const secondary = muscles.filter((m) => m.role === 'secondary').map((m) => name(m.slug));
    return (
      <>
        {primary.length > 0 ? (
          <>
            <span className="sr-only">{t('muscleMap.primary')}: </span>
            {primary.join(', ')}
          </>
        ) : null}
        {secondary.length > 0 ? (
          <span className="text-text-3">
            {primary.length > 0 ? ' · ' : ''}
            <span className="sr-only">{t('muscleMap.secondary')}: </span>
            {secondary.join(', ')}
          </span>
        ) : null}
      </>
    );
  };

  const pick = async (id: number) => {
    if (picking !== null) return;
    setPicking(id);
    try {
      await onPick(id);
    } catch {
      // The mutation reports its own failure; the picker stays open for another try.
      setPicking(null);
    }
  };

  return (
    <div className="mt-2 flex flex-col">
      <Field label={t('plans.findExercise')} value={search} autoFocus onChange={(e) => setSearch(e.target.value)} />

      {/* The count is for assistive tech (it counts what is shown, never a total). */}
      <p className="sr-only" role="status">
        {loading ? t('common.loading') : t('library.count', { count: rows.length })}
      </p>

      {failed ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink text="cap" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('plans.pickerError')}
        </NoticeLine>
      ) : loading ? (
        <RowStack as="div">
          {[0, 1, 2].map((i) => (
            <ListRowSkeleton key={i} sub index={i} />
          ))}
        </RowStack>
      ) : rows.length === 0 ? (
        <NoticeLine tone="info" detail={t('plans.pickerEmptyHint')}>
          {t('plans.pickerEmpty')}
        </NoticeLine>
      ) : (
        /* About four and a half rows (a result is 92 + its hairline): the half row cut at the bottom
           is what says the list scrolls. The closing rule is the scroller's own, so it stays under
           the list instead of scrolling away with the last row. */
        <div
          ref={setScroller}
          aria-busy={refreshing || undefined}
          className={`max-h-[27rem] overflow-y-auto border-b border-hair-strong transition-opacity duration-[var(--duration-instant)] ${refreshing ? 'opacity-60' : ''}`}
        >
          <RowStack>
            {rows.map((r) => {
              /* FLAGS, NOT A FILTER. The coach may know the client's knee is fine this week, or that the
                 gym has kit the questionnaire predates. An option that vanishes teaches them nothing;
                 one that carries a reason lets them decide. */
              const avoid = r.conflicts?.some((c) => c.severity === 'avoid' && c.relation === 'loads');
              const flags =
                r.missing_equipment?.length || r.conflicts?.length ? (
                  <span className="flex items-baseline gap-3">
                    {r.missing_equipment?.length ? (
                      <span className="text-data text-text-2">{t('plans.missingKit', { count: r.missing_equipment.length })}</span>
                    ) : null}
                    {r.conflicts?.length ? (
                      <span
                        className={avoid ? 'text-micro text-danger' : 'text-micro text-warning'}
                        title={r.conflicts.map((c) => t(`onboarding.area.${c.body_area}`)).join(', ')}
                      >
                        {t(`onboarding.area.${r.conflicts[0].body_area}`)}
                      </span>
                    ) : null}
                  </span>
                ) : undefined;
              return (
                <ListRow
                  key={r.id}
                  title={r.name}
                  sub={labelOf(r.muscles)}
                  lead={<RowFigure muscles={r.muscles} scroller={scroller} />}
                  trailing={flags}
                  disabled={offline || (picking !== null && picking !== r.id)}
                  busy={picking === r.id}
                  onClick={() => void pick(r.id)}
                />
              );
            })}
          </RowStack>
        </div>
      )}

      <div className="flex h-11 items-center">
        <TextLink text="body" onClick={onCancel}>
          {t('common.cancel')}
        </TextLink>
      </div>
    </div>
  );
}

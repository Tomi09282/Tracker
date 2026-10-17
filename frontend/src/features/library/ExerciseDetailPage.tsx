import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Play } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Segmented, type SegmentedOption } from '../../ui/feedback/variants/E6Segmented';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section, SectionHeader } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { Numeral } from '../../ui/data/Numeral';
import { RoleKey } from '../../ui/data/RoleKey';
import { Pic } from '../../ui/media/Pic';
import { UserPhoto } from '../../ui/media/UserPhoto';
import { equipmentStill } from '../../assets/pulse';
import { useExercise, type Taxonomy } from './useExercises';
import { MuscleMap, type MuscleRole } from '../../ui/muscle-map/MuscleMap';
import { musclesOnSide, type MuscleSide } from '../../ui/muscle-map/figure';

/**
 * Exercise detail — exercise-detail-1 / -2 (Pulse, Open Field).
 *
 * Read-only: no lime pill anywhere. The one picture of the exercise is the mannequin, floating on
 * the right of the stage with its right hand on the content edge; the left column is its key —
 * the muscle names keyed by the two lime levels, the note about the other side and, on the line
 * of the feet, what the movement needs. Then the steps as numbered rows and the substitutes as a
 * strip of text columns that runs off the right edge.
 */
export function ExerciseDetailPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const params = useParams();
  const id = Number.parseInt(params.id ?? '', 10);
  const { data, isPending } = useExercise(Number.isFinite(id) ? id : null, lang);

  /*
   * The hero player has two states and the FIRST one is ours: one bare play glyph centred on the
   * poster. From the first activation the native player owns the frame, and this is deliberately
   * one-way: an overlay that returned on pause would cover the native pause button.
   *
   * Declared above the early returns because hooks cannot be conditional.
   */
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  // The view of the figure: local, the front on every mount, never in the URL (R20).
  const [side, setSide] = useState<MuscleSide>('front');

  if (isPending) {
    // The page's own geometry: the real back row, the display line and the meta line, the
    // stage's three key lines, then one ruled section. No figure: images are withheld, never
    // drawn as grey squares.
    return (
      <Screen top="push" role="status" aria-busy>
        <span className="sr-only">{t('common.loading')}</span>
        <ScreenHeader kind="push">
          <div className="flex flex-col gap-2" aria-hidden>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </ScreenHeader>
        <div className="flex flex-col gap-3.5" aria-hidden>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex flex-col gap-4" aria-hidden>
          <Rule strong />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Screen>
    );
  }

  if (!data) {
    /*
     * A failed fetch and a bad id land here together, and the page says the exercise was not
     * found either way. That is a known defect recorded in the screen note, not a decision — it
     * needs a distinguishable network state before it can offer a retry that means anything.
     * The way out is the header's back control (a real link to Gyakorlatok); a second link here
     * would say the same thing twice.
     */
    return (
      <Screen top="push">
        <ScreenHeader kind="push" />
        <EmptyState heading="h1" title={t('library.emptyTitle')} />
      </Screen>
    );
  }

  const { exercise, muscles, equipment, media, substitutions, availableLangs } = data;
  const hero = media[0];
  // The play affordance renders ONLY when there is something to play. Over a still photograph it
  // would be a promise the media contract cannot keep.
  const heroIsVideo = hero?.mime.startsWith('video/') ?? false;

  // slug → role, exactly the shape the map wants.
  const highlights: Record<string, MuscleRole> = Object.fromEntries(
    muscles.map((m) => [m.slug, m.role]),
  );
  // A lit muscle that has no region on the side shown: the screen says so under the key.
  const onSide = musclesOnSide(side);
  const offSide = Object.keys(highlights).some((slug) => !onSide.includes(slug));

  const sides: SegmentedOption<MuscleSide>[] = [
    { value: 'front', label: t('muscleMap.front') },
    { value: 'back', label: t('muscleMap.back') },
  ];

  // Say plainly that this text is not in the requested language, rather than letting the
  // fallback pass for a translation: the codes, in the warning ink, as the meta line's last item.
  const langMark =
    exercise.translated === 0 && lang !== 'en'
      ? (availableLangs.map((l) => l.lang).join(' / ') || 'en').toUpperCase()
      : null;
  const meta = [
    exercise.difficulty ? t(`library.difficulty.${exercise.difficulty}`) : null,
    exercise.exercise_type ? t(`library.type.${exercise.exercise_type}`) : null,
  ].filter((part): part is string => part !== null);

  /*
   * Equipment comes back only when there is no photograph: the photograph shows the bar and the
   * bench, so on a populated exercise the list restates the picture. A still exists for most
   * slugs (EQUIPMENT_STILL); a slug without one is the name alone, on the same text edge.
   */
  const showEquipment = !hero && equipment.length > 0;
  const anyStill = equipment.some((q) => equipmentStill(q.slug) !== null);
  const equipmentRows = (
    <RowStack>
      {equipment.map((q: Taxonomy) => {
        const still = equipmentStill(q.slug);
        return (
          <ListRow
            key={q.slug}
            title={q.name}
            lead={still ? <Pic slot={still} width={48} /> : undefined}
            leadSlot={!still && anyStill}
          />
        );
      })}
    </RowStack>
  );

  return (
    <Screen top="push">
      <ScreenHeader kind="push" title={<span className="block text-balance">{exercise.name}</span>}>
        {meta.length > 0 || langMark ? (
          <p className="text-body text-text-2">
            {meta.join(' · ')}
            {langMark ? (
              <>
                {meta.length > 0 ? ' · ' : null}
                <span className="text-data text-warning">{langMark}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </ScreenHeader>

      {/*
        THE OTHER END OF THE MODERATION LOOP. The moderator's reason is verbatim free text and is
        never truncated. Directly under the header: above everything the reader acts on.
      */}
      {exercise.status === 'rejected' ? (
        <NoticeLine tone="danger" role="status" detail={exercise.rejection_reason ?? undefined}>
          {t('library.rejectedTitle')}
        </NoticeLine>
      ) : exercise.status === 'pending_review' ? (
        <NoticeLine tone="info" role="status">
          {t('library.pendingReview')}
        </NoticeLine>
      ) : null}

      {/* An uploaded demonstration takes its own block; the catalogue has none, so no frame draws it. */}
      {heroIsVideo ? (
        <div className="relative aspect-video w-full overflow-hidden">
          <video
            ref={videoRef}
            src={`/api/v1/media/${hero.storage_key}`}
            // `preload="metadata"` puts the first frame under the glyph: a poster, not a black box.
            controls={started}
            playsInline
            preload="metadata"
            aria-label={exercise.name}
            // Covers a start that did not come from the glyph (a keyboard activation on the
            // element itself, or a browser that begins playback on its own).
            onPlay={() => setStarted(true)}
            className="size-full object-cover"
          />
          {!started ? (
            <Pressable
              variant="link"
              shape="icon"
              aria-label={t('library.playVideo')}
              className="absolute inset-0 m-auto"
              onClick={() => {
                setStarted(true);
                // If it rejects, the native controls are already on screen.
                void videoRef.current?.play().catch(() => {});
              }}
            >
              <Play />
            </Pressable>
          ) : null}
        </div>
      ) : hero ? (
        <UserPhoto src={`/api/v1/media/${hero.storage_key}`} alt={exercise.name} ratio={16 / 9} priority />
      ) : null}

      {muscles.length > 0 ? (
        /*
          The stage: 404 tall in the frames; the Eszköz block stands on its foot with the row's
          bottom padding (10) hanging under it, so the next rule is 32 under the stage, not under
          the row. Many muscles grow the stage instead of running into Eszköz.
        */
        <div className="relative -mb-2.5 flex min-h-[414px] flex-col gap-4">
          {/* Read-only: no `onSelect`, so no region is a target or a focus stop. */}
          <MuscleMap
            sideControl="none"
            side={side}
            highlights={highlights}
            className="absolute top-[26px] right-[-24px] h-[400px] max-[23.5rem]:right-[-16px]"
          />
          <SectionHeader
            rule={false}
            title={t('library.muscle')}
            trailing={<Segmented label={t('muscleMap.viewLabel')} options={sides} value={side} onChange={setSide} />}
            className="relative"
          />
          <div className="relative flex max-w-[200px] flex-col items-start gap-3">
            <RoleKey
              items={muscles.map((m) => ({ role: m.role, label: m.name }))}
              roleLabels={{ primary: t('muscleMap.primary'), secondary: t('muscleMap.secondary') }}
              label={t('library.muscle')}
            />
            {offSide ? (
              <p className="max-w-[132px] text-cap text-text-2">
                {t('muscleMap.alsoOnOtherSide', {
                  side: t(`muscleMap.${side === 'front' ? 'back' : 'front'}`).toLowerCase(),
                })}
              </p>
            ) : null}
          </div>
          {showEquipment ? (
            <div className="relative mt-auto w-full max-w-[200px]">
              <SectionHeader rule={false} title={t('library.equipment')} />
              {equipmentRows}
            </div>
          ) : null}
        </div>
      ) : showEquipment ? (
        <Section title={t('library.equipment')}>{equipmentRows}</Section>
      ) : null}

      {exercise.instructions.length > 0 ? (
        <Section title={t('library.howTo')}>
          <RowStack as="ol">
            {exercise.instructions.map((step, i) => (
              <div key={i} className="flex gap-4 py-4">
                {/* The numeral hangs from the line top (ink 4 below it) and never makes a short step taller:
                    the column is the frame's 42 pt number box, the numeral is placed in it. */}
                <div className="relative min-h-[42px] w-8 shrink-0" aria-hidden>
                  <Numeral value={String(i + 1)} className="absolute top-1 left-0" />
                </div>
                <p className="min-w-0 flex-1 text-body text-text-2">{step}</p>
              </div>
            ))}
          </RowStack>
        </Section>
      ) : exercise.description ? (
        /*
          No steps: the description is all there is. One paragraph under the section rule, no
          heading — there is no word for it in the copy, and none is invented (R22).
        */
        <div className="flex flex-col gap-4">
          <Rule strong />
          <p className="text-body text-text-2">{exercise.description}</p>
        </div>
      ) : null}

      {substitutions.length > 0 ? (
        <Section title={t('library.substitutions')}>
          {/* The strip scrolls inside itself and bleeds to the screen edge; the page never scrolls sideways. */}
          <ul className="-mx-6 flex overflow-x-auto px-6 [scrollbar-width:none] max-[23.5rem]:-mx-4 max-[23.5rem]:px-4">
            {substitutions.map((s, i) => (
              <li key={s.id} className="flex shrink-0">
                {i > 0 ? <span aria-hidden className="mx-4 w-px bg-hair" /> : null}
                <Link
                  to={`/library/${s.id}`}
                  className="flex min-h-16 w-[136px] flex-col gap-0.5 transition-opacity duration-[var(--duration-instant)] active:opacity-[var(--pressed-opacity)]"
                >
                  <span className="line-clamp-2 text-body-m text-text-1">{s.name}</span>
                  {s.difficulty ? (
                    <span className="text-cap text-text-2">{t(`library.difficulty.${s.difficulty}`)}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Screen>
  );
}

import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useExercise, type Taxonomy } from './useExercises';
import { MuscleMap, type MuscleRole } from '../../ui/muscle-map/MuscleMap';

/**
 * Exercise detail — Bible blueprint 5.
 *
 * 16:9 media hero → muscle chips (the animated body map replaces this block when the SVG asset
 * lands) → stats row → description → numbered how-to steps → horizontal substitution cards.
 */
export function ExerciseDetailPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const params = useParams();
  const id = Number.parseInt(params.id ?? '', 10);
  const { data, isPending } = useExercise(Number.isFinite(id) ? id : null, lang);

  const nameOf = (tax: Taxonomy) => tax.name;

  if (isPending) {
    return (
      <div className="col-mobile screen-x py-6">
        <Skeleton className="aspect-video w-full rounded-card" />
        <Skeleton className="mt-4 h-7 w-2/3" />
        <Skeleton className="mt-2 h-4 w-1/3" />
        <Skeleton className="mt-6 h-24 w-full rounded-card" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="col-mobile screen-x py-6">
        <p className="text-body text-text-2">{t('library.emptyTitle')}</p>
        <Pressable className="mt-4" icon={<ArrowLeft size={20} strokeWidth={2} aria-hidden />}>
          <Link to="/library">{t('nav.library')}</Link>
        </Pressable>
      </div>
    );
  }

  const { exercise, muscles, equipment, media, substitutions, availableLangs } = data;
  const primary = muscles.filter((m) => m.role === 'primary');
  const secondary = muscles.filter((m) => m.role === 'secondary');
  // slug → role, exactly the shape the map wants.
  const highlights: Record<string, MuscleRole> = Object.fromEntries(
    muscles.map((m) => [m.slug, m.role]),
  );

  return (
    <div className="col-mobile screen-x py-6">
      <Link
        to="/library"
        className="inline-flex min-h-[var(--target-min)] items-center gap-2 text-body-s text-text-2 hover:text-text-1"
      >
        <ArrowLeft size={20} strokeWidth={2} aria-hidden />
        {t('nav.library')}
      </Link>

      {/*
        ═══ THE OTHER END OF THE MODERATION LOOP ═══════════════════════════════════════════════
        The admin route has always REFUSED a rejection with no reason — a zod `.refine` whose
        message reads "a rejection must carry a reason", written so the coach would not have to
        guess what to fix. The reason was then stored, returned by this very endpoint, and
        rendered nowhere. The coach guessed anyway, for the whole of Phase 1.

        Above the media, not below the steps: somebody opening a submission they are waiting on
        should not have to scroll to find out it was turned down.
      */}
      {exercise.status === 'rejected' ? (
        <div
          role="status"
          className="mt-3 rounded-card border border-danger bg-danger-subtle p-3"
        >
          <p className="text-body-s font-semibold text-text-1">{t('library.rejectedTitle')}</p>
          {exercise.rejection_reason ? (
            <p className="text-body-s mt-1 text-text-2">{exercise.rejection_reason}</p>
          ) : null}
        </div>
      ) : exercise.status === 'pending_review' ? (
        <div role="status" className="mt-3 rounded-card border border-[var(--surface-border)] bg-surface-2 p-3">
          <p className="text-body-s text-text-2">{t('library.pendingReview')}</p>
        </div>
      ) : null}

      {/* The aspect ratio is reserved whether or not media exists, so nothing shifts on load. */}
      <div className="mt-3 grid aspect-video w-full place-items-center overflow-hidden rounded-card border border-[var(--surface-border)] bg-surface-1">
        {media.length > 0 ? (
          <img
            src={`/api/v1/media/${media[0].storage_key}`}
            alt={exercise.name}
            width={media[0].width}
            height={media[0].height}
            className="size-full object-cover"
          />
        ) : (
          <Dumbbell size={48} strokeWidth={1.5} aria-hidden className="text-text-3" />
        )}
      </div>

      <h1 className="text-title-1 mt-4 text-text-1">{exercise.name}</h1>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {exercise.difficulty ? (
          <span className="text-caption rounded-chip bg-surface-2 px-2 py-1 text-text-2">
            {t(`library.difficulty.${exercise.difficulty}`)}
          </span>
        ) : null}
        {exercise.exercise_type ? (
          <span className="text-caption rounded-chip bg-surface-2 px-2 py-1 text-text-2">
            {t(`library.type.${exercise.exercise_type}`)}
          </span>
        ) : null}
        {/* Say plainly that this text is not in the requested language, rather than letting the
            fallback pass for a translation. */}
        {exercise.translated === 0 && lang !== 'en' ? (
          <span className="text-micro uppercase rounded-chip bg-warning-subtle px-2 py-1 text-warning">
            {availableLangs.map((l) => l.lang).join(' / ') || 'en'}
          </span>
        ) : null}
      </div>

      {primary.length > 0 || secondary.length > 0 ? (
        <section className="mt-6">
          <p className="text-micro uppercase text-accent">{t('library.muscle')}</p>
          <MuscleMap highlights={highlights} className="mt-2" />
          <div className="mt-4 flex flex-wrap gap-2">
            {primary.map((m) => (
              // Primary muscles carry the full accent, secondary ones the subtle fill — the same
              // distinction the body map will draw once the SVG lands.
              <span key={m.slug} className="text-body-s rounded-chip bg-accent px-3 py-1.5 text-accent-fg">
                {nameOf(m)}
              </span>
            ))}
            {secondary.map((m) => (
              <span key={m.slug} className="text-body-s rounded-chip bg-accent-subtle px-3 py-1.5 text-text-1">
                {nameOf(m)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {equipment.length > 0 ? (
        <section className="mt-6">
          <p className="text-micro uppercase text-accent">{t('library.equipment')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {equipment.map((q) => (
              <span key={q.slug} className="text-body-s rounded-chip bg-surface-2 px-3 py-1.5 text-text-2">
                {nameOf(q)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {exercise.description ? (
        <section className="mt-6">
          <p className="text-body measure text-text-2">{exercise.description}</p>
        </section>
      ) : null}

      {exercise.instructions.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-title-3 text-text-1">{t('library.howTo')}</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {exercise.instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="text-caption inline-flex size-6 shrink-0 items-center justify-center rounded-chip bg-accent-subtle tabular-nums text-accent"
                >
                  {i + 1}
                </span>
                <span className="text-body measure text-text-2">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {substitutions.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-title-3 text-text-1">{t('library.substitutions')}</h2>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            {substitutions.map((s) => (
              <Link
                key={s.id}
                to={`/library/${s.id}`}
                className={cn(
                  'flex min-h-[var(--target-min)] w-44 shrink-0 flex-col justify-center rounded-card',
                  'border border-[var(--surface-border)] bg-surface-1 p-3',
                  'transition-colors duration-[var(--duration-fast)] hover:bg-surface-2',
                  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                  'focus-visible:outline-[var(--focus-ring)]',
                )}
              >
                <span className="text-body-s line-clamp-2 text-text-1">{s.name}</span>
                {s.difficulty ? (
                  <span className="text-caption mt-1 text-text-3">
                    {t(`library.difficulty.${s.difficulty}`)}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

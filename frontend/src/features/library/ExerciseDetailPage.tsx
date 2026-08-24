import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Dumbbell, Info, ListOrdered, PersonStanding, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import { control } from '../../ui/primitives/control';
import { Surface } from '../../ui/primitives/Surface';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useExercise, type Taxonomy } from './useExercises';
import { MuscleMap, type MuscleRole } from '../../ui/muscle-map/MuscleMap';
import { SectionBadge } from './SectionBadge';

/** The outlined pill the meta row, the muscle chips and the equipment chips all share. */
const PILL = [
  'text-body-s inline-flex items-center gap-tight rounded-chip px-3 py-2',
  'border-[length:var(--border-width)]',
].join(' ');

/**
 * Exercise detail — [[55-Screens/gyakorlat-reszletei]].
 *
 * The anchor is the media hero: the question this screen answers is *how is this done*, and a
 * demonstration answers it before any sentence does. Everything below defers to it — the muscle
 * map in particular is drawn deliberately smaller than the same component on the library screen,
 * because here anatomy is evidence rather than the subject.
 */
export function ExerciseDetailPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const params = useParams();
  const id = Number.parseInt(params.id ?? '', 10);
  const { data, isPending } = useExercise(Number.isFinite(id) ? id : null, lang);

  const nameOf = (tax: Taxonomy) => tax.name;

  if (isPending) {
    // The new geometry, not the old one: back link, then the hero at its reserved ratio, then a
    // two-thirds title bar and a one-third meta bar, then one block. Nothing moves on the swap.
    return (
      <div className="col-mobile screen-x flex flex-col gap-section py-6" role="status" aria-busy>
        <span className="sr-only">{t('common.loading')}</span>
        <div className="flex flex-col gap-group">
          <Skeleton className="h-[var(--control-h)] w-32" />
          <Skeleton className="aspect-video w-full rounded-card" />
          <div className="flex flex-col gap-tight">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (!data) {
    /*
     * A failed fetch and a bad id land here together, and the page says the exercise was not
     * found either way. That is a known defect recorded in the screen note, not a decision — it
     * needs a distinguishable network state before it can offer a retry that means anything.
     *
     * The way out is a LINK styled with the control recipe, not a `Pressable` with an `<a>`
     * inside it: an anchor nested in a button is invalid markup, and it made the back-out
     * unreachable for anyone navigating by links.
     */
    return (
      <div className="col-mobile screen-x flex flex-col gap-group py-6">
        <p className="text-body text-text-2">{t('library.emptyTitle')}</p>
        <Link to="/library" className={cn(control({ variant: 'secondary' }), 'self-start')}>
          <ArrowLeft className="size-icon-m" strokeWidth={2} aria-hidden />
          {t('nav.library')}
        </Link>
      </div>
    );
  }

  const { exercise, muscles, equipment, media, substitutions, availableLangs } = data;
  const hero = media[0];
  // The play affordance is drawn by the browser, and ONLY when there is something to play. A play
  // button over a still photograph is a promise the media contract cannot keep — there is no
  // video/poster pairing in the payload, so a hand-drawn triangle here would be decoration that
  // does nothing when tapped. When the stored media really is a video, `controls` gives a real
  // one, at a real size, with real keyboard and screen-reader behaviour.
  const heroIsVideo = hero?.mime.startsWith('video/') ?? false;

  // slug → role, exactly the shape the map wants.
  const highlights: Record<string, MuscleRole> = Object.fromEntries(
    muscles.map((m) => [m.slug, m.role]),
  );

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      {/* ── the hero block ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-group">
        <Link
          to="/library"
          className={cn(
            'inline-flex min-h-[var(--target-min)] items-center gap-tight self-start',
            'text-body-s text-text-2 transition-colors duration-[var(--duration-fast)]',
            'ease-[var(--ease-standard)] hover:text-text-1',
          )}
        >
          <ArrowLeft className="size-icon-m" strokeWidth={2} aria-hidden />
          {t('nav.library')}
        </Link>

        {/*
          ═══ THE OTHER END OF THE MODERATION LOOP ═════════════════════════════════════════════
          The admin route has always REFUSED a rejection with no reason — a zod `.refine` whose
          message reads "a rejection must carry a reason", written so the coach would not have to
          guess what to fix. The reason was then stored, returned by this very endpoint, and
          rendered nowhere. The coach guessed anyway, for the whole of Phase 1.

          ABOVE the media, not below the steps: somebody opening a submission they are waiting on
          should not have to scroll to find out it was turned down. The reason is the moderator's
          verbatim free text and is never truncated to fit.
        */}
        {exercise.status === 'rejected' ? (
          <Surface role="status" className="flex items-start gap-tight">
            <span
              aria-hidden
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-danger-subtle text-danger"
            >
              <TriangleAlert className="size-icon-m" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-strong text-text-1">{t('library.rejectedTitle')}</p>
              {exercise.rejection_reason ? (
                <p className="text-body-s mt-1 text-text-2">{exercise.rejection_reason}</p>
              ) : null}
            </div>
          </Surface>
        ) : exercise.status === 'pending_review' ? (
          <Surface role="status" className="flex items-center gap-tight">
            <span
              aria-hidden
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-info-subtle text-info"
            >
              <Info className="size-icon-m" strokeWidth={2} />
            </span>
            <p className="text-body-s text-text-2">{t('library.pendingReview')}</p>
          </Surface>
        ) : null}

        {/* The aspect ratio is reserved whether or not media exists, so nothing shifts on load. */}
        <Surface
          elevation="inset"
          pad="none"
          className="grid aspect-video w-full place-items-center overflow-hidden"
        >
          {heroIsVideo ? (
            <video
              src={`/api/v1/media/${hero.storage_key}`}
              controls
              playsInline
              preload="metadata"
              aria-label={exercise.name}
              className="size-full object-cover"
            />
          ) : hero ? (
            <img
              src={`/api/v1/media/${hero.storage_key}`}
              alt={exercise.name}
              width={hero.width}
              height={hero.height}
              className="size-full object-cover"
            />
          ) : (
            <Dumbbell size={48} strokeWidth={1.5} aria-hidden className="text-text-3" />
          )}
        </Surface>

        <div className="flex flex-col gap-tight">
          <h1 className="text-title-1 text-text-1">{exercise.name}</h1>

          <div className="flex flex-wrap items-center gap-tight">
            {exercise.difficulty ? (
              <span className={cn(PILL, 'border-[var(--surface-border)] text-text-2')}>
                {t(`library.difficulty.${exercise.difficulty}`)}
              </span>
            ) : null}
            {exercise.exercise_type ? (
              <span className={cn(PILL, 'border-[var(--surface-border)] text-text-2')}>
                {t(`library.type.${exercise.exercise_type}`)}
              </span>
            ) : null}
            {/* Say plainly that this text is not in the requested language, rather than letting
                the fallback pass for a translation. */}
            {exercise.translated === 0 && lang !== 'en' ? (
              <span
                className={cn(
                  'text-micro uppercase inline-flex items-center rounded-chip px-3 py-2',
                  'border-[length:var(--border-width)] border-warning-border bg-warning-subtle text-warning',
                )}
              >
                {availableLangs.map((l) => l.lang).join(' / ') || 'en'}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── anatomy ────────────────────────────────────────────────────────────────────────── */}
      {muscles.length > 0 ? (
        <section className="flex flex-col gap-group">
          <SectionBadge icon={PersonStanding}>
            <h2 className="text-micro uppercase text-accent">{t('library.muscle')}</h2>
          </SectionBadge>

          {/*
            Smaller than the same component on the library screen, on purpose: only one element on
            a screen may dominate and here that is the demonstration above. The figure is READ-ONLY
            — no `onSelect` — so its regions are not tap targets and not keyboard stops either. A
            region that navigated away from a read-only diagram would be a trap, not a shortcut.

            `legend={false}` because the chips directly below carry the same role dots: the legend
            here is the identical key printed twice, and the screen note records it as cut. If the
            chip dots ever go, the legend comes back WITH them, not instead of them.
          */}
          <MuscleMap
            highlights={highlights}
            legend={false}
            className="mx-auto w-full max-w-[220px]"
          />

          <div className="flex flex-wrap gap-tight">
            {muscles.map((m) => (
              // The dot is the key to the figure's two fills: full accent = the muscle this
              // movement is for, the lighter step = one it also loads. Drop the dots and the
              // colour distinction on the map stops being information.
              <span
                key={m.slug}
                className={cn(PILL, 'border-[var(--accent-border)] text-text-1')}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-block size-2 shrink-0 rounded-chip',
                    m.role === 'primary' ? 'bg-accent' : 'bg-[var(--accent-300)]',
                  )}
                />
                {nameOf(m)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/*
        ═══ EQUIPMENT COMES BACK WHEN THE HERO IS EMPTY ══════════════════════════════════════════
        The chips were cut because the photograph shows the bar and the bench, so on a populated
        exercise they restate the picture. On an exercise with no media there is no picture, and
        the chips are then the ONLY statement of what the user needs to have in front of them.
        Shipping the cut unconditionally is the defect the screen note names.
      */}
      {!hero && equipment.length > 0 ? (
        <section className="flex flex-col gap-tight">
          <h2 className="text-micro uppercase text-text-2">{t('library.equipment')}</h2>
          <div className="flex flex-wrap gap-tight">
            {equipment.map((q) => (
              <span
                key={q.slug}
                className={cn(PILL, 'border-[var(--surface-border)] text-text-2')}
              >
                {nameOf(q)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── how it is done ─────────────────────────────────────────────────────────────────── */}
      {exercise.instructions.length > 0 ? (
        <section className="flex flex-col gap-group">
          <SectionBadge icon={ListOrdered}>
            <h2 className="text-title-2 text-text-1">{t('library.howTo')}</h2>
          </SectionBadge>
          <ol className="flex flex-col gap-group">
            {exercise.instructions.map((step, i) => (
              <li key={i} className="flex items-start gap-tight">
                <span
                  aria-hidden
                  className="text-caption inline-flex size-8 shrink-0 items-center justify-center rounded-chip bg-accent-subtle tabular-nums text-accent"
                >
                  {i + 1}
                </span>
                <span className="text-body measure mt-1 text-text-2">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : exercise.description ? (
        /*
          The three-sentence description was merged away because the numbered how-to says the same
          thing operationally, and prose above a procedure is the same content twice at lower
          density. It is NOT deleted: an exercise with no steps has nothing else, and a detail page
          that renders a title and a photograph is not a detail page.
        */
        <section>
          <p className="text-body measure text-text-2">{exercise.description}</p>
        </section>
      ) : null}

      {/* ── a way out to something else ────────────────────────────────────────────────────── */}
      {substitutions.length > 0 ? (
        <section className="flex flex-col gap-group">
          <h2 className="text-title-2 text-text-1">{t('library.substitutions')}</h2>
          {/* The strip scrolls inside itself; the page body never scrolls sideways. */}
          <div className="-mx-4 flex gap-tight overflow-x-auto px-4 pb-1">
            {substitutions.map((s) => (
              <Surface
                key={s.id}
                as={Link}
                to={`/library/${s.id}`}
                interactive
                className="flex w-40 shrink-0 flex-col justify-center gap-tight"
              >
                <span className="text-body-strong line-clamp-2 text-text-1">{s.name}</span>
                {s.difficulty ? (
                  <span className="text-caption text-text-3">
                    {t(`library.difficulty.${s.difficulty}`)}
                  </span>
                ) : null}
              </Surface>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

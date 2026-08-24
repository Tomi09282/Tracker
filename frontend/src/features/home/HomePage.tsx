import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CalendarDays, CheckCircle2, Clock, Dumbbell, Moon, PlayCircle } from 'lucide-react';
import { NotificationBell } from '../chat/NotificationBell';
import { cn } from '../../lib/cn';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { useStartWorkout, useCurrentWorkout } from '../workout/useWorkout';
import { useToday, type TodayDay } from './useToday';
import { WeekStrip } from './WeekStrip';
import { SectionHeader } from './SectionHeader';
import { HomeNutrition } from './HomeNutrition';

/**
 * Home — [[55-Screens/01 Home]] and [[55-Screens/01b Home empty]].
 *
 * The screen a client opens twenty times a day and reads in about two seconds: am I on track this
 * week, and is there a session waiting for me right now. Everything on it is either that answer or
 * a way to act on it.
 *
 * ═══ WHAT LEFT THIS SCREEN, AND WHY ════════════════════════════════════════════════════════════
 *
 * · The signed-in e-mail. It was rendered on the busiest screen in the product and answered a
 *   question nobody asks twenty times a day; it belongs on `Profil`. Dropping it is also what let
 *   the header be two lines instead of a four-item baseline scramble that truncated the date on
 *   narrow phones.
 * · The week pager and the day numbers — see `WeekStrip`.
 * · The uppercase eyebrow, which became a heading with a mark (`SectionHeader`). It earns the
 *   weight because it introduces the only actionable region on the page.
 *
 * ═══ ONE FILLED BUTTON, AND IT MOVES ═══════════════════════════════════════════════════════════
 *
 * With a session running the accent is spent on `Folytatás`; with nothing scheduled it is spent on
 * the empty state's action. The day list is never filled — three untrained days used to emit three
 * filled primaries, which is the same as emitting none.
 */
export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const today = useToday();
  const current = useCurrentWorkout();
  const start = useStartWorkout();

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const days = today.data?.days ?? [];
  const todayDate = today.data?.date ?? null;
  const live = current.data?.log ?? null;

  const begin = async (day: TodayDay) => {
    await start.mutateAsync({ plan_day_id: day.day_id });
    void navigate('/workout');
  };

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      {/* No page title and no breadcrumb: the active nav tab already says where you are. */}
      <header className="flex items-start justify-between gap-group">
        <div className="min-w-0">
          <h1 className="text-display text-text-1">{t('home.greeting')}</h1>
          <p className="text-body-s truncate text-text-2 first-letter:uppercase">{dateLabel}</p>
        </div>
        <NotificationBell className="-mr-2 shrink-0" />
      </header>

      {today.isPending ? (
        // The shapes are the NEW geometry — the anchor panel and one day card. A skeleton whose
        // outline does not match what arrives is the layout shift it was supposed to prevent.
        <div className="flex flex-col gap-section" role="status" aria-busy="true">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-72 w-full rounded-card" />
          <div className="flex flex-col gap-group">
            <Skeleton className="h-11 w-40 rounded-field" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        </div>
      ) : (
        <>
          {/* No plan day today means no denominator, so the ring — and the evidence under it —
              is replaced entirely by the empty anchor rather than rendered at zero. */}
          {todayDate && days.length > 0 ? <WeekStrip today={todayDate} /> : null}

          {live || days.length > 0 ? (
            <section aria-labelledby="today-heading" className="flex flex-col gap-group">
              <SectionHeader
                icon={PlayCircle}
                title={t('home.todayTitle')}
                titleId="today-heading"
              />

              {live ? (
                /* A session already running outranks the schedule. It is the one thing the user is
                   in the middle of, and it takes the screen's only filled button. */
                <Surface className="flex flex-col gap-group border-[var(--accent)] bg-accent-subtle">
                  <div className="min-w-0">
                    <p className="text-title-3 text-text-1">{t('home.inProgress')}</p>
                    <p className="text-body-s truncate text-text-2">
                      {live.title ?? t('workout.freestyle')}
                    </p>
                  </div>
                  <Pressable
                    variant="primary"
                    className="w-full"
                    onClick={() => void navigate('/workout')}
                  >
                    {t('home.resume')}
                  </Pressable>
                </Surface>
              ) : (
                <ul className="flex flex-col gap-group">
                  {days.map((day) => {
                    const trained = day.log_id != null;
                    return (
                      <Surface
                        as="li"
                        key={`${day.plan_id}-${day.day_id}-${day.slot}`}
                        className={cn('flex items-center gap-tight', trained && 'bg-success-subtle')}
                      >
                        {/* A rest day is information, not an absence. Hiding it looks like a bug
                            and leaves the client wondering whether their plan broke. */}
                        {day.is_rest ? (
                          <Moon className="size-icon-l shrink-0 text-text-3" aria-hidden />
                        ) : trained ? (
                          <CheckCircle2 className="size-icon-l shrink-0 text-success" aria-hidden />
                        ) : (
                          <Dumbbell className="size-icon-l shrink-0 text-text-2" aria-hidden />
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-body-strong truncate text-text-1">{day.day_name}</p>
                          <p className="text-caption flex items-center gap-2 text-text-3">
                            <span className="truncate">{day.plan_name}</span>
                            {day.start_time ? (
                              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                                <Clock className="size-icon-s" aria-hidden />
                                {day.start_time}
                              </span>
                            ) : null}
                            {!day.is_rest ? (
                              <span className="shrink-0 tabular-nums">
                                {t('home.exerciseCount', { count: day.exercise_count })}
                              </span>
                            ) : null}
                          </p>
                        </div>

                        {day.is_rest ? (
                          <span className="text-caption shrink-0 text-text-3">
                            {t('home.restDay')}
                          </span>
                        ) : trained ? (
                          <span className="text-caption shrink-0 text-success">
                            {t('home.done')}
                          </span>
                        ) : (
                          <Pressable
                            // Outlined, and the whole list stays outlined: one filled accent per
                            // screen, and on this screen it belongs to `Folytatás` or to the
                            // empty state's action.
                            variant="secondary"
                            busy={start.isPending}
                            // A session already running would be RESUMED rather than replaced by
                            // the server, so offering "start" here would be a lie about what the
                            // tap does.
                            disabled={live != null}
                            onClick={() => void begin(day)}
                          >
                            {t('home.start')}
                          </Pressable>
                        )}
                      </Surface>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : (
            /* Empty AND error: a failed `today` query renders this panel rather than a red card,
               because a client who cannot be told what is scheduled needs the same escape hatch as
               one with nothing scheduled. The failure itself is a server-log concern. */
            <Surface pad="none">
              <EmptyState
                icon={CalendarDays}
                title={t('home.emptyTitle')}
                body={t('home.emptyBody')}
                action={
                  <Pressable
                    variant="primary"
                    icon={<Dumbbell className="size-icon-m" aria-hidden />}
                    onClick={() => void navigate('/library')}
                  >
                    {t('home.browseLibrary')}
                  </Pressable>
                }
              />
            </Surface>
          )}
        </>
      )}

      {/* Below the session, because training is what this screen is for and food is context. */}
      <HomeNutrition date={todayLocal()} />
    </div>
  );
}

/** Local calendar day. toISOString() is UTC and would be yesterday at 01:00 in Budapest. */
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

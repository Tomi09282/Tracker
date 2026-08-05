import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CalendarDays, Dumbbell, Moon, PlayCircle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pressable } from '../../ui/primitives/Pressable';
import { useSession } from '../auth/useSession';
import { useStartWorkout, useCurrentWorkout } from '../workout/useWorkout';
import { useToday, type TodayDay } from './useToday';
import { WeekStrip } from './WeekStrip';

/**
 * Today / Home — Bible blueprint 2.
 *
 * The hero card is wired to the real schedule now. What it will NOT do is invent one: a client with
 * no active plan still gets an honest empty state rather than a mock card, because a hero that does
 * nothing is worse than a blank that tells the truth.
 */
export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useSession();
  const today = useToday();
  const current = useCurrentWorkout();
  const start = useStartWorkout();

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const days = today.data?.days ?? [];
  const live = current.data?.log ?? null;

  const begin = async (day: TodayDay) => {
    await start.mutateAsync({ plan_day_id: day.day_id });
    void navigate('/workout');
  };

  return (
    <div className="col-mobile screen-x py-6">
      <header>
        <h1 className="text-title-2 text-text-1">{t('home.greeting')}</h1>
        <p className="text-caption mt-1 text-text-3 first-letter:uppercase">{dateLabel}</p>
        {user ? <p className="text-body-s mt-1 text-text-3">{user.email}</p> : null}
      </header>

      {today.data?.date ? (
        <div className="mt-6">
          <WeekStrip today={today.data.date} />
        </div>
      ) : null}

      <section className="mt-6" aria-labelledby="today-heading">
        <p className="text-micro uppercase text-accent">{t('home.todayTitle')}</p>
        <h2 id="today-heading" className="sr-only">
          {t('home.todayTitle')}
        </h2>

        {/* A session already running outranks the schedule. It is the one thing the user is in the
            middle of, and burying it under "today's plan" would be absurd. */}
        {live ? (
          <div className="mt-2 flex items-center gap-3 rounded-card border border-[var(--accent)] bg-accent-subtle p-4">
            <PlayCircle className="size-icon-l shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">{t('home.inProgress')}</p>
              <p className="text-caption truncate text-text-2">{live.title ?? t('workout.freestyle')}</p>
            </div>
            <Pressable variant="primary" onClick={() => void navigate('/workout')}>
              {t('home.resume')}
            </Pressable>
          </div>
        ) : null}

        {today.isPending ? (
          <Skeleton className="mt-2 h-28 w-full rounded-card" />
        ) : days.length === 0 ? (
          <div className="mt-2 rounded-card border border-[var(--surface-border)] bg-surface-1">
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
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {days.map((day) => {
              const trained = day.log_id != null;
              return (
                <li
                  key={`${day.plan_id}-${day.day_id}-${day.slot}`}
                  className={cn(
                    'flex items-center gap-3 rounded-card border border-[var(--surface-border)] p-4',
                    trained ? 'bg-success/10' : 'bg-surface-1',
                  )}
                >
                  {/* A rest day is information, not an absence. Hiding it looks like a bug and
                      leaves the client wondering whether their plan broke. */}
                  {day.is_rest ? (
                    <Moon className="size-icon-l shrink-0 text-text-3" aria-hidden />
                  ) : trained ? (
                    <CheckCircle2 className="size-icon-l shrink-0 text-success" aria-hidden />
                  ) : (
                    <Dumbbell className="size-icon-l shrink-0 text-accent" aria-hidden />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-body truncate font-medium">{day.day_name}</p>
                    <p className="text-caption flex items-center gap-2 text-text-2">
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
                    <span className="text-caption shrink-0 text-text-3">{t('home.restDay')}</span>
                  ) : trained ? (
                    <span className="text-caption shrink-0 text-success">{t('home.done')}</span>
                  ) : (
                    <Pressable
                      variant="primary"
                      busy={start.isPending}
                      // A session already running would be RESUMED rather than replaced by the
                      // server, so offering "start" here would be a lie about what the tap does.
                      disabled={live != null}
                      onClick={() => void begin(day)}
                    >
                      {t('home.start')}
                    </Pressable>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

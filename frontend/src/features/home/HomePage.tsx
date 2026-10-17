import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { useNavigate } from 'react-router';
import { NotificationBell } from '../chat/NotificationBell';
import { Dot } from '../../ui/data/Dot';
import { ListRow } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Section } from '../../ui/data/SectionHeader';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pic } from '../../ui/media/Pic';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { useStartWorkout, useCurrentWorkout } from '../workout/useWorkout';
import { useToday, type TodayDay } from './useToday';
import { WeekStrip } from './WeekStrip';
import { HomeNutrition } from './HomeNutrition';

/**
 * Home — frames `home-1` (training day), `home-2` (session running), `home-3` (nothing today).
 *
 * The screen a client opens twenty times a day and reads in about two seconds: am I on track this
 * week, and is there a session waiting for me right now. Everything on it is either that answer or
 * a way to act on it.
 *
 * ═══ THE COMPOSITION OF THE FRAMES (`figma-build/app/home-*.body.js`) ══════════════════════════
 *
 *   Screen top="root"          the scaffold: header at y 72, blocks 32 apart
 *   ScreenHeader greet         "Szia!" + the date, the bell on the right edge
 *   WeekStrip                  the hero: "HETI EDZÉS", the giant "2 / 4", the week bar, the fist
 *                              glowing behind on the right
 *   Section "Mai edzés"        rule, eyebrow + ONE trailing (the meta "18:00 · 5 gyakorlat", or the
 *                              live dot + "Edzés folyamatban"), the day's name in display-XL, the
 *                              plan in body, then the screen's ONE lime pill (Indítás / Folytatás)
 *   HomeNutrition              rule, "TÁPLÁLKOZÁS" + "Megnyitás ›", four macro columns
 *
 * With nothing scheduled (`home-3`) the week and the section give way to ONE still (the plates,
 * 480 pt, bleeding past both edges) and the empty state, whose pill is the door to the library.
 *
 * ═══ WHAT THE FRAMES DO NOT DRAW, BUILT IN THE SAME LANGUAGE (owner answer Q4) ═════════════════
 *
 * · The library row (D2): a ruled `ListRow` "Gyakorlatok ›" at the END of the screen, below the
 *   nutrition section (owner, 2026-10-17), so the first screen is exactly home-1 / home-2 — the
 *   permanent way to the exercise library on a day that has a session. Not in the empty state:
 *   there the pill already is that door.
 * · A rest day: the day's name and the plan, "Pihenőnap" as the section's status, no action.
 * · Already trained: the same, with a lit dot and "Kész" as the status, no action.
 * · Several sessions today: the first one still to do is the subject (display-XL + the pill); the
 *   others are rows under it, each with its own "Indítás" as a text link — one pill per screen.
 * · Starting: every Indítás is busy together (one shared mutation). A failed start is silent.
 * · Loading: blocks where the hero's lines and the session's lines will be; never a spinner.
 */
export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const today = useToday();
  const current = useCurrentWorkout();
  const start = useStartWorkout();

  // The APP's language, not the browser's — a Hungarian UI on an English phone printed
  // "Saturday, August 22" under "Szia!". And two formatters rather than one: Intl's own hu order is
  // month-first ("augusztus 22., szombat"), so the single-format string put the capital on the
  // MONTH once `first-letter:uppercase` reached it. Weekday first is what the spec quotes.
  const now = new Date();
  const dateLabel = [
    new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(now),
    new Intl.DateTimeFormat(i18n.language, { month: 'long', day: 'numeric' }).format(now),
  ].join(', ');

  const days = today.data?.days ?? [];
  const todayDate = today.data?.date ?? null;
  const live = current.data?.log ?? null;

  const begin = async (day: TodayDay) => {
    await start.mutateAsync({ plan_day_id: day.day_id });
    void navigate('/workout');
  };

  // The session the hero shows: the first one still to do, else the first one of the day.
  const subject = days.find((d) => !d.is_rest && d.log_id == null) ?? days[0] ?? null;
  const others = days.filter((d) => d !== subject);

  // "18:00 · 5 gyakorlat": the time in ink, the rest quiet (the frame's two fills of one line).
  const meta = (day: TodayDay): ReactNode => (
    <span className="text-data text-text-1">
      {day.start_time ? day.start_time : null}
      <span className="text-text-2">
        {day.start_time ? ' · ' : null}
        {t('home.exerciseCount', { count: day.exercise_count })}
      </span>
    </span>
  );

  // The section's ONE trailing node: what the subject IS right now.
  const status = (day: TodayDay | null): ReactNode => {
    if (live) return <LiveStatus>{t('home.inProgress')}</LiveStatus>;
    if (!day) return null;
    if (day.is_rest) {
      return (
        <span className="text-cap text-text-2">
          {day.start_time ? <span className="text-data text-text-1">{day.start_time} · </span> : null}
          {t('home.restDay')}
        </span>
      );
    }
    if (day.log_id != null) return <LiveStatus>{t('home.done')}</LiveStatus>;
    return meta(day);
  };

  // D2's library row is shown on a day that has a session (see its block at the end).
  const libraryRow = !today.isPending && (live != null || subject != null);
  // The layout home-1 / home-2 draw: the week, today's session with its pill (Indítás or
  // Folytatás) and — checked in CSS, see below — the nutrition section. Only that screen is held
  // to the frame's first screen; a shorter day (rest, done, a session without a plan) is no drawn
  // frame, and holding its row below the fold would open an empty band above it.
  const drawnFirstScreen =
    libraryRow &&
    todayDate != null &&
    days.length > 0 &&
    (live != null || (subject != null && !subject.is_rest && subject.log_id == null));

  return (
    <Screen top="root">
      {/* Everything above the library row. On the drawn first screen (`drawnFirstScreen` AND the
          nutrition section on the screen: `#home-nutrition`, in any of its states) this column is
          at least as tall as the first screen down to the top of the tab bar, so the row's rule
          starts where the bar starts: the first screen is exactly home-1 / home-2 (owner,
          2026-10-17) and the row is one scroll further down, never peeking out of the bar's fade.
          That costs 11 pt over the block gap on 874 pt; a longer day (several sessions, a long
          name, a 640 pt phone) is taller than the floor anyway. The floor never measures more
          than the frame's own 874 pt, so a taller phone or a desktop window shows the row on its
          first screen 11 pt further down instead of opening a band. Every other screen: the row
          simply follows the last block 32 below it — no empty band. */}
      <div
        className={cn(
          'flex flex-col gap-8',
          drawnFirstScreen &&
            'has-[#home-nutrition]:min-h-[calc(min(var(--viewport-h),874px)_-_var(--content-pad-b)_-_var(--head-top-root)_-_var(--spacing)_*_8)]',
        )}
      >
        {/* No page title and no breadcrumb: the active tab already says where you are. */}
        <ScreenHeader
          kind="greet"
          title={t('home.greeting')}
          sub={<span className="block truncate first-letter:uppercase">{dateLabel}</span>}
          trailing={<NotificationBell />}
        />

        {today.isPending ? (
          // Blocks where the hero's lines and the session's lines will be. Which of the two branches
          // arrives (the week + today, or the empty state) is exactly what this cannot know yet.
          <div role="status" aria-busy="true" className="flex flex-col gap-8">
            <span className="sr-only">{t('common.loading')}</span>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-[99px] w-[170px]" />
            </div>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ) : (
          <>
            {/* No plan day today means no denominator: the week is replaced entirely by the empty
                state rather than rendered at zero. */}
            {todayDate && days.length > 0 ? <WeekStrip today={todayDate} /> : null}

            {live || subject ? (
              <Section title={t('home.todayTitle')} trailing={status(subject)}>
                <div className="flex flex-col gap-5">
                  {live ? (
                    /* A session already running outranks the schedule. It replaces the whole day
                       list and takes the screen's only pill. */
                    <>
                      <p className="text-display-xl break-words text-text-1">{live.title ?? t('workout.freestyle')}</p>
                      <Pressable variant="primary" size="lg" className="w-full" onClick={() => void navigate('/workout')}>
                        {t('home.resume')}
                      </Pressable>
                    </>
                  ) : subject ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <p className="text-display-xl break-words text-text-1">{subject.day_name}</p>
                        <p className="text-body text-text-2">{subject.plan_name}</p>
                      </div>
                      {/* A rest day and a trained day are information, not an action. */}
                      {!subject.is_rest && subject.log_id == null ? (
                        <Pressable
                          variant="primary"
                          size="lg"
                          className="w-full"
                          busy={start.isPending}
                          // A session already running would be RESUMED by the server rather than
                          // replaced, so "start" would be a lie about what the tap does.
                          disabled={live != null}
                          onClick={() => void begin(subject)}
                        >
                          {t('home.start')}
                        </Pressable>
                      ) : null}
                      {others.length > 0 ? (
                        <RowStack>
                          {others.map((day) => (
                            <ListRow
                              key={`${day.plan_id}-${day.day_id}-${day.slot}`}
                              title={day.day_name}
                              sub={day.plan_name}
                              value={day.is_rest || day.log_id != null ? undefined : meta(day)}
                              trailing={
                                day.is_rest ? (
                                  <span className="text-cap text-text-2">{t('home.restDay')}</span>
                                ) : day.log_id != null ? (
                                  <LiveStatus>{t('home.done')}</LiveStatus>
                                ) : undefined
                              }
                              control={
                                !day.is_rest && day.log_id == null ? (
                                  <TextLink busy={start.isPending} disabled={live != null} onClick={() => void begin(day)}>
                                    {t('home.start')}
                                  </TextLink>
                                ) : undefined
                              }
                            />
                          ))}
                        </RowStack>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </Section>
            ) : (
              /* Empty AND error: a failed `today` read renders this state rather than an error,
                 because a client who cannot be told what is scheduled needs the same way out as one
                 with nothing scheduled. The failure itself is a server-log concern. */
              <>
                {/* The still of the frame: 480 pt, its dim left end on the gutter, the lit right end
                    past the screen edge. The stage is as tall as the stack's ink plus 20 above it. */}
                <div aria-hidden className="relative h-[310px]">
                  <Pic slot="hero-plates" width={480} bleed className="absolute -left-[31px] -top-[14px]" />
                </div>
                <EmptyState
                  title={t('home.emptyTitle')}
                  body={t('home.emptyBody')}
                  action={
                    <Pressable variant="primary" size="lg" onClick={() => void navigate('/library')}>
                      {t('home.browseLibrary')}
                    </Pressable>
                  }
                />
              </>
            )}
          </>
        )}

        {/* Below the session, because training is what this screen is for and food is context. */}
        <HomeNutrition date={todayLocal()} />
      </div>

      {/* D2: the permanent way to the exercise library on a day that has a session. The owner's
          ruling of 2026-10-17 puts it BELOW the nutrition section: the first screen stays exactly
          home-1 / home-2, the row is one scroll further down, opened by the same strong rule a
          section opens with, and nothing follows it but the screen's own end. */}
      {libraryRow ? (
        <RowStack open>
          <ListRow title={t('nav.library')} to="/library" chevron />
        </RowStack>
      ) : null}
    </Screen>
  );
}

/** A status that is lit: the 6 pt lime dot and the words in ink (kit: "Status/live"). */
function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-cap-m text-text-1">
      <Dot tone="live" />
      {children}
    </span>
  );
}

/** Local calendar day. toISOString() is UTC and would be yesterday at 01:00 in Budapest. */
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

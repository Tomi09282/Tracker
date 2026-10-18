import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaptureSheet } from '../capture/CaptureSheet';
import { NotificationBell } from '../chat/NotificationBell';
import { HabitSheet } from '../habits/HabitSheet';
import { ListRow } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Pic } from '../../ui/media/Pic';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { LedgerLine } from './LedgerLine';
import { dayCount, dayLabel, earnedTodayMinor } from './model';
import { NextEventSection } from '../calendar/NextEventSection';
import { TodayHabits, TodayHabitsSkeleton } from './TodayHabits';
import { TodayHero } from './TodayHero';
import { TodayNutrition } from './TodayNutrition';
import { TodayTasks } from './TodayTasks';
import { TodayWorkout } from './TodayWorkout';
import { TodayDraw } from '../challenges/TodayDraw';
import { useLifeosToday } from './useLifeosToday';

/**
 * Ma — the first tab, at `/`. Frames `lifeos/ma-1` (a training day), `ma-2` (a rest day with
 * everything done), `ma-3` (a brand-new user), `ma-4` (the daily draw pending), design round B
 * (approved 2026-10-18). It replaces the Kezdőlap: the plan's session, the day's food and the door
 * to the library live on here, beside the day's habits and tasks.
 *
 * ═══ THE COMPOSITION OF THE FRAMES (`figma-build/lifeos/ma-*.part.js` on `ma.common.js`) ═══════
 *
 *   Screen top="root"          the scaffold: header at y 72, blocks 32 apart
 *   ScreenHeader greet         "Szia!" + the logical day ("Hétfő, október 19."), the bell
 *   LedgerLine (8 under)       coin · "190 ÉRME · SZINT 4" · the XP bar · › — the door to Érmék
 *   TodayHero                  "MA" + the giant "3/10", "Ma eddig +18 ÉRME", the day bar, the caption
 *   TodayDraw open             NAPI DOBÁS while the day's draw is on the table (ma-4: above MAI EDZÉS)
 *   TodayWorkout               MAI EDZÉS with THE lime pill (Indítás / Folytatás)
 *   TodayHabits                SZOKÁSOK (Összes ›): tap to log
 *   TodayTasks                 FELADATOK (Rögzítés +): tap to complete, "Kész ma · 2 ›"
 *   TodayDraw settled          NAPI DOBÁS once picked: the teaser, "elvállalva" (ma-1: after FELADATOK)
 *   TodayNutrition             TÁPLÁLKOZÁS (Megnyitás ›): Kalória, Fehérje
 *   NextEventSection           KÖVETKEZŐ (Naptár ›): the next event within 7 days (S-calendar)
 *   the library row            "Gyakorlatok" with the barbell still, last (owner, 2026-10-17)
 *
 * NAPI DOBÁS is package S-challenges' block (features/challenges/TodayDraw.tsx, plan phase 4): it is
 * mounted twice and each mount draws only its own state, so the block moves below FELADATOK when the
 * pick is made. The picked challenge's task is shown there, not among FELADATOK, and never counts.
 *
 * NextEventSection (KÖVETKEZŐ, Naptár ›) is package S-calendar's block (features/calendar/
 * NextEventSection.tsx, plan phase 5): the next event within 7 days, after TÁPLÁLKOZÁS; not drawn
 * without one.
 *
 * NOT YET: FÓKUSZ (phase 6) has no server yet, so it is not drawn — no teaser, no placeholder (D3:
 * never a control that does nothing).
 *
 * ═══ DATA ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `GET /lifeos/today` (useLifeosToday) carries the wallet, the workout flags, the habits and the
 * tasks; the plan's session is the Kezdőlap's own query (`/my-plans/today`, useTodayPlan) because
 * starting a workout needs its plan day. A backend before migration 032 sends no habits / tasks:
 * those two sections are then not drawn and the hero counts the workout alone.
 *
 * A failed LifeOS read: the ledger line and the hero print the dash (the danger line with "Újra" under
 * the hero) and the habit / task sections wait — the session, the food and the library still work.
 *
 * THE SHEETS OVER MA: "Rögzítés +" / "+ Rögzítés" open the capture sheet (S-tasks' CaptureSheet,
 * frame lifeos/capture; request R-S-ma-02) and "+ Első szokás" the new-habit sheet (S-habits'
 * HabitSheet, frame lifeos/habit-form). Both re-read GET /lifeos/today when they write, so the new
 * row appears on Ma. The habit sheet mounts per opening (`key`) so every new habit starts blank
 * with its own idempotency key.
 */
export function TodayPage() {
  const { t, i18n } = useTranslation();
  // null until the first "Rögzítés": the sheet reads GET /tasks (the logical today), which Ma never needs otherwise.
  const [capturing, setCapturing] = useState<boolean | null>(null);
  const [newHabit, setNewHabit] = useState(0);
  const lifeos = useLifeosToday();
  const day = lifeos.data;

  // The APP's language, not the browser's, and the LOGICAL day (a day that starts at 04:00 is still
  // yesterday at 02:00) once the server has said which day it is.
  const date = dayLabel(day?.today ?? null, i18n.language);
  const count = day ? dayCount(day) : null;
  const timeZone = day?.timezone ?? null;

  return (
    <Screen top="root">
      {/* Header and ledger line are one group, 8 apart (`maHeader`). No page title: the lit tab says where you are. */}
      <div className="flex flex-col gap-2">
        <ScreenHeader
          kind="greet"
          title={t('home.greeting')}
          sub={<span className="block truncate first-letter:uppercase">{date}</span>}
          trailing={<NotificationBell />}
        />
        <LedgerLine wallet={day?.wallet} failed={lifeos.isError && !day} />
      </div>

      <TodayHero
        count={count}
        earnedMinor={day ? earnedTodayMinor(day) : null}
        pending={lifeos.isPending}
        failed={lifeos.isError && !day}
        onRetry={() => void lifeos.refetch()}
      />

      {day ? <TodayDraw day={day} place="open" /> : null}

      <TodayWorkout pointsFull={day?.workout.due ? day.workout.pointsFull : null} />

      {lifeos.isPending ? (
        <TodayHabitsSkeleton />
      ) : day ? (
        <>
          <TodayHabits habits={day.habits ?? null} timeZone={timeZone} onFirst={() => setNewHabit((n) => Math.abs(n) + 1)} />
          <TodayTasks tasks={day.tasks ?? null} today={day.today} timeZone={timeZone} onCapture={() => setCapturing(true)} />
          <TodayDraw day={day} place="settled" />
        </>
      ) : null}

      <TodayNutrition date={todayLocal()} />

      {/* KÖVETKEZŐ (S-calendar, plan Phase 5): the next event within 7 days; not drawn without one. */}
      <NextEventSection next={day?.nextEvent} today={todayLocal()} />

      {/* The permanent way to the exercise library (D2), last on Ma (owner, 2026-10-17; round B
          draws it with the barbell still and a line saying what is there). */}
      <RowStack open>
        <ListRow
          lead={<Pic slot="equip-barbell" width={48} />}
          title={t('nav.library')}
          sub={t('today.librarySub')}
          to="/library"
          chevron
        />
      </RowStack>

      {capturing !== null ? <CaptureSheet open={capturing} onClose={() => setCapturing(false)} /> : null}
      {/* newHabit > 0: the sheet is open; closing negates it, so the closed sheet keeps its key while it slides out. */}
      <HabitSheet key={Math.abs(newHabit)} open={newHabit > 0} onClose={() => setNewHabit((n) => -Math.abs(n))} />
    </Screen>
  );
}

/** Local calendar day — the nutrition screen's own day key (toISOString() is UTC). */
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

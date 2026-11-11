import type { DayKey, EventCreate } from '../../lib/lifeos-api';
import { addDays, addMinutes, deviceToday } from './calendarFormat';

type TFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * The capture sheet's Esemény half (frame `lifeos/capture`, "Hova?" Feladat / Esemény), the part of
 * it that is the calendar's: its words, the day it lands on and the `POST /events` body. The sheet
 * itself is S-tasks' (`features/capture/CaptureSheet.tsx`); it imports this file (request
 * R-S-calendar-02), so an event is written the same way from the capture and from the event sheet.
 */

/** The one reminder a captured timed event gets: an hour before the start ("Emlékeztető 1 órával előtte"). */
export const CAPTURE_EVENT_REMINDER = 60;
/** A captured event at a time lasts an hour until it is edited on its page. */
export const CAPTURE_EVENT_LENGTH = 60;

/** The words of the capture's "Hova?" group and of the Esemény start field. */
export function captureWords(t: TFn) {
  return {
    where: t('calendar.capture.where'),
    task: t('calendar.capture.task'),
    event: t('calendar.capture.event'),
    start: t('calendar.form.start'),
    reminderHint: t('calendar.capture.reminderHint'),
    startRequired: t('calendar.form.startRequired'),
    failed: t('calendar.failed'),
  };
}

/**
 * The day a captured event lands on. Events follow the CALENDAR day (B-calendar api.md), so "Ma" is
 * the device's date, not the logical LifeOS day.
 */
export function captureEventDay(due: 'today' | 'tomorrow' | 'date', date: DayKey): DayKey {
  const today = deviceToday();
  return due === 'today' ? today : due === 'tomorrow' ? addDays(today, 1) : date;
}

/** The `POST /events` body of a capture: all day, or at `time` for an hour with the one reminder. */
export function captureEventBody(clientKey: string, title: string, date: DayKey, time: string | null): EventCreate {
  return {
    clientKey,
    title,
    date,
    ...(time
      ? { allDay: false, startTime: time, endTime: addMinutes(time, CAPTURE_EVENT_LENGTH), reminders: [CAPTURE_EVENT_REMINDER] }
      : { allDay: true }),
  };
}

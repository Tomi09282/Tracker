import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { ListRow } from '../../ui/data/ListRow';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { DateTrigger } from '../../ui/primitives/DateTrigger';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextArea } from '../../ui/primitives/TextArea';
import { TimeTrigger } from '../../ui/primitives/TimeTrigger';
import { WeekdayChips } from '../../ui/primitives/WeekdayChips';
import type { CalendarEvent, DayKey, EventCreate, EventPatch, EventRecurrence, ReminderOffset } from '../../lib/lifeos-api';
import { mintEventKey, retryable, useCreateEvent, useUpdateEvent } from './calendarApi';
import { addDays, addMinutes, minutesBetween, ruleText, shortDay, weekdayOf } from './calendarFormat';

/** The server's bounds (`POST /events`, api.md): title 1..120, place 1..160, notes 1..1000, at most 14 days. */
const TITLE_MAX = 120;
const LOCATION_MAX = 160;
const NOTES_MAX = 1000;
const SPAN_MAX_DAYS = 14;

/** event-form's duration words (they set Vége): 15 / 30 / 45 perc, 1 / 2 óra. */
const DURATIONS = [15, 30, 45, 60, 120] as const;
/** event-form's reminder words: Kezdéskor 0 · 15 perc · 1 óra · 1 nap (minutes before the start). */
const REMINDERS: readonly ReminderOffset[] = [0, 15, 60, 1440];

type RuleKind = 'none' | EventRecurrence['type'];
const RULE_KINDS: readonly RuleKind[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export type EventSheetTarget = { mode: 'new'; date: DayKey } | { mode: 'edit'; event: CalendarEvent };

/**
 * "Új esemény" — frame `lifeos/event-form` (design round B; `event-form.part.js`): the kit bottom
 * sheet over the dimmed Naptár, its body 16 apart, in f_app's order:
 *
 *   Megnevezés        the kit field (focus = the lime line and caret)
 *   Időpontban / Egész nap   an equal-cell segmented switch on the hairline (it changes the form)
 *   Dátum · Kezdés · Vége    three 106 pt underline fields 18 apart: the date in words ("okt. 21."),
 *                     the two clock figures in mono. Egész nap: Dátum · Vége as two dates (the
 *                     first and the last day, at most 14)
 *   15 perc … 2 óra   the duration words as a lime-marked chip row; one SETS Vége (start + it) and
 *                     is marked while Vége is exactly that far from Kezdés
 *   Helyszín          the kit field
 *   Ismétlődés        a list row with its value ("Nem ismétlődik") and the chevron; it opens the
 *                     rule in place: Nincs · Naponta · Hetente · Havonta · Évente as chips (a weekly
 *                     rule adds the kit WeekdayChips) and the optional last day
 *   Emlékeztető       Kezdéskor · 15 perc · 1 óra · 1 nap, multi-select chips (offsets 0/15/60/1440)
 *   Mentés            THE lime pill of the sheet
 *
 * Behaviour the frame does not draw (Q4, the API offers it): Jegyzet (the notes event-detail shows
 * under JEGYZET), editing (title "Esemény szerkesztése"; every occurrence moves with the event —
 * api.md: single-occurrence edits do not exist), an impossible combination (Vége before Kezdés on
 * the same day ends after midnight, as the server reads it), the 409s (no time zone yet, 500 events)
 * as one danger line without "Újra", a failed write (the danger dot and "Újra" in the header, the
 * words kept). One `clientKey` per opened form: a double tap creates one event. Not queued offline.
 */
export function EventSheet({ target, onClose }: { target: EventSheetTarget | null; onClose: () => void }) {
  const key = target ? (target.mode === 'edit' ? `edit-${target.event.id}-${target.event.updatedAt}` : `new-${target.date}`) : 'closed';
  return <EventSheetBody key={key} target={target} onClose={onClose} />;
}

/** A sensible first start for a new event: the next whole hour today, otherwise 09:00. */
function firstStart(date: DayKey): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (date !== today || now.getHours() >= 23) return '09:00';
  return `${String(now.getHours() + 1).padStart(2, '0')}:00`;
}

/** The rule a kind means on a first day: weekly on its weekday, monthly on its day, yearly on its date. */
function ruleFor(kind: RuleKind, date: DayKey, previous: EventRecurrence | null): EventRecurrence | null {
  if (kind === 'none') return null;
  if (previous && previous.type === kind) return previous;
  if (kind === 'daily') return { type: 'daily', interval: 1 };
  if (kind === 'weekly') return { type: 'weekly', weekdayMask: 1 << weekdayOf(date) };
  if (kind === 'monthly') return { type: 'monthly', day: Number(date.slice(8, 10)) || 1 };
  return { type: 'yearly' };
}

function daysBetween(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1) - Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1)) / 86_400_000);
}

function EventSheetBody({ target, onClose }: { target: EventSheetTarget | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const editing = target?.mode === 'edit' ? target.event : null;
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const [clientKey] = useState(mintEventKey);
  const ruleId = useId();

  const startDate: DayKey = editing?.date ?? (target?.mode === 'new' ? target.date : '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [date, setDate] = useState<string>(startDate);
  const [endDate, setEndDate] = useState<string>(editing?.allDay ? editing.endDate : '');
  const initialStart = editing?.startTime ?? (startDate ? firstStart(startDate) : '09:00');
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(editing ? (editing.endTime ?? '') : addMinutes(initialStart, 60));
  const [location, setLocation] = useState(editing?.location ?? '');
  const [rule, setRule] = useState<EventRecurrence | null>(editing?.recurrence ?? null);
  const [until, setUntil] = useState<string>(editing?.untilDate ?? '');
  const [ruleOpen, setRuleOpen] = useState(false);
  const [reminders, setReminders] = useState<ReminderOffset[]>(editing?.reminders ?? []);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [tried, setTried] = useState(false);

  const write = editing ? update : create;
  const failure = write.error;
  const span = allDay && date && endDate ? daysBetween(date, endDate) : 0;

  const titleError = tried && !title.trim() ? t('calendar.form.titleRequired') : undefined;
  const dateError = tried && !date ? t('calendar.form.dateRequired') : undefined;
  const startError = tried && !allDay && !start ? t('calendar.form.startRequired') : undefined;
  const endDateError = allDay && endDate && date && (span < 0 || span >= SPAN_MAX_DAYS) ? t('calendar.form.spanInvalid') : undefined;
  const untilError = rule && until && date && until < date ? t('calendar.form.untilInvalid') : undefined;

  const length = !allDay && start && end ? minutesBetween(start, end) : null;
  const ruleKind: RuleKind = rule?.type ?? 'none';
  const ruleValue = rule && date ? ruleText(rule, date, locale, t) : t('calendar.form.noRepeat');

  const setKind = (kind: RuleKind) => {
    const next = ruleFor(kind, date || startDate, rule);
    setRule(next);
    if (!next) setUntil('');
  };

  const toggleReminder = (m: ReminderOffset) =>
    setReminders((now) => (now.includes(m) ? now.filter((x) => x !== m) : [...now, m].sort((a, b) => a - b)));

  const submit = () => {
    setTried(true);
    if (!title.trim() || !date || (!allDay && !start) || endDateError || untilError) return;
    const body: Omit<EventCreate, 'clientKey'> = {
      title: title.trim().slice(0, TITLE_MAX),
      location: location.trim() ? location.trim().slice(0, LOCATION_MAX) : null,
      notes: notes.trim() ? notes.trim().slice(0, NOTES_MAX) : null,
      allDay,
      date,
      recurrence: rule,
      untilDate: rule && until ? until : null,
      reminders,
      ...(allDay ? { endDate: endDate || date } : { startTime: start, endTime: end || null }),
    };
    if (editing) {
      // A switch to all-day drops the times; a switch back names them again (api.md: merged over the stored ones).
      const patch: EventPatch = allDay ? { ...body, startTime: undefined, endTime: undefined } : { ...body, endDate: null };
      update.mutate({ id: editing.id, patch: JSON.parse(JSON.stringify(patch)) as EventPatch }, { onSuccess: onClose });
    } else {
      create.mutate({ clientKey, ...body }, { onSuccess: onClose });
    }
  };

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={editing ? t('calendar.form.editTitle') : t('calendar.form.newTitle')}
      status={write.isPending ? 'busy' : write.isError ? 'error' : 'idle'}
      onRetry={failure && retryable(failure) ? submit : undefined}
    >
      {/*
        The frame's sheet stands where it stands (top at 189 pt on a 874 pt screen, the Naptár header and
        month line still visible above it) and ends with Emlékeztető and Mentés. Jegyzet, which the frame
        does not draw, would make the sheet 83 pt taller; so the fields scroll inside a region of the frame's
        height (874 - 387 = 487 pt) and Jegyzet sits below the first view. Mentés stays docked under the region.
      */}
      <div
        className="-mx-1 flex max-h-[calc(100dvh-387px)] min-h-40 flex-col gap-4 overflow-y-auto overscroll-contain px-1 [&>*]:shrink-0" // token-lint-disable: event-form's sheet top (189 pt of 874) = 100dvh - 387 pt for the field region
      >
      <Field
        label={t('calendar.form.name')}
        value={title}
        maxLength={TITLE_MAX}
        autoFocus={!editing}
        error={titleError}
        onChange={(e) => setTitle(e.target.value)}
      />

      <Segmented
        layout="cells"
        label={t('calendar.form.kind')}
        value={allDay ? 'allDay' : 'at'}
        onChange={(v) => setAllDay(v === 'allDay')}
        options={[
          { value: 'at', label: t('calendar.form.atTime') },
          { value: 'allDay', label: t('calendar.form.allDay') },
        ]}
      />

      <div
        className="flex items-start gap-[18px]" // token-lint-disable: event-form's three fields stand 18 apart (event-form.part.js gap 18, 3 x 106 + 2 x 18 = 354 = the column)
      >
        <DateTrigger
          label={t('calendar.form.date')}
          value={date}
          onChange={setDate}
          glyph="chevron"
          format={(value, loc) => shortDay(value, loc)}
          error={dateError}
          // event-form draws the bare "okt. 21." over the hairline: the field keeps its hit area and its
          // native picker, only the kit's chevron is not drawn (request R-S-lifeos-polish-02: a bare DateTrigger).
          className="w-[106px] min-w-0 flex-1 [&_svg]:hidden"
        />
        {allDay ? (
          <DateTrigger
            label={t('calendar.form.end')}
            value={endDate}
            onChange={setEndDate}
            min={date || undefined}
            max={date ? addDays(date, SPAN_MAX_DAYS - 1) : undefined}
            glyph="chevron"
            placeholder={date ? shortDay(date, locale) : undefined}
            format={(value, loc) => shortDay(value, loc)}
            error={endDateError}
            className="w-[106px] min-w-0 flex-1"
          />
        ) : (
          <>
            <TimeTrigger
              label={t('calendar.form.start')}
              value={start}
              face="mono"
              onChange={(v) => {
                // Moving the start keeps the length (as the server moves an event).
                if (v && start && end && length !== null) setEnd(addMinutes(v, length));
                setStart(v);
              }}
              error={startError}
              className="w-[106px] min-w-0 flex-1"
            />
            <TimeTrigger
              label={t('calendar.form.end')}
              value={end}
              face="mono"
              onChange={setEnd}
              className="w-[106px] min-w-0 flex-1"
            />
          </>
        )}
      </div>

      {!allDay ? (
        <ChipRow role="radiogroup" label={t('calendar.form.duration')}>
          {DURATIONS.map((m) => (
            <Chip key={m} role="radio" selected={length === m} disabled={!start} onClick={() => start && setEnd(addMinutes(start, m))}>
              {durationWord(m, t)}
            </Chip>
          ))}
        </ChipRow>
      ) : null}

      <Field
        label={t('calendar.form.location')}
        value={location}
        maxLength={LOCATION_MAX}
        onChange={(e) => setLocation(e.target.value)}
      />

      <div className="flex flex-col gap-2">
        <ListRow
          title={t('calendar.form.repeat')}
          value={<span className="text-cap text-text-2">{ruleValue}</span>}
          chevron
          aria-expanded={ruleOpen}
          aria-controls={ruleId}
          onClick={() => setRuleOpen((o) => !o)}
        />
        {ruleOpen ? (
          <div id={ruleId} className="flex flex-col gap-4">
            <ChipRow role="radiogroup" label={t('calendar.form.repeat')} wrap>
              {RULE_KINDS.map((k) => (
                <Chip key={k} role="radio" selected={ruleKind === k} onClick={() => setKind(k)}>
                  {t(`calendar.form.repeatKind.${k}`)}
                </Chip>
              ))}
            </ChipRow>
            {rule?.type === 'weekly' ? (
              <WeekdayChips
                label={t('calendar.form.repeatDays')}
                value={rule.weekdayMask}
                onChange={(mask) => setRule({ type: 'weekly', weekdayMask: mask || 1 << weekdayOf(date || startDate) })}
              />
            ) : null}
            {rule ? (
              <DateTrigger
                label={t('calendar.form.until')}
                value={until}
                onChange={setUntil}
                min={date || undefined}
                glyph="chevron"
                placeholder={t('calendar.form.optional')}
                format={(value, loc) => shortDay(value, loc)}
                error={untilError}
                className="w-[165px] min-w-0"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-cap-m text-text-2">{t('calendar.form.reminder')}</span>
        <ChipRow label={t('calendar.form.reminder')} wrap>
          {REMINDERS.map((m) => (
            <Chip key={m} role="checkbox" selected={reminders.includes(m)} onClick={() => toggleReminder(m)}>
              {m === 0 ? t('calendar.form.atStart') : durationWord(m, t)}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <TextArea
        label={t('calendar.form.notes')}
        placeholder={t('calendar.form.optional')}
        value={notes}
        maxLength={NOTES_MAX}
        maxRows={5}
        onChange={(e) => setNotes(e.target.value)}
      />
      </div>

      {write.isError ? (
        <NoticeLine tone="danger" role="alert">
          {failure && !retryable(failure) ? t('calendar.form.refused') : t('calendar.failed')}
        </NoticeLine>
      ) : null}

      <Pressable variant="primary" size="lg" className="w-full" busy={write.isPending} onClick={submit}>
        {t('common.save')}
      </Pressable>
    </Sheet>
  );
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** "15 perc", "1 óra", "1 nap" — a length or an offset as the form's words say it. */
export function durationWord(minutes: number, t: TFn): string {
  if (minutes % 1440 === 0) return t('calendar.form.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('calendar.form.hours', { count: minutes / 60 });
  return t('calendar.form.minutes', { count: minutes });
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Field } from '../../ui/primitives/Field';
import { TextArea } from '../../ui/primitives/TextArea';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { RecurrencePicker } from '../../ui/primitives/RecurrencePicker';
import { weekdayLong, type WeekdayIndex } from '../../ui/primitives/weekdays';
import type { DayKey, Recurrence, Task, TaskCreate, TaskPatch, TaskPriority } from '../../lib/lifeos-api';
import { DueChips, DueFields, FieldGroup, ZoneDoor, dueOnFor, type DueChoice } from './formParts';
import {
  PRIORITIES,
  PRIORITY_KEY,
  addDays,
  coinsLabel,
  maskDays,
  mintClientKey,
  retryable,
  useCreateTask,
  useDeleteTask,
  useUpdateTask,
} from './tasksData';

/** The server's bounds (`POST /tasks`, api.md): title 1..120, notes ..1000, a daily rule every 1..30 days. */
const TITLE_MAX = 120;
const NOTES_MAX = 1000;
const INTERVAL_MAX = 30;

export type TaskSheetTarget = { mode: 'new'; due: DueChoice } | { mode: 'edit'; task: Task };

/**
 * "Új teendő" — frame `lifeos/task-form` (design round B; `task-form.body.js`): the kit bottom
 * sheet over the Feladatok list, its body 16 apart:
 *
 *   Cím            the kit field (focus = the lime line and caret)
 *   Fontosság      the three priorities as an equal-cell segmented switch on the hairline, each with
 *                  what it pays ("Közepes · 10") — the value is the rule in force, read from the
 *                  tasks themselves (`priorityValues`); a priority no task shows yet is the word alone
 *   Határidő       Nincs · Ma · Holnap · Dátum as a lime-marked chip row
 *   Dátum + Határidő ideje   two 165 pt fields 24 apart (the date only for "Dátum")
 *   Ismétlődés     the G-lifeos `RecurrencePicker` (Nincs · Naponta · Hetente · Havonta, the weekday
 *                  row for Hetente) and its summary line ("Minden vasárnap 20:00")
 *   Jegyzet        the kit text area, "opcionális"
 *   Létrehozás     THE lime pill of the sheet
 *
 * The same sheet edits a task the frame does not draw (Q4: what f_app lets a user do stays): the
 * title is "Teendő szerkesztése", the pill "Mentés", and "Törlés" follows as a danger text link
 * that asks first (`ConfirmSheet`). A recurring task is edited as its RULE (the template): the
 * server redraws the open instances from today on, so what the user changes is what repeats.
 *
 * A failed write keeps the sheet and every value: the danger dot and "Újra" in the header (when a
 * retry can help) and one danger line in the body.
 */
export function TaskSheet({
  target,
  onClose,
  today,
  values,
}: {
  target: TaskSheetTarget | null;
  onClose: () => void;
  today: DayKey | null;
  values: Partial<Record<TaskPriority, number>>;
}) {
  const { t } = useTranslation();
  const title = target?.mode === 'edit' ? t('tasks.editTitle') : t('tasks.newTitle');
  // The body remounts per opened target, so a new form starts empty and an edit starts on its task.
  const key = target ? (target.mode === 'edit' ? `edit-${target.task.id}` : `new-${target.due}`) : 'closed';
  return (
    <TaskSheetBody key={key} open={target !== null} target={target} title={title} onClose={onClose} today={today} values={values} />
  );
}

function initialDue(target: TaskSheetTarget | null, today: DayKey | null): { due: DueChoice; date: string } {
  if (!target) return { due: 'today', date: '' };
  if (target.mode === 'new') return { due: target.due, date: '' };
  const { dueOn } = target.task;
  if (!dueOn) return { due: 'none', date: '' };
  if (today && dueOn === today) return { due: 'today', date: '' };
  if (today && dueOn === addDays(today, 1)) return { due: 'tomorrow', date: '' };
  return { due: 'date', date: dueOn };
}

function TaskSheetBody({
  open,
  target,
  title,
  onClose,
  today,
  values,
}: {
  open: boolean;
  target: TaskSheetTarget | null;
  title: string;
  onClose: () => void;
  today: DayKey | null;
  values: Partial<Record<TaskPriority, number>>;
}) {
  const { t, i18n } = useTranslation();
  const editing = target?.mode === 'edit' ? target.task : null;
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [clientKey] = useState(mintClientKey);

  const start = initialDue(target, today);
  const [name, setName] = useState(editing?.title ?? '');
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? 2);
  const [due, setDue] = useState<DueChoice>(start.due);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(editing?.dueTime ?? '');
  const [rule, setRule] = useState<Recurrence | null>(editing?.recurrence ?? null);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState(false);

  const logicalToday = today ?? '';
  const dueOn = today ? dueOnFor(due, today, date) : null;

  const nameError = tried && !name.trim() ? t('tasks.titleRequired') : undefined;
  const dateError = tried && due === 'date' && !date ? t('tasks.dateRequired') : undefined;
  // f_app: a repeating task needs its first day (the server: `recurrence` needs `dueOn`).
  const ruleError = tried && rule && !dueOn ? t('tasks.repeatNeedsDue') : undefined;

  const write = editing ? update : create;
  const failed = write.isError || remove.isError;
  const failure = write.error ?? remove.error;

  const summary = useMemo(() => (rule ? ruleSummary(rule, time, i18n.language, t) : undefined), [rule, time, i18n.language, t]);

  const submit = () => {
    setTried(true);
    if (!today || !name.trim() || (due === 'date' && !date) || (rule && !dueOn)) return;
    const body = {
      title: name.trim().slice(0, TITLE_MAX),
      priority,
      dueOn,
      dueTime: dueOn && time ? time : null,
      recurrence: dueOn ? rule : null,
    };
    const trimmedNotes = notes.trim().slice(0, NOTES_MAX);
    if (editing) {
      const patch: TaskPatch = { ...body, notes: trimmedNotes || null };
      // A template cannot drop its rule (409): it is deleted instead, so the rule stays sent.
      update.mutate({ id: editing.id, patch }, { onSuccess: onClose });
    } else {
      const created: TaskCreate = { clientKey, ...body, ...(trimmedNotes ? { notes: trimmedNotes } : {}) };
      create.mutate(created, { onSuccess: onClose });
    }
  };

  const retry = failure && retryable(failure) ? (remove.isError && editing ? () => remove.mutate(editing.id, { onSuccess: onClose }) : submit) : undefined;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={title}
        status={write.isPending || remove.isPending ? 'busy' : failed ? 'error' : 'idle'}
        onRetry={retry}
      >
        <Field
          label={t('tasks.fieldTitle')}
          value={name}
          maxLength={TITLE_MAX}
          autoFocus={!editing}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
        />

        <FieldGroup label={t('tasks.priorityLabel')}>
          {() => (
            <Segmented<`${TaskPriority}`>
              layout="cells"
              label={t('tasks.priorityLabel')}
              options={PRIORITIES.map((p) => ({
                value: `${p}` as `${TaskPriority}`,
                label:
                  values[p] !== undefined
                    ? t('tasks.priorityValue', { label: t(`tasks.priority.${PRIORITY_KEY[p]}`), coins: coinsLabel(values[p] ?? 0).replace('+', '') })
                    : t(`tasks.priority.${PRIORITY_KEY[p]}`),
              }))}
              value={`${priority}` as `${TaskPriority}`}
              onChange={(v) => setPriority(Number(v) as TaskPriority)}
            />
          )}
        </FieldGroup>

        <FieldGroup label={t('tasks.dueLabel')}>
          {() => <DueChips label={t('tasks.dueLabel')} choices={['none', 'today', 'tomorrow', 'date']} value={due} onChange={setDue} />}
        </FieldGroup>

        <DueFields
          date={date}
          onDate={setDate}
          time={time}
          onTime={setTime}
          showDate={due === 'date'}
          showTime={due !== 'none'}
          timeLabel={t('tasks.dueTime')}
          min={editing ? undefined : logicalToday || undefined}
          dateError={dateError}
        />

        <RecurrencePicker
          label={t('tasks.repeatLabel')}
          value={rule}
          onChange={(next) => setRule(next?.type === 'daily' && (next.interval ?? 1) > INTERVAL_MAX ? { type: 'daily', interval: INTERVAL_MAX } : next)}
          anchor={dueOn ?? logicalToday}
          labels={{
            none: t('tasks.repeatKind.none'),
            daily: t('tasks.repeatKind.daily'),
            weekly: t('tasks.repeatKind.weekly'),
            monthly: t('tasks.repeatKind.monthly'),
            interval: t('tasks.repeatInterval'),
            monthDay: t('tasks.repeatMonthDay'),
          }}
          hint={summary}
          error={ruleError}
        />

        <TextArea
          label={t('tasks.notes')}
          placeholder={t('tasks.optional')}
          value={notes}
          maxLength={NOTES_MAX}
          maxRows={5}
          onChange={(e) => setNotes(e.target.value)}
        />

        {failed ? (
          <NoticeLine tone="danger" role="alert">
            {t('tasks.failed')}
          </NoticeLine>
        ) : null}

        {/* No logical today = LifeOS has not started (no zone on the server): nothing can be written,
            so the pill is off - never a lime pill that does nothing - and the door leads to the zone. */}
        {!today ? <ZoneDoor /> : null}

        <Pressable
          variant="primary"
          size="lg"
          className="w-full"
          busy={write.isPending}
          disabled={remove.isPending || !today}
          onClick={submit}
        >
          {editing ? t('common.save') : t('tasks.create')}
        </Pressable>

        {editing ? (
          <TextLink text="body" tone="danger" className="self-start" disabled={write.isPending} onClick={() => setAsking(true)}>
            {t('common.delete')}
          </TextLink>
        ) : null}
      </Sheet>

      {editing ? (
        <ConfirmSheet
          open={asking}
          onClose={() => setAsking(false)}
          title={t('tasks.deleteTitle')}
          message={t('tasks.deleteBody')}
          confirmLabel={t('common.delete')}
          busy={remove.isPending}
          onConfirm={() =>
            remove.mutate(editing.id, {
              onSuccess: () => {
                setAsking(false);
                onClose();
              },
              onError: () => setAsking(false),
            })
          }
        />
      ) : null}
    </>
  );
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * The summary line under the recurrence picker (task-form: "Minden vasárnap 20:00"), from f_app's
 * `describeRecurrence` words: every day / every N days / the chosen weekdays / a day of the month,
 * then the due time when there is one.
 */
export function ruleSummary(rule: Recurrence, time: string, locale: string, t: TFn): string {
  let words: string;
  if (rule.type === 'daily') words = (rule.interval ?? 1) > 1 ? t('tasks.summary.everyN', { n: rule.interval }) : t('tasks.summary.everyDay');
  else if (rule.type === 'monthly') words = t('tasks.summary.monthly', { day: rule.day });
  else if (rule.weekdayMask === 127) words = t('tasks.summary.everyDay');
  else if (rule.weekdayMask === 0b0011111) words = t('tasks.summary.weekdays');
  else words = t('tasks.summary.weekly', { days: maskDays(rule.weekdayMask).map((i) => weekdayLong(i as WeekdayIndex, locale)).join(', ') });
  return time ? `${words} ${time}` : words;
}

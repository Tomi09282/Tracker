import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Field } from '../../ui/primitives/Field';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { NumberStepper } from '../../ui/primitives/NumberStepper';
import { Pressable } from '../../ui/primitives/Pressable';
import { TimeTrigger } from '../../ui/primitives/TimeTrigger';
import { WeekdayChips } from '../../ui/primitives/WeekdayChips';
import type { Habit, HabitCreate, HabitKind, HabitPatch, HabitSchedule } from '../../lib/lifeos-api';
import { newClientKey, useCreateHabit, usePatchHabit } from './habitsApi';

/**
 * "Új szokás" / "Szokás szerkesztése" — frame `lifeos/habit-form` (design round B, Figma 182:276):
 * the kit bottom sheet over the dimmed page.
 *
 * Composition, as `habit-form.part.js`: the kind as the equal-cell switch (Jó szokás / Rossz
 * szokás) · Név (the underline field, focused on a new habit) · Ütemezés: the schedule chips
 * (Naponta / Adott napok / Heti N×), the weekday chips under "Adott napok" and the one hint ·
 * Napi cél + Egység side by side · Érme / teljesítés + Levonás mulasztásért with "legfeljebb 50" ·
 * Emlékeztető ideje with its hint · the sheet's pill (the screen's one lime pill).
 *
 * Undrawn cases, in the same language (f_app `app/habit/[id].tsx`): a bad habit takes only the
 * name, the coins and its explanation line (the API refuses schedule fields on it); "Heti N×"
 * asks how many times with the kit stepper; edit mode has no kind switch (the kind cannot change)
 * and saves with "Mentés"; a field out of range says so in danger under itself; a refused or
 * failed write keeps the sheet open with the danger dot, "Újra" and one line.
 *
 * The coin defaults are the rules in force when this was built (good 10 / bad 15 per success, 5 per
 * miss — api.md "Defaults"); what is shown is what is sent, so the stored habit is what the user saw.
 */

const POINTS_MAX = 50;
const TARGET_MAX = 100;
const NAME_MAX = 80;
const UNIT_MAX = 20;
const DEFAULTS = { good: { success: 10, penalty: 5 }, bad: { success: 15, penalty: 5 } } as const;
const SCHEDULES: readonly HabitSchedule[] = ['daily', 'weekdays', 'times_per_week'];
/** Monday..Friday — the mask the frame draws, and the one its weekend hint describes. */
const WORKDAYS_MASK = 0b0011111;

interface FormState {
  kind: HabitKind;
  name: string;
  scheduleType: HabitSchedule;
  weekdayMask: number;
  timesPerWeek: number;
  targetCount: string;
  unit: string;
  pointsSuccess: string;
  pointsPenalty: string;
  reminderTime: string;
}

function initial(habit?: Habit): FormState {
  if (habit) {
    return {
      kind: habit.kind,
      name: habit.name,
      scheduleType: habit.scheduleType,
      weekdayMask: habit.scheduleType === 'weekdays' ? habit.weekdayMask : WORKDAYS_MASK,
      timesPerWeek: habit.timesPerWeek ?? 3,
      targetCount: String(habit.targetCount),
      unit: habit.unit ?? '',
      pointsSuccess: String(habit.pointsSuccess),
      pointsPenalty: String(habit.pointsPenalty),
      reminderTime: habit.reminderTime ?? '',
    };
  }
  return {
    kind: 'good',
    name: '',
    scheduleType: 'daily',
    weekdayMask: WORKDAYS_MASK,
    timesPerWeek: 3,
    targetCount: '1',
    unit: '',
    pointsSuccess: String(DEFAULTS.good.success),
    pointsPenalty: String(DEFAULTS.good.penalty),
    reminderTime: '',
  };
}

/** A whole number in [min, max] typed in a field, or null. */
function intIn(value: string, min: number, max: number) {
  if (!/^\d{1,3}$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export interface HabitSheetProps {
  open: boolean;
  onClose: () => void;
  /** Edit this habit; without it the sheet creates one. */
  habit?: Habit;
}

export function HabitSheet({ open, onClose, habit }: HabitSheetProps) {
  const { t } = useTranslation();
  const create = useCreateHabit();
  const patch = usePatchHabit();
  const [form, setForm] = useState<FormState>(() => initial(habit));
  const [tried, setTried] = useState(false);
  // One idempotency key per opened sheet: a retried create answers the first habit, never a second.
  const clientKey = useRef(newClientKey());
  const nameRef = useRef<HTMLInputElement>(null);
  const editing = habit !== undefined;
  const write = editing ? patch : create;

  useEffect(() => {
    if (!open) return;
    setForm(initial(habit));
    setTried(false);
    create.reset();
    patch.reset();
    clientKey.current = newClientKey();
    // The new habit's name is where the frame puts the caret.
    if (!habit) window.setTimeout(() => nameRef.current?.focus(), 0);
    // Reset only when the sheet opens (or opens on another habit), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const bad = form.kind === 'bad';

  // Validation (the server's bounds, api.md POST /habits); shown once the user tried to save.
  const name = form.name.trim();
  const target = intIn(form.targetCount, 1, TARGET_MAX);
  const success = intIn(form.pointsSuccess, 0, POINTS_MAX);
  const penalty = intIn(form.pointsPenalty, 0, POINTS_MAX);
  const errors = {
    name: name.length === 0 ? t('habits.form.nameRequired') : undefined,
    days: !bad && form.scheduleType === 'weekdays' && form.weekdayMask === 0 ? t('habits.form.pickDay') : undefined,
    target: !bad && target === null ? (Number(form.targetCount) > TARGET_MAX ? t('habits.form.max', { count: TARGET_MAX }) : t('habits.form.min')) : undefined,
    success: success === null ? t('habits.form.max', { count: POINTS_MAX }) : undefined,
    penalty: penalty === null ? t('habits.form.max', { count: POINTS_MAX }) : undefined,
  };
  const valid = Object.values(errors).every((e) => e === undefined);
  const shown = (e: string | undefined) => (tried ? e : undefined);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!valid || write.isPending || success === null || penalty === null) return;
    const coins = { pointsSuccess: success, pointsPenalty: penalty };
    const schedule: HabitPatch = bad
      ? {}
      : {
          scheduleType: form.scheduleType,
          ...(form.scheduleType === 'weekdays' ? { weekdayMask: form.weekdayMask } : {}),
          ...(form.scheduleType === 'times_per_week' ? { timesPerWeek: form.timesPerWeek } : {}),
          targetCount: target ?? 1,
          unit: form.unit.trim() ? form.unit.trim().slice(0, UNIT_MAX) : null,
          reminderTime: form.reminderTime || null,
        };
    const done = { onSuccess: () => onClose() };
    if (editing) {
      patch.mutate({ id: habit.id, patch: { name: name.slice(0, NAME_MAX), ...coins, ...schedule } }, done);
    } else {
      const body: HabitCreate = { clientKey: clientKey.current, kind: form.kind, name: name.slice(0, NAME_MAX), ...coins, ...schedule };
      create.mutate(body, done);
    }
  };

  // Every refusal (the live-habit cap, a zone not set yet) and every failure: one line, the sheet stays.
  const failure = write.isError ? t('habits.failed') : null;

  // The schedule chips are a radiogroup: the arrows move the choice and the focus (as RecurrencePicker).
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const onChipsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const to = (SCHEDULES.indexOf(form.scheduleType) + dir + SCHEDULES.length) % SCHEDULES.length;
    const next = SCHEDULES[to];
    if (next) set('scheduleType', next);
    chips.current[to]?.focus();
  };
  const scheduleWords: Record<HabitSchedule, string> = {
    daily: t('habits.scheduleDaily'),
    weekdays: t('habits.form.weekdays'),
    times_per_week: t('habits.form.timesPerWeek'),
  };
  const scheduleHint =
    form.scheduleType === 'weekdays' && form.weekdayMask === WORKDAYS_MASK
      ? t('habits.form.weekendHint')
      : form.scheduleType === 'times_per_week'
        ? t('habits.form.perWeekHint')
        : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? t('habits.form.editTitle') : t('habits.new')}
      status={write.isPending ? 'busy' : write.isError ? 'error' : 'idle'}
      onRetry={write.isError ? () => submit() : undefined}
    >
      <form noValidate onSubmit={submit} className="flex w-full flex-col gap-4">
        {editing ? null : (
          <Segmented
            layout="cells"
            label={t('habits.form.kind')}
            options={[
              { value: 'good', label: t('habits.form.kindGood') },
              { value: 'bad', label: t('habits.form.kindBad') },
            ]}
            value={form.kind}
            onChange={(k) =>
              setForm((f) => ({
                ...f,
                kind: k,
                // f_app: switching the kind resets the coins to that kind's defaults.
                pointsSuccess: String(DEFAULTS[k].success),
                pointsPenalty: String(DEFAULTS[k].penalty),
              }))
            }
          />
        )}

        <Field
          ref={nameRef}
          label={t('habits.form.name')}
          value={form.name}
          maxLength={NAME_MAX}
          enterKeyHint="next"
          error={shown(errors.name)}
          onChange={(e) => set('name', e.target.value)}
        />

        {bad ? (
          <p className="text-cap text-text-2">{t('habits.form.badExplain')}</p>
        ) : (
          <>
            <div role="group" aria-labelledby="habit-schedule-label" className="flex w-full flex-col gap-1">
              <span id="habit-schedule-label" className="text-cap-m text-text-2">
                {t('habits.form.schedule')}
              </span>
              <div className="flex flex-col">
                <div onKeyDown={onChipsKey}>
                  <ChipRow label={t('habits.form.schedule')} role="radiogroup">
                    {SCHEDULES.map((s, i) => (
                      <Chip
                        key={s}
                        ref={(el) => {
                          chips.current[i] = el;
                        }}
                        role="radio"
                        selected={form.scheduleType === s}
                        tabIndex={form.scheduleType === s ? 0 : -1}
                        onClick={() => set('scheduleType', s)}
                      >
                        {scheduleWords[s]}
                      </Chip>
                    ))}
                  </ChipRow>
                </div>
                {form.scheduleType === 'weekdays' ? (
                  <WeekdayChips label={t('habits.form.weekdays')} value={form.weekdayMask} onChange={(m) => set('weekdayMask', m)} />
                ) : null}
                {form.scheduleType === 'times_per_week' ? (
                  <NumberStepper
                    className="mt-2"
                    label={t('habits.form.perWeek')}
                    value={form.timesPerWeek}
                    min={1}
                    max={7}
                    onChange={(n) => set('timesPerWeek', n ?? 1)}
                  />
                ) : null}
              </div>
              {shown(errors.days) ? (
                <p role="alert" className="text-cap text-danger">
                  {errors.days}
                </p>
              ) : scheduleHint ? (
                <p className="text-cap text-text-3">{scheduleHint}</p>
              ) : null}
            </div>

            <div className="grid w-full grid-cols-2 gap-6">
              <Field
                label={t('habits.form.target')}
                inputMode="numeric"
                value={form.targetCount}
                error={shown(errors.target)}
                onChange={(e) => set('targetCount', e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
              <Field
                label={t('habits.form.unit')}
                placeholder={t('habits.form.unitPlaceholder')}
                maxLength={UNIT_MAX}
                value={form.unit}
                onChange={(e) => set('unit', e.target.value)}
              />
            </div>
          </>
        )}

        <div className="grid w-full grid-cols-2 gap-6">
          <Field
            label={bad ? t('habits.form.successBad') : t('habits.form.success')}
            inputMode="numeric"
            value={form.pointsSuccess}
            hint={t('habits.form.max', { count: POINTS_MAX })}
            error={shown(errors.success)}
            onChange={(e) => set('pointsSuccess', e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
          <Field
            label={bad ? t('habits.form.penaltyBad') : t('habits.form.penalty')}
            inputMode="numeric"
            value={form.pointsPenalty}
            hint={t('habits.form.max', { count: POINTS_MAX })}
            error={shown(errors.penalty)}
            onChange={(e) => set('pointsPenalty', e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
        </div>

        {bad ? null : (
          <TimeTrigger
            label={t('habits.form.reminder')}
            value={form.reminderTime}
            onChange={(v) => set('reminderTime', v)}
            hint={t('habits.form.reminderHint')}
          />
        )}

        {failure ? (
          <NoticeLine tone="danger" role="alert">
            {failure}
          </NoticeLine>
        ) : null}

        <Pressable variant="primary" size="lg" type="submit" className="w-full" busy={write.isPending}>
          {editing ? t('common.save') : t('habits.form.create')}
        </Pressable>
      </form>
    </Sheet>
  );
}

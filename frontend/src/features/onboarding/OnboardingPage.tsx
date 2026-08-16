import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Check, ChevronLeft, Loader2, CloudOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import {
  useOnboarding,
  useDraftSave,
  useCompleteOnboarding,
  type Limitation,
  type OnboardingProfile,
} from './useOnboarding';

/* ── the step definition ──────────────────────────────────────────────────────────────────── */
// Steps are data, not a switch statement, because two things have to agree with each other: the
// progress bar's denominator and the "which step is unfinished" jump after a failed submit. A
// list keeps them from drifting.
const STEPS = ['goal', 'schedule', 'equipment', 'body', 'limitations'] as const;
type Step = (typeof STEPS)[number];

/** Which required answer lives on which step, so a rejected submit can point at the right one. */
const FIELD_STEP: Record<string, Step> = {
  primary_goal: 'goal',
  experience: 'schedule',
  sessions_per_week: 'schedule',
  training_location: 'equipment',
};

/* ── small building blocks ────────────────────────────────────────────────────────────────── */

/**
 * A single-choice option. Rendered as a Pressable rather than a radio input so it inherits the
 * 44 px floor and all five interaction states; the radio semantics are supplied explicitly.
 */
function Choice({
  selected,
  label,
  description,
  onSelect,
}: {
  selected: boolean;
  label: string;
  description?: string;
  onSelect: () => void;
}) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      variant={selected ? 'primary' : 'secondary'}
      shape="field"
      className="h-auto flex-col items-start gap-1 py-3"
    >
      <span className="text-body font-medium">{label}</span>
      {description ? (
        <span className={cn('text-body-s', selected ? 'opacity-80' : 'text-text-2')}>{description}</span>
      ) : null}
    </Pressable>
  );
}

/** Multi-select chip. Same reasoning as Choice, with checkbox semantics. */
function Toggle({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <Pressable
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      variant={on ? 'primary' : 'secondary'}
      shape="chip"
      icon={on ? <Check className="size-icon-s" aria-hidden /> : undefined}
    >
      {label}
    </Pressable>
  );
}

/**
 * The save indicator.
 *
 * It exists because auto-save without feedback is indistinguishable from not saving: the client
 * closes the tab believing they lost the form. It shows the error state honestly too — a form
 * that says "saved" when the request failed is worse than one that says nothing.
 */
function SaveState({ state, t }: { state: 'idle' | 'saving' | 'saved' | 'error'; t: (k: string) => string }) {
  if (state === 'idle') return null;
  const map = {
    saving: { icon: <Loader2 className="size-icon-s animate-spin" aria-hidden />, text: t('onboarding.saving'), tone: 'text-text-2' },
    saved: { icon: <Check className="size-icon-s" aria-hidden />, text: t('onboarding.saved'), tone: 'text-success' },
    error: { icon: <CloudOff className="size-icon-s" aria-hidden />, text: t('onboarding.saveError'), tone: 'text-danger' },
  }[state];
  return (
    // `polite`, not `assertive`: a save confirmation must never interrupt someone mid-answer.
    <p className={cn('flex items-center gap-2 text-body-s', map.tone)} aria-live="polite">
      {map.icon}
      {map.text}
    </p>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────────────────────── */

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useOnboarding();
  const { save, flush, state: saveState } = useDraftSave();
  const complete = useCompleteOnboarding();

  // The server's `step` is the resume point; local state is where the client is right now. They
  // are separate because moving back to review an answer must not rewind the saved progress.
  const [index, setIndex] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  // Local echo of the profile: the inputs must respond on the keystroke, not on the debounced
  // round trip. Every edit writes here AND queues a save.
  //
  // The ref is not a duplicate of the state — it is the part that has to be correct BETWEEN
  // renders. Ticking three equipment boxes fires three handlers in one tick with no re-render
  // between them, so all three read the same render's `draft` and the last one wins: two ticks
  // silently vanish. Measured, not theorised — three clicks landed one row in the database.
  // The ref is updated synchronously, so each handler sees the previous one's work.
  const [draft, setDraft] = useState<Partial<OnboardingProfile>>({});
  const draftRef = useRef<Partial<OnboardingProfile>>({});
  const profile = useMemo(
    () => ({ ...(data?.profile ?? {}), ...draft }) as Partial<OnboardingProfile>,
    [data?.profile, draft],
  );
  /** The profile as it stands right now, including edits React has not re-rendered yet. */
  const live = () => ({ ...(data?.profile ?? {}), ...draftRef.current }) as Partial<OnboardingProfile>;

  if (isLoading || !data) return <Skeleton />;

  const current = index ?? Math.min(data.profile?.step ?? 0, STEPS.length - 1);
  const step = STEPS[current];
  const options = data.options;

  const set = (patch: Partial<OnboardingProfile>) => {
    draftRef.current = { ...draftRef.current, ...patch };
    setDraft(draftRef.current);
    save(patch);
    // Answering clears the complaint about that answer, rather than leaving a stale error
    // pointing at a field the client has just filled in.
    setMissing((m) => m.filter((f) => !(f in patch)));
  };

  const go = (to: number) => {
    const next = Math.max(0, Math.min(to, STEPS.length - 1));
    setIndex(next);
    // The resume point only ever moves FORWARD. Going back to check an answer must not undo it.
    if (next > (data.profile?.step ?? 0)) save({ step: next });
  };

  const submit = async () => {
    await flush(); // The last answer may still be inside the debounce window.
    try {
      await complete.mutateAsync();
      navigate('/', { replace: true });
    } catch (err) {
      // The server names the fields it is missing. Rather than showing that raw, jump the client
      // to the first step that can fix it — a list of field names is not an instruction.
      const text = err instanceof Error ? err.message : '';
      const fields = data.required.filter((f) => text.includes(f));
      setMissing(fields);
      const first = fields.map((f) => STEPS.indexOf(FIELD_STEP[f])).filter((i) => i >= 0).sort()[0];
      if (first !== undefined) setIndex(first);
    }
  };

  const equipment = profile.equipment ?? [];
  const limitations = profile.limitations ?? [];

  // Every one of these reads `live()` rather than the render's snapshot, because they are the
  // handlers a user can fire several of before React repaints.
  const toggleEquipment = (id: number) => {
    const now = live().equipment ?? [];
    set({ equipment: now.includes(id) ? now.filter((e) => e !== id) : [...now, id] });
  };

  const toggleArea = (area: string) => {
    const now = live().limitations ?? [];
    set({
      limitations: now.some((l) => l.body_area === area)
        ? now.filter((l) => l.body_area !== area)
        : [...now, { body_area: area, severity: 'caution', note: null } as Limitation],
    });
  };

  const setSeverity = (area: string, severity: Limitation['severity']) =>
    set({
      limitations: (live().limitations ?? []).map((l) => (l.body_area === area ? { ...l, severity } : l)),
    });

  const isLast = current === STEPS.length - 1;

  return (
    // `col-mobile`, not a bespoke form width: the questionnaire is a mobile-shaped flow and the
    // token for that already exists. This used to name a `--measure-form` token that was never
    // declared anywhere — it computed to `max-width: none`, so the form ran edge to edge on
    // desktop. `check-tokens` now rejects any reference that resolves to nothing.
    <div className="col-mobile screen-x flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-3">
        <p className="text-micro uppercase text-text-2">
          {t('onboarding.stepOf', { current: current + 1, total: STEPS.length })}
        </p>
        <h1 className="text-title-1 font-display">{t(`onboarding.step.${step}.title`)}</h1>
        <p className="text-body text-text-2">{t(`onboarding.step.${step}.body`)}</p>

        {/* Progress. `aria-valuetext` carries the same sentence the sighted user reads, so the
            bar is not an unlabelled percentage to a screen reader. */}
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={current + 1}
          aria-valuetext={t('onboarding.stepOf', { current: current + 1, total: STEPS.length })}
          className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)]"
            style={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex flex-col gap-4">
        {step === 'goal' ? (
          <div role="radiogroup" aria-label={t('onboarding.step.goal.title')} className="flex flex-col gap-2">
            {options.goals.map((g) => (
              <Choice
                key={g}
                selected={profile.primary_goal === g}
                label={t(`onboarding.goal.${g}`)}
                description={t(`onboarding.goalHint.${g}`)}
                onSelect={() => set({ primary_goal: g })}
              />
            ))}
          </div>
        ) : null}

        {step === 'schedule' ? (
          <>
            <div role="radiogroup" aria-label={t('onboarding.experience')} className="flex flex-col gap-2">
              <p className="text-title-3 text-text-1">{t('onboarding.experience')}</p>
              {options.experience.map((e) => (
                <Choice
                  key={e}
                  selected={profile.experience === e}
                  label={t(`onboarding.exp.${e}`)}
                  onSelect={() => set({ experience: e })}
                />
              ))}
            </div>
            <Field
              label={t('onboarding.sessionsPerWeek')}
              type="number"
              min={1}
              max={14}
              inputMode="numeric"
              value={profile.sessions_per_week ?? ''}
              error={missing.includes('sessions_per_week') ? t('onboarding.requiredField') : undefined}
              onChange={(e) => set({ sessions_per_week: e.target.value ? Number(e.target.value) : null })}
            />
            <Field
              label={t('onboarding.sessionMinutes')}
              hint={t('onboarding.sessionMinutesHint')}
              type="number"
              min={10}
              max={240}
              step={5}
              inputMode="numeric"
              value={profile.session_minutes ?? ''}
              onChange={(e) => set({ session_minutes: e.target.value ? Number(e.target.value) : null })}
            />
          </>
        ) : null}

        {step === 'equipment' ? (
          <>
            <div role="radiogroup" aria-label={t('onboarding.location')} className="flex flex-col gap-2">
              <p className="text-title-3 text-text-1">{t('onboarding.location')}</p>
              {options.locations.map((l) => (
                <Choice
                  key={l}
                  selected={profile.training_location === l}
                  label={t(`onboarding.loc.${l}`)}
                  onSelect={() => set({ training_location: l })}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-title-3 text-text-1">{t('onboarding.equipment')}</p>
              <p className="text-body-s text-text-2">{t('onboarding.equipmentHint')}</p>
              <div className="flex flex-wrap gap-2">
                {options.equipment.map((eq) => (
                  <Toggle
                    key={eq.id}
                    on={equipment.includes(eq.id)}
                    label={eq.name}
                    onToggle={() => toggleEquipment(eq.id)}
                  />
                ))}
              </div>
            </div>
          </>
        ) : null}

        {step === 'body' ? (
          <>
            <p className="text-body-s text-text-2">{t('onboarding.bodyOptional')}</p>
            <div role="radiogroup" aria-label={t('onboarding.units')} className="flex gap-2">
              {(['metric', 'imperial'] as const).map((u) => (
                <Pressable
                  key={u}
                  role="radio"
                  aria-checked={(profile.units ?? 'metric') === u}
                  variant={(profile.units ?? 'metric') === u ? 'primary' : 'secondary'}
                  shape="chip"
                  onClick={() => set({ units: u })}
                >
                  {t(`onboarding.unit.${u}`)}
                </Pressable>
              ))}
            </div>
            {/* Stored metric always; the imperial reader sees a converted view of one canonical
                number, so a value can never be converted twice. */}
            <Field
              label={t(profile.units === 'imperial' ? 'onboarding.heightIn' : 'onboarding.heightCm')}
              type="number"
              inputMode="decimal"
              value={
                profile.height_cm == null
                  ? ''
                  : profile.units === 'imperial'
                    ? Math.round(profile.height_cm / 2.54)
                    : profile.height_cm
              }
              onChange={(e) => {
                const raw = e.target.value ? Number(e.target.value) : null;
                set({ height_cm: raw == null ? null : profile.units === 'imperial' ? Math.round(raw * 2.54 * 10) / 10 : raw });
              }}
            />
            <Field
              label={t(profile.units === 'imperial' ? 'onboarding.weightLb' : 'onboarding.weightKg')}
              type="number"
              inputMode="decimal"
              value={
                profile.bodyweight_kg == null
                  ? ''
                  : profile.units === 'imperial'
                    ? Math.round(profile.bodyweight_kg * 2.20462 * 10) / 10
                    : profile.bodyweight_kg
              }
              onChange={(e) => {
                const raw = e.target.value ? Number(e.target.value) : null;
                set({ bodyweight_kg: raw == null ? null : profile.units === 'imperial' ? Math.round((raw / 2.20462) * 10) / 10 : raw });
              }}
            />
            <Field
              label={t('onboarding.birthYear')}
              type="number"
              inputMode="numeric"
              value={profile.birth_year ?? ''}
              onChange={(e) => set({ birth_year: e.target.value ? Number(e.target.value) : null })}
            />
            <div className="flex flex-col gap-2">
              <p className="text-title-3 text-text-1">{t('onboarding.sex')}</p>
              <p className="text-body-s text-text-2">{t('onboarding.sexHint')}</p>
              <div className="flex flex-wrap gap-2">
                {options.sex.map((s) => (
                  <Toggle key={s} on={profile.sex === s} label={t(`onboarding.sexOpt.${s}`)} onToggle={() => set({ sex: s })} />
                ))}
              </div>
            </div>
          </>
        ) : null}

        {step === 'limitations' ? (
          <>
            <p className="text-body-s text-text-2">{t('onboarding.limitationsHint')}</p>
            <div className="flex flex-wrap gap-2">
              {options.bodyAreas.map((a) => (
                <Toggle
                  key={a}
                  on={limitations.some((l) => l.body_area === a)}
                  label={t(`onboarding.area.${a}`)}
                  onToggle={() => toggleArea(a)}
                />
              ))}
            </div>
            {limitations.map((l) => (
              <div key={l.body_area} className="flex flex-col gap-2 rounded-card border border-[var(--surface-border)] bg-surface-1 p-3">
                <p className="text-body font-medium">{t(`onboarding.area.${l.body_area}`)}</p>
                <div role="radiogroup" aria-label={t(`onboarding.area.${l.body_area}`)} className="flex flex-wrap gap-2">
                  {options.severity.map((s) => (
                    <Pressable
                      key={s}
                      role="radio"
                      aria-checked={l.severity === s}
                      variant={l.severity === s ? 'primary' : 'secondary'}
                      shape="chip"
                      density="compact"
                      onClick={() => setSeverity(l.body_area, s as Limitation['severity'])}
                    >
                      {t(`onboarding.sev.${s}`)}
                    </Pressable>
                  ))}
                </div>
              </div>
            ))}
            <Field
              label={t('onboarding.notes')}
              hint={t('onboarding.notesHint')}
              value={profile.notes ?? ''}
              maxLength={2000}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </>
        ) : null}
      </main>

      <footer className="flex flex-col gap-3">
        <SaveState state={saveState} t={t} />
        <div className="flex items-center justify-between gap-3">
          {/* Back is always rendered, disabled on the first step, so the footer never reflows
              and the primary action does not move under the client's thumb. */}
          <Pressable
            variant="ghost"
            onClick={() => go(current - 1)}
            disabled={current === 0}
            icon={<ChevronLeft className="size-icon-s" aria-hidden />}
          >
            {t('common.back')}
          </Pressable>
          {isLast ? (
            <Pressable variant="primary" onClick={() => void submit()} busy={complete.isPending}>
              {t('onboarding.finish')}
            </Pressable>
          ) : (
            <Pressable variant="primary" onClick={() => go(current + 1)}>
              {t('common.next')}
            </Pressable>
          )}
        </div>
        {missing.length ? (
          <p role="alert" className="text-body-s text-danger">
            {t('onboarding.missing', { fields: missing.map((f) => t(`onboarding.field.${f}`)).join(', ') })}
          </p>
        ) : null}
      </footer>
    </div>
  );
}

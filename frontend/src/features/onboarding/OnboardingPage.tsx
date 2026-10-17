import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { cn } from '../../lib/cn';
import { Screen } from '../../ui/shell/Screen';
import { Dock } from '../../ui/shell/Dock';
import { Pic } from '../../ui/media/Pic';
import { StatBlock } from '../../ui/data/StatBlock';
import { Numeral } from '../../ui/data/Numeral';
import { SegmentBar } from '../../ui/data/SegmentBar';
import { Rule } from '../../ui/data/Rule';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Section, SectionHeader } from '../../ui/data/SectionHeader';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { TextArea } from '../../ui/primitives/TextArea';
import { NumberStepper } from '../../ui/primitives/NumberStepper';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { CheckMark } from '../../ui/primitives/CheckMark';
import {
  useOnboarding,
  useDraftSave,
  useCompleteOnboarding,
  type Limitation,
  type OnboardingProfile,
} from './useOnboarding';

/* ── the step definition ──────────────────────────────────────────────────────────────────── */
// Steps are data, not a switch statement, because two things have to agree with each other: the
// step bar's denominator and the "which step is unfinished" jump after a failed submit. A list
// keeps them from drifting.
const STEPS = ['goal', 'schedule', 'equipment', 'body', 'limitations'] as const;
type Step = (typeof STEPS)[number];

/** Which required answer lives on which step, so a rejected submit can point at the right one. */
const FIELD_STEP: Record<string, Step> = {
  primary_goal: 'goal',
  experience: 'schedule',
  sessions_per_week: 'schedule',
  training_location: 'equipment',
};

/* ── composition (Pulse: nothing is enclosed — rows on hairlines, words for chips) ─────────── */

/**
 * The hero stage of onboarding-1 / -2 / -3: the step as an instrument — the "5 lépésből" eyebrow
 * over the giant step numeral, 20 under it the five thin segments lit up to the current step — and
 * the plate stack on the right, its lit rim 16 past the content edge and 20 above the stage.
 *
 * The visible eyebrow and numeral are a picture of the progressbar's sentence ("2 / 5. lépés"),
 * so they are hidden from assistive tech; the segment bar carries the sentence as its name.
 */
function StepHero({ current, total, position, totalLabel }: { current: number; total: number; position: string; totalLabel: string }) {
  return (
    <div className="relative flex flex-col gap-5">
      <Pic slot="hero-plates" width={227} priority bleed className="pointer-events-none absolute -right-4 -top-5" />
      <div aria-hidden className="relative">
        <StatBlock label={totalLabel}>
          <Numeral size="giant" value={current} />
        </StatBlock>
      </div>
      <SegmentBar thin value={current} total={total} label={position} className="relative" />
    </div>
  );
}

/** The step's one question: the screen's h1 in `display-xl`, its body line 4 under it. */
function Question({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-display-xl text-text-1">{title}</h1>
      <p className="text-body text-text-2">{body}</p>
    </div>
  );
}

/**
 * A single choice as the frames draw it: rows on hairlines, the picked one in ink with the lime
 * tick, the others in `text-2` with the ring. Each row is ONE radio (one tab stop); the mark is
 * read as part of the row, never a second control. A hint under a label wraps, it is never cut.
 */
function ChoiceList<T extends string>({
  label,
  options,
  value,
  onSelect,
  title,
  sub,
  required = false,
  open = false,
}: {
  label: string;
  options: readonly T[];
  value: string | null | undefined;
  onSelect: (option: T) => void;
  title: (option: T) => string;
  sub?: (option: T) => string;
  required?: boolean;
  open?: boolean;
}) {
  return (
    <RowStack as="div" role="radiogroup" aria-label={label} aria-required={required || undefined} open={open} close>
      {options.map((option) => (
        <ListRow
          key={option}
          role="radio"
          aria-checked={value === option}
          tone={value === option ? 'default' : 'muted'}
          title={title(option)}
          sub={sub?.(option)}
          subLines={sub ? 2 : undefined}
          trailing={<CheckMark done={value === option} />}
          onClick={() => onSelect(option)}
        />
      ))}
    </RowStack>
  );
}

/**
 * A section whose answer is required: the eyebrow with the star in ink (onboarding-3 draws the last
 * character `text-1`, not lime — lime is not a warning). The star is `aria-hidden`; the requirement
 * is carried on the control (`aria-required`), because a screen reader announcing "star" is not an
 * instruction.
 */
function RequiredSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex w-full flex-col gap-group">
      <SectionHeader>
        <h2 id={id} className="text-eyebrow min-w-0 flex-1 text-text-2">
          {title}
          <span aria-hidden className="text-text-1">
            {' *'}
          </span>
        </h2>
      </SectionHeader>
      {children}
    </section>
  );
}

/**
 * The first paint, in the shape of the screen it stands in for: the hero stage (eyebrow, numeral,
 * the dark segment track), the question, and three option rows on hairlines. No spinner. Kept on
 * screen when the questionnaire cannot be read — as today, there is no error copy for it.
 */
function OnboardingSkeleton({ loading }: { loading: string }) {
  return (
    <Screen top="root" role="status" aria-busy="true">
      <span className="sr-only">{loading}</span>
      <div aria-hidden className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-25 w-14" />
        </div>
        <SegmentBar thin value={0} total={STEPS.length} />
      </div>
      <div aria-hidden className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <RowStack as="div" open close>
          <ListRowSkeleton sub index={0} />
          <ListRowSkeleton sub index={1} />
          <ListRowSkeleton sub index={2} />
        </RowStack>
      </div>
    </Screen>
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

  // `Skeleton` is the BLOCK — it carries no size of its own, so a bare `<Skeleton />` rendered a
  // 0 px nothing and the first paint of onboarding was a blank page. `ScreenSkeleton` is the
  // screen-shaped composition, which is what a full-page load branch needs.
  if (isLoading || !data) return <OnboardingSkeleton loading={t('common.loading')} />;

  const current = index ?? Math.min(data.profile?.step ?? 0, STEPS.length - 1);
  const step = STEPS[current];
  const options = data.options;
  const position = t('onboarding.stepOf', { current: current + 1, total: STEPS.length });

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

  /** The save line: the one of the three states the client has to act on is the error. */
  const saveLine =
    saveState === 'saving' ? (
      <NoticeLine tone="info" compact>
        {t('onboarding.saving')}
      </NoticeLine>
    ) : saveState === 'saved' ? (
      <NoticeLine tone="ok" compact>
        {t('onboarding.saved')}
      </NoticeLine>
    ) : saveState === 'error' ? (
      <NoticeLine tone="danger" compact>
        {t('onboarding.saveError')}
      </NoticeLine>
    ) : null;

  const question = <Question title={t(`onboarding.step.${step}.title`)} body={t(`onboarding.step.${step}.body`)} />;

  return (
    <Screen top="root">
      <StepHero
        current={current + 1}
        total={STEPS.length}
        position={position}
        totalLabel={t('onboarding.stepsTotal', { total: STEPS.length })}
      />

      {/* Step 1: the h1 IS the question, so the seven goals follow it in one group, 24 apart. */}
      {step === 'goal' ? (
        <div className="flex flex-col gap-6">
          {question}
          <ChoiceList
            label={t('onboarding.step.goal.title')}
            required
            open
            options={options.goals}
            value={profile.primary_goal}
            title={(g) => t(`onboarding.goal.${g}`)}
            sub={(g) => t(`onboarding.goalHint.${g}`)}
            onSelect={(g) => set({ primary_goal: g })}
          />
        </div>
      ) : null}

      {step === 'schedule' ? (
        <>
          {question}
          {/* Every experience level the SERVER sends is listed, `none` included. */}
          <RequiredSection title={t('onboarding.experience')}>
            <ChoiceList
              label={t('onboarding.experience')}
              required
              options={options.experience}
              value={profile.experience}
              title={(e) => t(`onboarding.exp.${e}`)}
              onSelect={(e) => set({ experience: e })}
            />
          </RequiredSection>
          <div className="flex flex-col gap-6">
            <NumberStepper
              id="onb-sessions-per-week"
              label={t('onboarding.sessionsPerWeek')}
              hint={t('onboarding.sessionsPerWeekHint')}
              value={profile.sessions_per_week ?? null}
              min={1}
              max={14}
              valid={profile.sessions_per_week != null && profile.sessions_per_week >= 1 && profile.sessions_per_week <= 14}
              error={missing.includes('sessions_per_week') ? t('onboarding.requiredField') : undefined}
              onChange={(n) => set({ sessions_per_week: n })}
              decreaseLabel={t('common.less')}
              increaseLabel={t('common.more')}
            />
            {/* `session_minutes` stays: the generator sizes the volume from it. */}
            <NumberStepper
              id="onb-session-minutes"
              label={t('onboarding.sessionMinutes')}
              hint={t('onboarding.sessionMinutesHint')}
              value={profile.session_minutes ?? null}
              min={10}
              max={240}
              step={5}
              valid={profile.session_minutes != null && profile.session_minutes >= 10 && profile.session_minutes <= 240}
              onChange={(n) => set({ session_minutes: n })}
              decreaseLabel={t('common.less')}
              increaseLabel={t('common.more')}
            />
          </div>
        </>
      ) : null}

      {step === 'equipment' ? (
        <>
          {question}
          <RequiredSection title={t('onboarding.location')}>
            <ChoiceList
              label={t('onboarding.location')}
              required
              options={options.locations}
              value={profile.training_location}
              title={(l) => t(`onboarding.loc.${l}`)}
              onSelect={(l) => set({ training_location: l })}
            />
          </RequiredSection>
          <Section title={t('onboarding.equipment')}>
            <div className="flex flex-col gap-1">
              <p className="text-cap text-text-2">{t('onboarding.equipmentHint')}</p>
              <ChipRow label={t('onboarding.equipment')} wrap>
                {options.equipment.map((eq) => (
                  <Chip key={eq.id} role="checkbox" selected={equipment.includes(eq.id)} onClick={() => toggleEquipment(eq.id)}>
                    {eq.name}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          </Section>
        </>
      ) : null}

      {step === 'body' ? (
        <>
          <div className="flex flex-col gap-6">
            {question}
            <p className="text-cap text-text-2">{t('onboarding.bodyOptional')}</p>
          </div>
          <Section title={t('onboarding.units')}>
            <ChoiceList
              label={t('onboarding.units')}
              options={['metric', 'imperial'] as const}
              value={profile.units ?? 'metric'}
              title={(u) => t(`onboarding.unit.${u}`)}
              onSelect={(u) => set({ units: u })}
            />
          </Section>
          {/* Stored metric always; the imperial reader sees a converted view of one canonical
              number, so a value can never be converted twice. */}
          <div className="flex flex-col gap-6">
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
          </div>
          <Section title={t('onboarding.sex')}>
            <p className="text-cap text-text-2">{t('onboarding.sexHint')}</p>
            <ChoiceList
              label={t('onboarding.sex')}
              options={options.sex}
              value={profile.sex}
              title={(s) => t(`onboarding.sexOpt.${s}`)}
              onSelect={(s) => set({ sex: s })}
            />
          </Section>
        </>
      ) : null}

      {step === 'limitations' ? (
        <>
          {/* The h1 asks this step's only question; the body areas follow it in one group. */}
          <div className="flex flex-col gap-6">
            {question}
            <div className="flex flex-col gap-4">
              <Rule strong />
              <div className="flex flex-col gap-1">
                <p className="text-cap text-text-2">{t('onboarding.limitationsHint')}</p>
                <ChipRow label={t('onboarding.step.limitations.title')} wrap>
                  {options.bodyAreas.map((a) => (
                    <Chip
                      key={a}
                      role="checkbox"
                      selected={limitations.some((l) => l.body_area === a)}
                      onClick={() => toggleArea(a)}
                    >
                      {t(`onboarding.area.${a}`)}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
            </div>
          </div>
          {/* One severity block per ticked area: the area as the eyebrow, a single choice of three. */}
          {limitations.map((l) => (
            <Section key={l.body_area} title={t(`onboarding.area.${l.body_area}`)}>
              <ChoiceList
                label={t(`onboarding.area.${l.body_area}`)}
                options={options.severity as readonly Limitation['severity'][]}
                value={l.severity}
                title={(s) => t(`onboarding.sev.${s}`)}
                onSelect={(s) => setSeverity(l.body_area, s)}
              />
            </Section>
          ))}
          <TextArea
            label={t('onboarding.notes')}
            hint={t('onboarding.notesHint')}
            value={profile.notes ?? ''}
            maxLength={2000}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </>
      ) : null}

      {/* The footer is docked over the tabs: the status line (its 20 pt always kept, so the pill
          never moves under a thumb), Vissza (always drawn, off on the first step) and the one
          lime pill, then — only after a refused "Kész" — the line that names what is missing. */}
      <Dock as="footer" className={cn('gap-5', missing.length ? 'pb-2' : undefined)}>
        {/* `polite`: a save confirmation must never interrupt someone mid-answer. */}
        <div aria-live="polite" className="min-h-5">
          {saveLine}
        </div>
        <div className="flex items-center gap-6">
          <TextLink text="body" onClick={() => go(current - 1)} disabled={current === 0}>
            {t('common.back')}
          </TextLink>
          {isLast ? (
            <Pressable variant="primary" size="lg" className="flex-1" onClick={() => void submit()} busy={complete.isPending}>
              {t('onboarding.finish')}
            </Pressable>
          ) : (
            <Pressable variant="primary" size="lg" className="flex-1" onClick={() => go(current + 1)}>
              {t('common.next')}
            </Pressable>
          )}
        </div>
        {missing.length ? (
          <NoticeLine tone="danger" compact role="alert">
            {t('onboarding.missing', { fields: missing.map((f) => t(`onboarding.field.${f}`)).join(', ') })}
          </NoticeLine>
        ) : null}
      </Dock>
    </Screen>
  );
}

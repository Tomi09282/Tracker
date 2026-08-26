import { useMemo, useRef, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Activity,
  BicepsFlexed,
  Cake,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  Dumbbell,
  Flame,
  HeartPulse,
  House,
  Loader2,
  MapPin,
  MessageSquare,
  Minus,
  Mountain,
  Plus,
  Ruler,
  Scale,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Sprout,
  Target,
  Timer,
  Trees,
  Trophy,
  User,
  Wrench,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { Surface } from '../../ui/primitives/Surface';
import { Gauge } from '../../ui/feedback/Gauge';
import { ScreenSkeleton } from '../../ui/feedback/ScreenSkeleton';
import {
  useOnboarding,
  useDraftSave,
  useCompleteOnboarding,
  type Limitation,
  type OnboardingProfile,
} from './useOnboarding';

/* ── the step definition ──────────────────────────────────────────────────────────────────── */
// Steps are data, not a switch statement, because two things have to agree with each other: the
// step ring's denominator and the "which step is unfinished" jump after a failed submit. A list
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

type Glyph = ComponentType<{ className?: string; strokeWidth?: number }>;

/*
 * ═══ ICONS ARE THE THING THAT MADE FIVE IDENTICAL PAGES SCANNABLE ══════════════════════════════
 *
 * Every option the server can send gets a glyph, and every map has a FALLBACK — the option lists
 * come from the API, so a new goal or a new body area added server-side must render as a card with
 * an icon holder rather than as a hole in the layout.
 */
const GOAL_ICON: Record<string, Glyph> = {
  strength: Dumbbell,
  muscle: BicepsFlexed,
  'fat-loss': Flame,
  endurance: HeartPulse,
  mobility: Activity,
  health: ShieldCheck,
  sport: Trophy,
};

const EXPERIENCE_ICON: Record<string, Glyph> = {
  none: Sparkles,
  beginner: Sprout,
  intermediate: ChartColumn,
  advanced: Mountain,
};

const LOCATION_ICON: Record<string, Glyph> = {
  gym: Dumbbell,
  home: House,
  outdoor: Trees,
  mixed: Shuffle,
};

/* ── small building blocks ────────────────────────────────────────────────────────────────── */

/**
 * The tinted glyph holder that sits in front of every group heading and every option card.
 *
 * A square rather than a circle, at exactly the 44px target size, so a holder and the control
 * beside it share one horizontal rhythm — and so nothing is ever tempted to make it pressable.
 */
function Holder({
  icon: Icon,
  tone = 'tint',
  className,
}: {
  icon: Glyph;
  tone?: 'tint' | 'quiet' | 'inverted';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-field',
        tone === 'tint' && 'bg-accent-subtle text-accent',
        tone === 'quiet' && 'bg-surface-2 text-accent',
        // On a selected (accent-filled) card the tint disappears into the fill, so the holder
        // inverts instead: the card's own foreground colour becomes the holder's background.
        tone === 'inverted' && 'bg-[var(--accent-fg)] text-[var(--accent)]',
        className,
      )}
    >
      <Icon className="size-icon-m" strokeWidth={2} />
    </span>
  );
}

/**
 * A question heading: glyph holder, the question, and an accent `*` when the answer is required.
 *
 * The `*` replaces a sentence. It is `aria-hidden` and the requirement is carried on the control
 * itself (`aria-required`), because a screen reader announcing "star" is not an instruction.
 */
function GroupHeading({
  icon,
  children,
  required = false,
}: {
  icon: Glyph;
  children: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-tight">
      <Holder icon={icon} />
      <h2 className="text-title-3 text-text-1">
        {children}
        {required ? (
          <span aria-hidden className="text-accent">
            {' *'}
          </span>
        ) : null}
      </h2>
    </div>
  );
}

/**
 * A single-choice option card. Rendered as a Pressable rather than a radio input so it inherits
 * the 44px floor and all five interaction states; the radio semantics are supplied explicitly.
 *
 * Selection is now signalled THREE ways — the inverted fill, the filled radio circle, and
 * `aria-checked` — where it used to be signalled by the fill alone. A fill is a colour difference,
 * and roughly one in twelve men cannot rely on one.
 */
function Choice({
  selected,
  label,
  description,
  icon,
  onSelect,
}: {
  selected: boolean;
  label: string;
  description?: string;
  icon: Glyph;
  onSelect: () => void;
}) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      variant={selected ? 'primary' : 'secondary'}
      shape="field"
      className="h-auto items-center gap-group py-2"
    >
      <Holder icon={icon} tone={selected ? 'inverted' : 'quiet'} />
      <span className="flex min-w-0 flex-col gap-tight py-1 text-left">
        <span className="text-body-strong">{label}</span>
        {description ? (
          <span className={cn('text-body-s', selected ? 'opacity-80' : 'text-text-2')}>
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          'ms-auto grid size-6 shrink-0 place-items-center rounded-full',
          'border-[length:var(--border-width)]',
          selected
            ? 'border-transparent bg-[var(--accent-fg)] text-[var(--accent)]'
            : 'border-[var(--surface-border-strong)]',
        )}
      >
        {selected ? <Check className="size-icon-s" strokeWidth={3} /> : null}
      </span>
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
 * A bounded number with `−` / `+` beside it.
 *
 * The steppers sit OUTSIDE the field rather than inside its trailing slot — which is what the
 * light mockup shows, and what `Field` can actually express today: its `trailing` slot holds one
 * glyph, not two 44px controls. The validity tick is what goes in the trailing slot, and it means
 * exactly one thing: the number is inside the bounds this field declares. It is not a claim that
 * the answer is a good one.
 *
 * `Field` needs a real numeric variant for this (see the screen note); until it has one, this is
 * the composition, not a second field implementation.
 */
function NumberRow({
  id,
  label,
  hint,
  icon: Icon,
  value,
  min,
  max,
  step = 1,
  required = false,
  error,
  onChange,
  decLabel,
  incLabel,
}: {
  id: string;
  label: string;
  hint?: string;
  icon: Glyph;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  required?: boolean;
  error?: string;
  onChange: (next: number | null) => void;
  decLabel: string;
  incLabel: string;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const valid = value != null && value >= min && value <= max;
  const nudge = (by: number) => {
    const base = value ?? min;
    onChange(Math.min(max, Math.max(min, base + by)));
  };

  return (
    <div className="flex flex-col gap-tight">
      <div className="flex items-end gap-tight">
        <Field
          id={id}
          className="flex-1"
          label={label}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          leading={<Icon className="size-icon-m" />}
          aria-required={required || undefined}
          // Field derives `aria-describedby` from its own `hint` prop, and the hint lives outside
          // this component so the steppers can bottom-align with the input instead of with a line
          // of helper text. Pointing at the ids by hand is what keeps the wiring intact.
          // The hint element below is swapped out by the error, exactly as `Field` does it, so the
          // description must point at whichever one is actually on the page.
          aria-describedby={(error ? errorId : hint && hintId) || undefined}
          value={value ?? ''}
          error={error}
          trailing={
            valid ? (
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-success text-on-success">
                <Check className="size-icon-s" strokeWidth={3} />
              </span>
            ) : undefined
          }
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        />
        {/* `rounded-field`, not `shape="icon"`'s `rounded-chip`: --radius-chip is --radius-full,
            so the steppers rendered as two circles beside a rounded-rectangle input. The three
            boxes are one row of controls and the mockup draws them with one corner radius.
            `shape="icon"` still supplies the square 44×44 min-width. */}
        <Pressable
          shape="icon"
          variant="secondary"
          className="rounded-field"
          aria-label={decLabel}
          disabled={value != null && value <= min}
          onClick={() => nudge(-step)}
        >
          <Minus className="size-icon-m" aria-hidden />
        </Pressable>
        <Pressable
          shape="icon"
          variant="secondary"
          className="rounded-field"
          aria-label={incLabel}
          disabled={value != null && value >= max}
          onClick={() => nudge(step)}
        >
          <Plus className="size-icon-m" aria-hidden />
        </Pressable>
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-caption text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The save indicator.
 *
 * It exists because auto-save without feedback is indistinguishable from not saving: the client
 * closes the tab believing they lost the form. The redesign took this line out of the layout; it
 * comes back, because the ERROR is the one of the three states the user has to act on and a form
 * that says nothing while failing to save is the exact defect the indicator was built for.
 *
 * The row reserves its height whether or not anything is in it, so the footer never reflows and
 * the primary action never moves under a thumb that is already travelling towards it.
 */
function SaveState({
  state,
  t,
}: {
  state: 'idle' | 'saving' | 'saved' | 'error';
  t: (k: string) => string;
}) {
  const map = {
    idle: null,
    saving: {
      icon: <Loader2 className="size-icon-s animate-spin" aria-hidden />,
      text: t('onboarding.saving'),
      tone: 'text-text-2',
    },
    saved: {
      icon: <Check className="size-icon-s" aria-hidden />,
      text: t('onboarding.saved'),
      tone: 'text-success',
    },
    error: {
      icon: <CloudOff className="size-icon-s" aria-hidden />,
      text: t('onboarding.saveError'),
      tone: 'text-danger',
    },
  }[state];

  return (
    // `polite`, not `assertive`: a save confirmation must never interrupt someone mid-answer.
    <p
      className={cn('flex min-h-5 items-center gap-tight text-body-s', map?.tone)}
      aria-live="polite"
    >
      {map?.icon}
      {map?.text}
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

  // `Skeleton` is the BLOCK — it carries no size of its own, so a bare `<Skeleton />` rendered a
  // 0 px nothing and the first paint of onboarding was a blank page. `ScreenSkeleton` is the
  // screen-shaped composition, which is what a full-page load branch needs.
  if (isLoading || !data) return <ScreenSkeleton />;

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

  return (
    // `col-mobile`, not a bespoke form width: the questionnaire is a mobile-shaped flow and the
    // token for that already exists. This used to name a `--measure-form` token that was never
    // declared anywhere — it computed to `max-width: none`, so the form ran edge to edge on
    // desktop. `check-tokens` now rejects any reference that resolves to nothing.
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      {/* ── the anchor ────────────────────────────────────────────────────────────────────────
          A ring, because five steps is a countable goal with a known denominator — which is the
          one thing a ring is for. It replaces a 1px bar stating a proportion nobody reads and a
          caption stating a position nobody saw: two weak signals collapsed into one strong one.

          The bar carried `role="progressbar"` with an `aria-valuetext` reading the same sentence
          the sighted user sees. ALL OF IT IS INHERITED HERE. Drop it and a screen-reader user gets
          five identical unlabelled pages. */}
      <header className="flex flex-col items-center gap-tight">
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={current + 1}
          aria-valuetext={position}
        >
          <Gauge value={(current + 1) / STEPS.length} label={position} className="size-40">
            {/* `aria-hidden`: the sentence is on the progressbar above, and a screen reader
                reading "2" then "5 lépésből" then "2 / 5. lépés" says one fact three times.
                The caption is a WORD, not a denominator — `/ 5` hung a fraction off a numeral
                with no numerator beside it, which is not what the ring is saying. */}
            <span aria-hidden className="flex flex-col items-center leading-none">
              <span className="text-timer tabular-nums text-text-1">{current + 1}</span>
              <span className="text-body-s mt-1 text-text-2">
                {t('onboarding.stepsTotal', { total: STEPS.length })}
              </span>
            </span>
          </Gauge>
        </div>

        {/* No `stepOf` caption and no bar: the ring says both. The title is the screen's h1 and
            the largest type under the anchor. */}
        <h1 className="text-display font-display mt-2 text-center text-text-1">
          {t(`onboarding.step.${step}.title`)}
        </h1>
        <p className="text-body measure text-center text-text-2">{t(`onboarding.step.${step}.body`)}</p>
      </header>

      <main className="flex flex-col gap-section">
        {/* No group heading on this step: the h1 above IS the question, and repeating it under an
            icon holder would be the same sentence twice. The mockup's step has a title and a
            separate question; this one does not. */}
        {step === 'goal' ? (
          <div
            role="radiogroup"
            aria-label={t('onboarding.step.goal.title')}
            aria-required
            className="flex flex-col gap-tight"
          >
            {options.goals.map((g) => (
              <Choice
                key={g}
                selected={profile.primary_goal === g}
                icon={GOAL_ICON[g] ?? Target}
                label={t(`onboarding.goal.${g}`)}
                description={t(`onboarding.goalHint.${g}`)}
                onSelect={() => set({ primary_goal: g })}
              />
            ))}
          </div>
        ) : null}

        {step === 'schedule' ? (
          <>
            <div className="flex flex-col gap-group">
              <GroupHeading icon={Timer} required>
                {t('onboarding.experience')}
              </GroupHeading>
              <div
                role="radiogroup"
                aria-label={t('onboarding.experience')}
                aria-required
                className="flex flex-col gap-tight"
              >
                {/* Every experience level the SERVER sends is rendered, `none` included. The
                    mockup shows three cards; that is a demonstration of the card shape, not
                    permission to delete an answer that sizes an untrained person's first plan. */}
                {options.experience.map((e) => (
                  <Choice
                    key={e}
                    selected={profile.experience === e}
                    icon={EXPERIENCE_ICON[e] ?? Sprout}
                    label={t(`onboarding.exp.${e}`)}
                    onSelect={() => set({ experience: e })}
                  />
                ))}
              </div>
            </div>

            {/* The mockup puts a calendar holder in a heading ABOVE a label-less numeric field.
                `Field` always renders its label — correctly, placeholder-only labelling vanishes
                the moment you type — so the glyph goes in the field's own `leading` slot instead
                of into a heading that would repeat the label word for word. */}
            <NumberRow
              id="onb-sessions-per-week"
              label={t('onboarding.sessionsPerWeek')}
              // Its OWN hint, not `sessionMinutesHint` — that one now belongs to the field below,
              // and DESIGN §6.5 asks every personal question to name what the answer is for
              // before the eye moves on. The field had nothing under it at all.
              hint={t('onboarding.sessionsPerWeekHint')}
              icon={CalendarDays}
              value={profile.sessions_per_week ?? null}
              min={1}
              max={14}
              required
              error={missing.includes('sessions_per_week') ? t('onboarding.requiredField') : undefined}
              onChange={(n) => set({ sessions_per_week: n })}
              decLabel={t('common.less')}
              incLabel={t('common.more')}
            />

            {/* `session_minutes` STAYS. The mockup drops it, but it is what the generator uses to
                size volume, and a silently-defaulted number that shapes somebody's plan is worse
                than one more field. */}
            <NumberRow
              id="onb-session-minutes"
              label={t('onboarding.sessionMinutes')}
              hint={t('onboarding.sessionMinutesHint')}
              icon={Clock}
              value={profile.session_minutes ?? null}
              min={10}
              max={240}
              step={5}
              onChange={(n) => set({ session_minutes: n })}
              decLabel={t('common.less')}
              incLabel={t('common.more')}
            />
          </>
        ) : null}

        {step === 'equipment' ? (
          <>
            <div className="flex flex-col gap-group">
              <GroupHeading icon={MapPin} required>
                {t('onboarding.location')}
              </GroupHeading>
              <div
                role="radiogroup"
                aria-label={t('onboarding.location')}
                aria-required
                className="flex flex-col gap-tight"
              >
                {options.locations.map((l) => (
                  <Choice
                    key={l}
                    selected={profile.training_location === l}
                    icon={LOCATION_ICON[l] ?? Dumbbell}
                    label={t(`onboarding.loc.${l}`)}
                    onSelect={() => set({ training_location: l })}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-group">
              <GroupHeading icon={Wrench}>{t('onboarding.equipment')}</GroupHeading>
              <p className="text-body-s text-text-2">{t('onboarding.equipmentHint')}</p>
              <div className="flex flex-wrap gap-tight">
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

            <div className="flex flex-col gap-group">
              <GroupHeading icon={Ruler}>{t('onboarding.units')}</GroupHeading>
              <div role="radiogroup" aria-label={t('onboarding.units')} className="flex gap-tight">
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
            </div>

            {/* Stored metric always; the imperial reader sees a converted view of one canonical
                number, so a value can never be converted twice. Each field carries its glyph in
                the `leading` slot rather than under a heading that would repeat its label. */}
            <div className="flex flex-col gap-group">
              <Field
                label={t(profile.units === 'imperial' ? 'onboarding.heightIn' : 'onboarding.heightCm')}
                type="number"
                inputMode="decimal"
                leading={<Ruler className="size-icon-m" />}
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
                leading={<Scale className="size-icon-m" />}
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
                leading={<Cake className="size-icon-m" />}
                value={profile.birth_year ?? ''}
                onChange={(e) => set({ birth_year: e.target.value ? Number(e.target.value) : null })}
              />
            </div>

            <div className="flex flex-col gap-group">
              <GroupHeading icon={User}>{t('onboarding.sex')}</GroupHeading>
              <p className="text-body-s text-text-2">{t('onboarding.sexHint')}</p>
              <div className="flex flex-wrap gap-tight">
                {options.sex.map((s) => (
                  <Toggle key={s} on={profile.sex === s} label={t(`onboarding.sexOpt.${s}`)} onToggle={() => set({ sex: s })} />
                ))}
              </div>
            </div>
          </>
        ) : null}

        {step === 'limitations' ? (
          <>
            {/* The h1 above already asks this step's only question, so there is no group heading
                to add without saying it twice. */}
            <div className="flex flex-col gap-group">
              <p className="text-body-s text-text-2">{t('onboarding.limitationsHint')}</p>
              <div className="flex flex-wrap gap-tight">
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
                <Surface key={l.body_area} className="flex flex-col gap-tight">
                  <p className="text-body-strong">{t(`onboarding.area.${l.body_area}`)}</p>
                  <div
                    role="radiogroup"
                    aria-label={t(`onboarding.area.${l.body_area}`)}
                    className="flex flex-wrap gap-tight"
                  >
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
                </Surface>
              ))}
            </div>

            <Field
              label={t('onboarding.notes')}
              hint={t('onboarding.notesHint')}
              leading={<MessageSquare className="size-icon-m" />}
              value={profile.notes ?? ''}
              maxLength={2000}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </>
        ) : null}
      </main>

      <footer className="flex flex-col gap-group">
        <SaveState state={saveState} t={t} />
        {/* The two buttons SPLIT the row — `flex-1` each, one gap between them, which is why
            `justify-between` is gone: at content width they were two ~110px pills pinned to
            opposite edges of a 390px screen with 150px of dead space in the middle, so the pair
            read as two unrelated controls and the primary was a small corner target. */}
        <div className="flex items-center gap-group">
          {/* Back is always rendered, disabled on the first step, so the footer never reflows
              and the primary action does not move under the client's thumb. It is OUTLINED
              rather than ghost: the two buttons in this row are a pair, and a ghost against a
              filled accent reads as one button and one label. */}
          <Pressable
            variant="secondary"
            className="flex-1"
            onClick={() => go(current - 1)}
            disabled={current === 0}
            icon={<ChevronLeft className="size-icon-s" aria-hidden />}
          >
            {t('common.back')}
          </Pressable>
          {isLast ? (
            <Pressable
              variant="primary"
              className="flex-1"
              onClick={() => void submit()}
              busy={complete.isPending}
            >
              {t('onboarding.finish')}
            </Pressable>
          ) : (
            <Pressable variant="primary" className="flex-1" onClick={() => go(current + 1)}>
              {t('common.next')}
              <ChevronRight className="size-icon-s" aria-hidden />
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

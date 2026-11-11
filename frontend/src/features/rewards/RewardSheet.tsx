import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Field } from '../../ui/primitives/Field';
import { TextArea } from '../../ui/primitives/TextArea';
import { Pressable } from '../../ui/primitives/Pressable';
import { cn } from '../../lib/cn';
import type { Reward, RewardCreate, RewardPatch } from '../../lib/lifeos-api';
import { newClientKey, useCreateReward, usePatchReward } from './rewardsApi';
import { coinsOf } from './RewardRow';

/**
 * "Új jutalom" / "Jutalom szerkesztése" — frame `lifeos/reward-form` (design round B, Figma
 * 189:952): the kit bottom sheet over the dimmed Jutalmak page.
 *
 * Composition, as `reward-form.part.js`: Név (the underline field, focused on a new reward) ·
 * Leírás · Ár (érme) with f_app's price hint · Beváltható as the equal-cell switch (Többször /
 * Egyszer) under its cap-m label · "Pihenő két beváltás között": the figure with "nap" on the left,
 * the bare 44 pt − and + on the right, the underline under the line and the hint "0 = nincs
 * korlát" (the line is left out when Egyszer: a one-time reward has no pihenő) · the sheet's pill
 * (the screen's one lime pill): Létrehozás, or Mentés when editing.
 *
 * Leírás is the kit TextArea (one 44 pt line that grows): the server keeps 280 characters that may
 * span lines. Undrawn cases, in the same language (f_app `app/reward/[id].tsx`): a field out of
 * range says so in danger under itself; a refused or failed write keeps the sheet open with the
 * danger dot, "Újra" and one line.
 */

const NAME_MAX = 80;
const DESCRIPTION_MAX = 280;
/** api.md: a reward costs 1..10000 whole coins; the pihenő is 0..365 logical days. */
const COST_MAX = 10000;
const COOLDOWN_MAX = 365;

interface FormState {
  name: string;
  description: string;
  cost: string;
  repeatable: boolean;
  cooldownDays: number;
}

function initial(reward?: Reward): FormState {
  if (reward) {
    return {
      name: reward.name,
      description: reward.description ?? '',
      cost: String(coinsOf(reward.costMinor)),
      repeatable: reward.repeatable,
      cooldownDays: reward.cooldownDays ?? 0,
    };
  }
  return { name: '', description: '', cost: '', repeatable: true, cooldownDays: 0 };
}

export interface RewardSheetProps {
  open: boolean;
  onClose: () => void;
  /** Edit this reward; without it the sheet creates one. */
  reward?: Reward;
}

export function RewardSheet({ open, onClose, reward }: RewardSheetProps) {
  const { t } = useTranslation();
  const create = useCreateReward();
  const patch = usePatchReward();
  const [form, setForm] = useState<FormState>(() => initial(reward));
  const [tried, setTried] = useState(false);
  // One idempotency key per opened sheet: a retried create answers the first reward, never a second.
  const clientKey = useRef(newClientKey('w'));
  const nameRef = useRef<HTMLInputElement>(null);
  const editing = reward !== undefined;
  const write = editing ? patch : create;

  useEffect(() => {
    if (!open) return;
    setForm(initial(reward));
    setTried(false);
    create.reset();
    patch.reset();
    clientKey.current = newClientKey('w');
    // The new reward's name is where the frame puts the caret.
    if (!reward) window.setTimeout(() => nameRef.current?.focus(), 0);
    // Reset only when the sheet opens (or opens on another reward), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reward?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Validation (the server's bounds, api.md POST /rewards); shown once the user tried to save.
  const name = form.name.trim();
  const description = form.description.trim();
  const cost = /^\d{1,5}$/.test(form.cost.trim()) ? Number(form.cost) : null;
  const errors = {
    name: name.length === 0 ? t('rewards.form.nameRequired') : undefined,
    cost: cost === null || cost < 1 ? t('rewards.form.costMin') : cost > COST_MAX ? t('rewards.form.costMax', { count: COST_MAX }) : undefined,
  };
  const valid = errors.name === undefined && errors.cost === undefined;
  const shown = (e: string | undefined) => (tried ? e : undefined);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!valid || cost === null || write.isPending) return;
    const fields = {
      name: name.slice(0, NAME_MAX),
      description: description ? form.description.slice(0, DESCRIPTION_MAX) : null,
      cost,
      repeatable: form.repeatable,
      // A one-time reward has no pihenő (the server refuses one); 0 = no limit.
      cooldownDays: form.repeatable && form.cooldownDays > 0 ? form.cooldownDays : null,
    };
    const done = { onSuccess: () => onClose() };
    if (editing) {
      const body: RewardPatch = fields;
      patch.mutate({ id: reward.id, patch: body }, done);
    } else {
      const body: RewardCreate = { clientKey: clientKey.current, ...fields };
      create.mutate(body, done);
    }
  };

  // Every refusal (the live cap, a zone not set yet, a one-time switch after repeat redemptions)
  // and every failure: one line, the sheet stays.
  const failure = write.isError ? t('rewards.failed') : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? t('rewards.form.editTitle') : t('rewards.new')}
      status={write.isPending ? 'busy' : write.isError ? 'error' : 'idle'}
      onRetry={write.isError ? () => submit() : undefined}
    >
      <form noValidate onSubmit={submit} className="flex w-full flex-col gap-4">
        <Field
          ref={nameRef}
          label={t('rewards.form.name')}
          value={form.name}
          maxLength={NAME_MAX}
          enterKeyHint="next"
          error={shown(errors.name)}
          onChange={(e) => set('name', e.target.value)}
        />
        <TextArea
          label={t('rewards.form.description')}
          value={form.description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => set('description', e.target.value)}
        />
        <Field
          label={t('rewards.form.cost')}
          inputMode="numeric"
          value={form.cost}
          hint={t('rewards.form.costHint')}
          error={shown(errors.cost)}
          onChange={(e) => set('cost', e.target.value.replace(/\D/g, '').slice(0, 5))}
        />

        <div className="flex w-full flex-col gap-2">
          <span aria-hidden className="text-cap-m text-text-2">
            {t('rewards.form.repeatable')}
          </span>
          <Segmented
            layout="cells"
            label={t('rewards.form.repeatable')}
            options={[
              { value: 'many', label: t('rewards.form.many') },
              { value: 'once', label: t('rewards.form.once') },
            ]}
            value={form.repeatable ? 'many' : 'once'}
            onChange={(v) => set('repeatable', v === 'many')}
          />
        </div>

        {form.repeatable ? (
          <CooldownLine value={form.cooldownDays} onChange={(n) => set('cooldownDays', n)} />
        ) : null}

        {failure ? (
          <NoticeLine tone="danger" role="alert">
            {failure}
          </NoticeLine>
        ) : null}

        <Pressable variant="primary" size="lg" type="submit" className="w-full" busy={write.isPending}>
          {editing ? t('common.save') : t('rewards.form.create')}
        </Pressable>
      </form>
    </Sheet>
  );
}

/**
 * "Pihenő két beváltás között" — the frame's own stepper line (`reward-form.part.js`: the cap-m
 * label; a 44 pt line with the figure (data-l) and "nap" (cap) on the left and the bare 44 pt − and
 * + on the right; the 1 pt edge underline at its foot; the hint 8 under it).
 *
 * It is NOT the kit's `NumberStepper`, which is the onboarding field (48 pt display figure); the
 * frame composes this one from kit parts, as admin Szabályok' rule stepper does. The figure is a
 * spinbutton: ArrowUp / ArrowDown step it, PageUp / PageDown by seven, Home / End jump to the
 * bounds; − and + keep the focus where it is and are disabled at the bounds.
 */
function CooldownLine({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const { t } = useTranslation();
  const set = (next: number) => onChange(Math.min(COOLDOWN_MAX, Math.max(0, next)));
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  const onKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    const by: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 7, PageDown: -7 };
    if (e.key in by) set(value + (by[e.key] ?? 0));
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(COOLDOWN_MAX);
    else return;
    e.preventDefault();
  };
  const glyph = '[&_svg]:size-5 [&_svg]:stroke-2';
  const unit = t('rewards.form.days');
  return (
    <div className="flex w-full flex-col">
      <span id="reward-cooldown-label" className="text-cap-m text-text-2">
        {t('rewards.form.cooldown')}
      </span>
      <div className="flex h-11 w-full items-center justify-between border-b border-edge">
        <span
          role="spinbutton"
          tabIndex={0}
          aria-labelledby="reward-cooldown-label"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={COOLDOWN_MAX}
          aria-valuetext={value === 0 ? t('rewards.noLimit') : `${value} ${unit}`}
          aria-describedby="reward-cooldown-hint"
          onKeyDown={onKey}
          className={cn(
            'flex items-baseline gap-1 rounded-2',
            'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          )}
        >
          <span className="text-data-l text-text-1">{value}</span>
          <span className="text-cap text-text-2">{unit}</span>
        </span>
        <span className="flex items-center">
          <Pressable variant="link" shape="icon" aria-label={t('common.less')} disabled={value <= 0} onPointerDown={keepFocus} onClick={() => set(value - 1)} className={glyph}>
            <Minus aria-hidden />
          </Pressable>
          <Pressable
            variant="link"
            shape="icon"
            aria-label={t('common.more')}
            disabled={value >= COOLDOWN_MAX}
            onPointerDown={keepFocus}
            onClick={() => set(value + 1)}
            className={glyph}
          >
            <Plus aria-hidden />
          </Pressable>
        </span>
      </div>
      <p id="reward-cooldown-hint" className="pt-2 text-cap text-text-3">
        {t('rewards.form.cooldownHint')}
      </p>
    </div>
  );
}
